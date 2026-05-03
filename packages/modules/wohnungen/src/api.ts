import type { Express, Request, Response } from 'express';
import type { ModuleContext } from '@sam/core';
import { loadWohnungMitKontakte } from './load.js';
import { saveKontakte } from './kontakte.js';
import type { WohnungRow, KontaktInput, BewohntVon } from './types.js';
import type { WohnungenOptions } from './options.js';

/** Validate the :stweg param against the configured stwegen list. */
function parseStwegParam(req: Request, ctx: ModuleContext): number | null {
  const n = Number.parseInt(req.params.stweg ?? '', 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (!ctx.config.stwegen.some((s) => s.nr === n)) return null;
  return n;
}

function parseId(raw: string | undefined): number | null {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface WohnungBody {
  bezeichnung?: string;
  stockwerk?: string | null;
  zimmer?: number | null;
  flaeche_m2?: number | null;
  typ?: string;
  besonderheiten?: string | null;
  bewohnt_von?: BewohntVon;
  waschkueche_berechtigt?: boolean;
  notizen?: string | null;
  wertquote_zaehler?: number | null;
  wertquote_nenner?: number | null;
  kontakte?: KontaktInput[];
}

export function registerWohnungenApi(
  app: Express,
  ctx: ModuleContext,
  opts: WohnungenOptions,
): void {
  const { authenticated, requirePermission } = ctx.middleware;
  const read = requirePermission(opts.permissionKey, 'read');
  const write = requirePermission(opts.permissionKey, 'write');

  // ── List apartments for a STWEG ─────────────────────────────────
  app.get(
    '/api/wohnungen/:stweg',
    authenticated,
    read,
    async (req: Request, res: Response) => {
      const stweg = parseStwegParam(req, ctx);
      if (stweg === null) return res.status(400).json({ error: 'Unknown stweg' });
      try {
        const wohnungen = await ctx.db.query<WohnungRow>(
          'SELECT * FROM wohnungen WHERE stweg_nr = $1 ORDER BY bezeichnung',
          [stweg],
        );
        const kontakte = await ctx.db.query(
          `SELECT k.*
             FROM wohnungen_kontakte k
             JOIN wohnungen w ON w.id = k.wohnung_id
            WHERE w.stweg_nr = $1 AND k.archiviert_am IS NULL
            ORDER BY k.rolle, k.sort_order, k.id`,
          [stweg],
        );
        const byWohnung = new Map<number, unknown[]>();
        for (const k of kontakte.rows as { wohnung_id: number }[]) {
          const list = byWohnung.get(k.wohnung_id) ?? [];
          list.push(k);
          byWohnung.set(k.wohnung_id, list);
        }
        const out = wohnungen.rows.map((w) => ({
          ...w,
          kontakte: byWohnung.get(w.id) ?? [],
        }));
        res.json({ stweg, wohnungen: out });
      } catch (err) {
        ctx.logger.error('[wohnungen] list failed', { err: (err as Error).message });
        res.status(500).json({ error: 'Failed to load apartments' });
      }
    },
  );

  // ── Single apartment ────────────────────────────────────────────
  app.get(
    '/api/wohnungen/:stweg/:id',
    authenticated,
    read,
    async (req: Request, res: Response) => {
      const stweg = parseStwegParam(req, ctx);
      const id = parseId(req.params.id);
      if (stweg === null || id === null) return res.status(400).json({ error: 'Bad params' });
      try {
        const w = await loadWohnungMitKontakte(ctx.db, id);
        if (!w || w.stweg_nr !== stweg) return res.status(404).json({ error: 'Not found' });
        res.json(w);
      } catch (err) {
        ctx.logger.error('[wohnungen] get failed', { err: (err as Error).message });
        res.status(500).json({ error: 'Failed to load apartment' });
      }
    },
  );

  // ── History (admin / ausschuss / verwaltung) ────────────────────
  const historyGate = requirePermission(opts.historyPermissionKey, 'read');
  app.get(
    '/api/wohnungen/:stweg/:id/historie',
    authenticated,
    historyGate,
    async (req: Request, res: Response) => {
      const stweg = parseStwegParam(req, ctx);
      const id = parseId(req.params.id);
      if (stweg === null || id === null) return res.status(400).json({ error: 'Bad params' });
      try {
        const w = await loadWohnungMitKontakte(ctx.db, id, { onlyHistory: true });
        if (!w || w.stweg_nr !== stweg) return res.status(404).json({ error: 'Not found' });
        res.json({ wohnung: { id: w.id, stweg_nr: w.stweg_nr, bezeichnung: w.bezeichnung }, historie: w.kontakte });
      } catch (err) {
        ctx.logger.error('[wohnungen] historie failed', { err: (err as Error).message });
        res.status(500).json({ error: 'Failed to load history' });
      }
    },
  );

  // ── Manual archive of a single kontakt ──────────────────────────
  app.post(
    '/api/wohnungen/:stweg/:id/kontakte/:kid/archive',
    authenticated,
    write,
    async (req: Request, res: Response) => {
      const stweg = parseStwegParam(req, ctx);
      const id = parseId(req.params.id);
      const kid = parseId(req.params.kid);
      if (stweg === null || id === null || kid === null) return res.status(400).json({ error: 'Bad params' });
      try {
        const r = await ctx.db.query(
          `UPDATE wohnungen_kontakte
              SET archiviert_am = CURRENT_DATE
            WHERE id = $1 AND wohnung_id = $2 AND archiviert_am IS NULL
          RETURNING id`,
          [kid, id],
        );
        if (r.rowCount === 0) return res.status(404).json({ error: 'Kontakt not found or already archived' });
        res.json({ ok: true });
      } catch (err) {
        ctx.logger.error('[wohnungen] archive failed', { err: (err as Error).message });
        res.status(500).json({ error: 'Failed to archive contact' });
      }
    },
  );

  // ── Create ──────────────────────────────────────────────────────
  app.post('/api/wohnungen/:stweg', authenticated, write, async (req, res) => {
    const stweg = parseStwegParam(req, ctx);
    if (stweg === null) return res.status(400).json({ error: 'Unknown stweg' });
    const body = req.body as WohnungBody;
    if (!body.bezeichnung) return res.status(400).json({ error: 'bezeichnung is required' });

    const client = await ctx.db.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query<WohnungRow>(
        `INSERT INTO wohnungen
           (stweg_nr, bezeichnung, stockwerk, zimmer, flaeche_m2, typ, besonderheiten,
            bewohnt_von, waschkueche_berechtigt, notizen,
            wertquote_zaehler, wertquote_nenner)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          stweg,
          body.bezeichnung,
          body.stockwerk ?? null,
          body.zimmer ?? null,
          body.flaeche_m2 ?? null,
          body.typ ?? 'Wohnung',
          body.besonderheiten ?? null,
          body.bewohnt_von ?? 'eigentuemer',
          body.waschkueche_berechtigt !== false,
          body.notizen ?? null,
          body.wertquote_zaehler ?? null,
          body.wertquote_nenner ?? null,
        ],
      );
      await saveKontakte(client, ins.rows[0]!.id, body.kontakte, opts);
      await client.query('COMMIT');
      const w = await loadWohnungMitKontakte(ctx.db, ins.rows[0]!.id);
      res.status(201).json(w);
    } catch (err) {
      await client.query('ROLLBACK');
      const e = err as Error & { code?: string };
      if (e.code === '23505') return res.status(409).json({ error: 'bezeichnung already exists' });
      ctx.logger.error('[wohnungen] create failed', { err: e.message });
      res.status(500).json({ error: 'Failed to create apartment' });
    } finally {
      client.release();
    }
  });

  // ── Update ──────────────────────────────────────────────────────
  app.put('/api/wohnungen/:stweg/:id', authenticated, write, async (req, res) => {
    const stweg = parseStwegParam(req, ctx);
    const id = parseId(req.params.id);
    if (stweg === null || id === null) return res.status(400).json({ error: 'Bad params' });
    const body = req.body as WohnungBody;

    const client = await ctx.db.connect();
    try {
      await client.query('BEGIN');
      const upd = await client.query<WohnungRow>(
        `UPDATE wohnungen SET
           bezeichnung=$1, stockwerk=$2, zimmer=$3, flaeche_m2=$4, typ=$5,
           besonderheiten=$6, bewohnt_von=$7, waschkueche_berechtigt=$8, notizen=$9,
           wertquote_zaehler=$10, wertquote_nenner=$11
         WHERE id=$12 AND stweg_nr=$13
         RETURNING *`,
        [
          body.bezeichnung,
          body.stockwerk ?? null,
          body.zimmer ?? null,
          body.flaeche_m2 ?? null,
          body.typ ?? 'Wohnung',
          body.besonderheiten ?? null,
          body.bewohnt_von ?? 'eigentuemer',
          body.waschkueche_berechtigt !== false,
          body.notizen ?? null,
          body.wertquote_zaehler ?? null,
          body.wertquote_nenner ?? null,
          id,
          stweg,
        ],
      );
      if (upd.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Not found' });
      }
      await saveKontakte(client, id, body.kontakte, opts);
      await client.query('COMMIT');
      const w = await loadWohnungMitKontakte(ctx.db, id);
      res.json(w);
    } catch (err) {
      await client.query('ROLLBACK');
      const e = err as Error & { code?: string };
      if (e.code === '23505') return res.status(409).json({ error: 'bezeichnung already exists' });
      ctx.logger.error('[wohnungen] update failed', { err: e.message });
      res.status(500).json({ error: 'Failed to update apartment' });
    } finally {
      client.release();
    }
  });

  // ── Delete ──────────────────────────────────────────────────────
  app.delete('/api/wohnungen/:stweg/:id', authenticated, write, async (req, res) => {
    const stweg = parseStwegParam(req, ctx);
    const id = parseId(req.params.id);
    if (stweg === null || id === null) return res.status(400).json({ error: 'Bad params' });
    try {
      const r = await ctx.db.query(
        'DELETE FROM wohnungen WHERE id = $1 AND stweg_nr = $2 RETURNING id',
        [id, stweg],
      );
      if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      ctx.logger.error('[wohnungen] delete failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed to delete apartment' });
    }
  });
}
