import type { Express, Request, Response } from 'express';
import type { ModuleContext } from '@sam/core';
import { resolve as resolvePath, join as joinPath } from 'node:path';
import { createReadStream, statSync } from 'node:fs';
import type { UnterschriftenlistenOptions } from './options.js';
import type { SnapshotRow, RuecklaufRow, SnapshotInput, RuecklaufUpdate, Vote } from './types.js';

function parseId(raw: string | undefined): number | null {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const HASH_RX = /^[a-f0-9]{16,64}$/i;

export function registerUnterschriftenlistenApi(
  app: Express,
  ctx: ModuleContext,
  opts: UnterschriftenlistenOptions,
): void {
  const { authenticated, requirePermission } = ctx.middleware;
  const read = requirePermission(opts.permissionKey, 'read');
  const write = requirePermission(opts.permissionKey, 'write');

  // ── Public verification (JSON) ─────────────────────────────────
  app.get('/api/unterschriftenliste/verify-json', async (req, res) => {
    const claimed = String(req.query.hash ?? '');
    if (!HASH_RX.test(claimed)) return res.status(400).json({ error: 'Bad hash' });
    try {
      const r = await ctx.db.query<SnapshotRow>(
        'SELECT * FROM unterschriftenliste_snapshots WHERE hash = $1',
        [claimed],
      );
      if (r.rowCount === 0) return res.status(404).json({ error: 'No such snapshot' });
      const s = r.rows[0]!;
      ctx.db.query(
        'UPDATE unterschriftenliste_snapshots SET download_count = download_count + 1 WHERE hash = $1',
        [claimed],
      ).catch(() => undefined);
      res.json({
        valid: true,
        hash: s.hash,
        stweg_nr: s.stweg_nr,
        datum: s.datum,
        anlass_titel: s.anlass_titel,
        snapshot: s.snapshot_data,
        generated_at: s.generated_at,
      });
    } catch (err) {
      ctx.logger.error('[unterschriftenlisten] verify failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Public PDF download (hash is the auth token) ───────────────
  app.get('/api/unterschriftenliste/snapshot/:hash.pdf', async (req, res) => {
    const hash = req.params.hash ?? '';
    if (!HASH_RX.test(hash)) return res.status(400).json({ error: 'Bad hash' });
    if (!opts.pdfRoot) return res.status(404).json({ error: 'PDF storage not configured' });
    try {
      const r = await ctx.db.query<SnapshotRow>(
        'SELECT pdf_path, datum, stweg_nr FROM unterschriftenliste_snapshots WHERE hash = $1',
        [hash],
      );
      const s = r.rows[0];
      if (!s || !s.pdf_path) return res.status(404).json({ error: 'PDF not found' });
      const fullPath = resolvePath(joinPath(opts.pdfRoot, s.pdf_path));
      if (!fullPath.startsWith(resolvePath(opts.pdfRoot))) {
        return res.status(400).json({ error: 'Bad path' });
      }
      try {
        statSync(fullPath);
      } catch {
        return res.status(404).json({ error: 'PDF file missing on disk' });
      }
      const inline = req.query.preview === '1';
      const filename = `unterschriftenliste-stweg${s.stweg_nr}-${String(s.datum).slice(0, 10)}-${hash}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      );
      ctx.db.query(
        'UPDATE unterschriftenliste_snapshots SET download_count = download_count + 1 WHERE hash = $1',
        [hash],
      ).catch(() => undefined);
      createReadStream(fullPath).pipe(res);
    } catch (err) {
      ctx.logger.error('[unterschriftenlisten] pdf failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Admin: list snapshots ──────────────────────────────────────
  app.get('/api/unterschriftenliste/history', authenticated, read, async (_req, res) => {
    try {
      const r = await ctx.db.query<SnapshotRow>(
        `SELECT hash, stweg_nr, datum, anlass_titel, generated_by, download_count, generated_at
           FROM unterschriftenliste_snapshots
          ORDER BY generated_at DESC
          LIMIT 200`,
      );
      res.json({ snapshots: r.rows });
    } catch (err) {
      ctx.logger.error('[unterschriftenlisten] history failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Admin: persist a snapshot (called after PDF generation) ────
  app.post('/api/unterschriftenliste', authenticated, write, async (req, res) => {
    const b = req.body as SnapshotInput;
    if (!b.hash || !b.stweg_nr || !b.datum || !b.anlass_titel || b.snapshot_data === undefined) {
      return res.status(400).json({ error: 'hash + stweg_nr + datum + anlass_titel + snapshot_data required' });
    }
    if (!HASH_RX.test(b.hash)) return res.status(400).json({ error: 'Bad hash' });
    const client = await ctx.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO unterschriftenliste_snapshots
           (hash, stweg_nr, datum, anlass_titel, snapshot_data, pdf_path, generated_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
         ON CONFLICT (hash) DO UPDATE
           SET download_count = unterschriftenliste_snapshots.download_count + 1`,
        [
          b.hash,
          b.stweg_nr,
          b.datum,
          b.anlass_titel,
          JSON.stringify(b.snapshot_data),
          b.pdf_path ?? null,
          b.generated_by ?? null,
        ],
      );
      // Seed rückläufe rows for the listed letters
      if (b.briefe && b.briefe.length > 0) {
        await client.query(
          'DELETE FROM unterschriftenliste_rueckläufe WHERE snapshot_hash = $1',
          [b.hash],
        );
        for (const brief of b.briefe) {
          await client.query(
            `INSERT INTO unterschriftenliste_rueckläufe
               (snapshot_hash, brief_idx, brief_typ, einheit, empfaenger_name, empfaenger_adresse)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              b.hash,
              brief.brief_idx,
              brief.brief_typ ?? 'einzel',
              brief.einheit ?? null,
              brief.empfaenger_name ?? null,
              brief.empfaenger_adresse ?? null,
            ],
          );
        }
      }
      await client.query('COMMIT');
      res.status(201).json({ hash: b.hash });
    } catch (err) {
      await client.query('ROLLBACK');
      ctx.logger.error('[unterschriftenlisten] create failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    } finally {
      client.release();
    }
  });

  // ── Rücklauf-Checkliste read ───────────────────────────────────
  app.get('/api/unterschriftenliste/:hash/rueckläufe', authenticated, read, async (req, res) => {
    const hash = req.params.hash ?? '';
    if (!HASH_RX.test(hash)) return res.status(400).json({ error: 'Bad hash' });
    try {
      const snap = await ctx.db.query<SnapshotRow>(
        `SELECT hash, stweg_nr, datum, anlass_titel, generated_at
           FROM unterschriftenliste_snapshots WHERE hash = $1`,
        [hash],
      );
      if (snap.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      const list = await ctx.db.query<RuecklaufRow>(
        `SELECT * FROM unterschriftenliste_rueckläufe
          WHERE snapshot_hash = $1 ORDER BY brief_idx`,
        [hash],
      );
      res.json({ snapshot: snap.rows[0], briefe: list.rows });
    } catch (err) {
      ctx.logger.error('[unterschriftenlisten] rueckläufe-list failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Rücklauf-Checkliste update one row ─────────────────────────
  app.put('/api/unterschriftenliste/:hash/rueckläufe/:idx', authenticated, write, async (req, res) => {
    const hash = req.params.hash ?? '';
    const idx = parseId(req.params.idx);
    if (!HASH_RX.test(hash) || idx === null) return res.status(400).json({ error: 'Bad params' });
    const b = req.body as RuecklaufUpdate;
    const validVotes: Vote[] = ['ja', 'nein', 'enthaltung'];
    if (b.vote !== undefined && b.vote !== null && !validVotes.includes(b.vote)) {
      return res.status(400).json({ error: 'Bad vote' });
    }
    try {
      const r = await ctx.db.query<RuecklaufRow>(
        `UPDATE unterschriftenliste_rueckläufe
            SET retourniert_am = $1::timestamptz,
                vote           = $2,
                notiz          = $3,
                updated_at     = NOW()
          WHERE snapshot_hash = $4 AND brief_idx = $5
          RETURNING *`,
        [b.retourniert_am ?? null, b.vote ?? null, b.notiz ?? null, hash, idx],
      );
      if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      res.json(r.rows[0]);
    } catch (err) {
      ctx.logger.error('[unterschriftenlisten] rueckläufe-update failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });
}
