import type { Express, Request, Response } from 'express';
import type { ModuleContext } from '@sam/core';
import { getLocale } from '@sam/core';
import type { VerwaltungOptions } from './options.js';
import type {
  VerwaltungRow,
  KontaktRow,
  VerwaltungWithKontakte,
  VerwaltungInput,
  KontaktInput,
} from './types.js';

function parseId(raw: string | undefined): number | null {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function loadAllWithKontakte(
  ctx: ModuleContext,
  filter: { onlyActive: boolean; publicCols: boolean },
): Promise<VerwaltungWithKontakte[]> {
  const cols = filter.publicCols
    ? `id, stweg_nr, firma_name, adresse, telefon, email, plattform_name, plattform_url, aktiv, created_at, updated_at`
    : `*`;
  const where = filter.onlyActive ? 'WHERE aktiv = TRUE' : '';
  const verw = await ctx.db.query<VerwaltungRow>(
    `SELECT ${cols} FROM verwaltungen ${where} ORDER BY stweg_nr NULLS FIRST, aktiv DESC, firma_name`,
  );
  if (verw.rows.length === 0) return [];
  const ids = verw.rows.map((v) => v.id);
  const kCols = filter.publicCols
    ? `verwaltung_id, name, funktion, email, telefon, sort_order`
    : `*`;
  const kont = await ctx.db.query<KontaktRow & { verwaltung_id: number }>(
    `SELECT ${kCols} FROM verwaltungs_kontakte
      WHERE verwaltung_id = ANY($1::int[])
      ORDER BY verwaltung_id, sort_order, id`,
    [ids],
  );
  const byVerw = new Map<number, VerwaltungWithKontakte>();
  for (const v of verw.rows) byVerw.set(v.id, { ...v, kontakte: [] });
  for (const k of kont.rows) byVerw.get(k.verwaltung_id)?.kontakte.push(k);
  return [...byVerw.values()];
}

export function registerVerwaltungApi(
  app: Express,
  ctx: ModuleContext,
  opts: VerwaltungOptions,
): void {
  const { authenticated, requirePermission } = ctx.middleware;
  const adminRead = requirePermission(opts.permissionKey, 'read');
  const adminWrite = requirePermission(opts.permissionKey, 'write');
  const t = (req: Request, key: string, params?: Record<string, unknown>): string =>
    ctx.translator.t(key, getLocale(req), params);

  // ── Public list (no credentials) ────────────────────────────────
  if (opts.exposePublicEndpoint) {
    app.get('/api/verwaltungen/public', async (req: Request, res: Response) => {
      try {
        const list = await loadAllWithKontakte(ctx, { onlyActive: true, publicCols: true });
        res.json({ verwaltungen: list });
      } catch (err) {
        ctx.logger.error('[verwaltung] public list failed', { err: (err as Error).message });
        res.status(500).json({ error: t(req, 'errors.load') });
      }
    });
  }

  // ── Admin list (full record) ────────────────────────────────────
  app.get('/api/verwaltungen', authenticated, adminRead, async (req, res) => {
    try {
      const list = await loadAllWithKontakte(ctx, { onlyActive: false, publicCols: false });
      res.json({ verwaltungen: list });
    } catch (err) {
      ctx.logger.error('[verwaltung] list failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.load') });
    }
  });

  // ── Create ──────────────────────────────────────────────────────
  app.post('/api/verwaltungen', authenticated, adminWrite, async (req, res) => {
    const b = (req.body ?? {}) as VerwaltungInput;
    if (!b.firma_name) return res.status(400).json({ error: t(req, 'errors.firmaNameRequired') });
    try {
      const r = await ctx.db.query<VerwaltungRow>(
        `INSERT INTO verwaltungen
           (stweg_nr, firma_name, adresse, telefon, email,
            plattform_name, plattform_url, plattform_user, plattform_pass,
            vertrag_von, vertrag_bis, kuendigungsfrist_monate, kuendigung_eingereicht_am,
            dokument_pfad, notizen, aktiv)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, COALESCE($16, TRUE))
         RETURNING *`,
        [
          b.stweg_nr ?? null,
          b.firma_name,
          b.adresse ?? null,
          b.telefon ?? null,
          b.email ?? null,
          b.plattform_name ?? null,
          b.plattform_url ?? null,
          b.plattform_user ?? null,
          b.plattform_pass ?? null,
          b.vertrag_von ?? null,
          b.vertrag_bis ?? null,
          b.kuendigungsfrist_monate ?? null,
          b.kuendigung_eingereicht_am ?? null,
          b.dokument_pfad ?? null,
          b.notizen ?? null,
          b.aktiv,
        ],
      );
      res.status(201).json(r.rows[0]);
    } catch (err) {
      ctx.logger.error('[verwaltung] create failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.create') });
    }
  });

  // ── Update ──────────────────────────────────────────────────────
  app.put('/api/verwaltungen/:id', authenticated, adminWrite, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: t(req, 'errors.badId') });
    const b = (req.body ?? {}) as VerwaltungInput;
    if (!b.firma_name) return res.status(400).json({ error: t(req, 'errors.firmaNameRequired') });
    try {
      const r = await ctx.db.query<VerwaltungRow>(
        `UPDATE verwaltungen SET
           stweg_nr=$1, firma_name=$2, adresse=$3, telefon=$4, email=$5,
           plattform_name=$6, plattform_url=$7, plattform_user=$8, plattform_pass=$9,
           vertrag_von=$10, vertrag_bis=$11, kuendigungsfrist_monate=$12, kuendigung_eingereicht_am=$13,
           dokument_pfad=$14, notizen=$15, aktiv=$16
         WHERE id=$17 RETURNING *`,
        [
          b.stweg_nr ?? null,
          b.firma_name,
          b.adresse ?? null,
          b.telefon ?? null,
          b.email ?? null,
          b.plattform_name ?? null,
          b.plattform_url ?? null,
          b.plattform_user ?? null,
          b.plattform_pass ?? null,
          b.vertrag_von ?? null,
          b.vertrag_bis ?? null,
          b.kuendigungsfrist_monate ?? null,
          b.kuendigung_eingereicht_am ?? null,
          b.dokument_pfad ?? null,
          b.notizen ?? null,
          b.aktiv === false ? false : true,
          id,
        ],
      );
      if (r.rowCount === 0) return res.status(404).json({ error: t(req, 'errors.notFound') });
      res.json(r.rows[0]);
    } catch (err) {
      ctx.logger.error('[verwaltung] update failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.update') });
    }
  });

  // ── Delete ──────────────────────────────────────────────────────
  app.delete('/api/verwaltungen/:id', authenticated, adminWrite, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: t(req, 'errors.badId') });
    try {
      const r = await ctx.db.query('DELETE FROM verwaltungen WHERE id = $1 RETURNING id', [id]);
      if (r.rowCount === 0) return res.status(404).json({ error: t(req, 'errors.notFound') });
      res.json({ ok: true });
    } catch (err) {
      ctx.logger.error('[verwaltung] delete failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.delete') });
    }
  });

  // ── Add kontakt ─────────────────────────────────────────────────
  app.post('/api/verwaltungen/:id/kontakte', authenticated, adminWrite, async (req, res) => {
    const verwId = parseId(req.params.id);
    if (verwId === null) return res.status(400).json({ error: t(req, 'errors.badId') });
    const b = (req.body ?? {}) as KontaktInput;
    if (!b.name) return res.status(400).json({ error: t(req, 'errors.nameRequired') });
    try {
      const r = await ctx.db.query<KontaktRow>(
        `INSERT INTO verwaltungs_kontakte (verwaltung_id, name, funktion, email, telefon, sort_order)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0)) RETURNING *`,
        [verwId, b.name, b.funktion ?? null, b.email ?? null, b.telefon ?? null, b.sort_order ?? 0],
      );
      res.status(201).json(r.rows[0]);
    } catch (err) {
      ctx.logger.error('[verwaltung] add-kontakt failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.addContact') });
    }
  });

  // ── Update kontakt ──────────────────────────────────────────────
  app.put('/api/verwaltungen/kontakte/:kid', authenticated, adminWrite, async (req, res) => {
    const kid = parseId(req.params.kid);
    if (kid === null) return res.status(400).json({ error: t(req, 'errors.badId') });
    const b = (req.body ?? {}) as KontaktInput;
    if (!b.name) return res.status(400).json({ error: t(req, 'errors.nameRequired') });
    try {
      const r = await ctx.db.query<KontaktRow>(
        `UPDATE verwaltungs_kontakte
            SET name=$1, funktion=$2, email=$3, telefon=$4, sort_order=$5
          WHERE id=$6 RETURNING *`,
        [b.name, b.funktion ?? null, b.email ?? null, b.telefon ?? null, b.sort_order ?? 0, kid],
      );
      if (r.rowCount === 0) return res.status(404).json({ error: t(req, 'errors.notFound') });
      res.json(r.rows[0]);
    } catch (err) {
      ctx.logger.error('[verwaltung] update-kontakt failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.updateContact') });
    }
  });

  // ── Delete kontakt ──────────────────────────────────────────────
  app.delete('/api/verwaltungen/kontakte/:kid', authenticated, adminWrite, async (req, res) => {
    const kid = parseId(req.params.kid);
    if (kid === null) return res.status(400).json({ error: t(req, 'errors.badId') });
    try {
      const r = await ctx.db.query('DELETE FROM verwaltungs_kontakte WHERE id = $1 RETURNING id', [kid]);
      if (r.rowCount === 0) return res.status(404).json({ error: t(req, 'errors.notFound') });
      res.json({ ok: true });
    } catch (err) {
      ctx.logger.error('[verwaltung] delete-kontakt failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.deleteContact') });
    }
  });
}
