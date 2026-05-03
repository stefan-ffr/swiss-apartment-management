import type { Express, Request, Response, NextFunction } from 'express';
import type { ModuleContext } from '@sam/core';
import type { EnergieOptions } from './options.js';
import type { MeterRow, ReadingRow, TariffRow, ReadingInput } from './types.js';

export function registerEnergieApi(
  app: Express,
  ctx: ModuleContext,
  opts: EnergieOptions,
): void {
  const { authenticated, requirePermission, adminOnly } = ctx.middleware;
  const read = requirePermission(opts.readPermissionKey, 'read');

  // Shared-secret middleware for the ingest endpoint
  const ingestKey = process.env[opts.ingestSecretEnv];
  const ingestAuth = (req: Request, res: Response, next: NextFunction): void => {
    if (!ingestKey) {
      res.status(503).json({ error: `Ingest disabled: env ${opts.ingestSecretEnv} not set` });
      return;
    }
    const provided = req.header(opts.ingestHeaderName);
    if (provided !== ingestKey) {
      res.status(401).json({ error: 'Bad ingest key' });
      return;
    }
    next();
  };

  // ── Meters ─────────────────────────────────────────────────────
  app.get('/api/energie/meters', authenticated, read, async (_req, res) => {
    try {
      const r = await ctx.db.query<MeterRow>(
        `SELECT * FROM energy_meters WHERE active = TRUE ORDER BY label`,
      );
      res.json({ meters: r.rows });
    } catch (err) {
      ctx.logger.error('[energie] meters list failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.post('/api/energie/meters', authenticated, adminOnly, async (req, res) => {
    const b = req.body as Partial<MeterRow>;
    if (!b.id || !b.label) return res.status(400).json({ error: 'id + label required' });
    try {
      const r = await ctx.db.query<MeterRow>(
        `INSERT INTO energy_meters (id, label, unit, stweg_nr, wohnung_id, type, tariff_id, cumulative, active, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8, TRUE), COALESCE($9, TRUE), $10) RETURNING *`,
        [
          b.id,
          b.label,
          b.unit ?? opts.defaultUnit,
          b.stweg_nr ?? null,
          b.wohnung_id ?? null,
          b.type ?? 'electric',
          b.tariff_id ?? null,
          b.cumulative,
          b.active,
          b.notes ?? null,
        ],
      );
      res.status(201).json(r.rows[0]);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === '23505') return res.status(409).json({ error: 'Meter id already exists' });
      ctx.logger.error('[energie] create-meter failed', { err: e.message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Ingest (collector → API) ───────────────────────────────────
  app.post('/api/energie/ingest', ingestAuth, async (req, res) => {
    const body = req.body as ReadingInput | { readings?: ReadingInput[] };
    const list: ReadingInput[] = Array.isArray((body as { readings?: ReadingInput[] }).readings)
      ? (body as { readings: ReadingInput[] }).readings
      : [body as ReadingInput];

    let inserted = 0;
    try {
      for (const reading of list) {
        if (!reading.meter_id || typeof reading.value !== 'number') continue;
        await ctx.db.query(
          `INSERT INTO energy_readings (meter_id, value, timestamp, source)
           VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), $4)`,
          [reading.meter_id, reading.value, reading.timestamp ?? null, reading.source ?? null],
        );
        inserted++;
      }
      res.json({ ok: true, inserted });
    } catch (err) {
      ctx.logger.error('[energie] ingest failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Read time-series ───────────────────────────────────────────
  app.get('/api/energie/meters/:id/readings', authenticated, read, async (req, res) => {
    const meterId = req.params.id ?? '';
    const von = (req.query.von as string | undefined) ?? null;
    const bis = (req.query.bis as string | undefined) ?? null;
    try {
      const r = await ctx.db.query<ReadingRow>(
        `SELECT * FROM energy_readings
          WHERE meter_id = $1
            AND ($2::timestamptz IS NULL OR timestamp >= $2::timestamptz)
            AND ($3::timestamptz IS NULL OR timestamp <= $3::timestamptz)
          ORDER BY timestamp DESC LIMIT $4`,
        [meterId, von, bis, opts.maxRange],
      );
      res.json({ readings: r.rows });
    } catch (err) {
      ctx.logger.error('[energie] readings read failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Tariffs ────────────────────────────────────────────────────
  app.get('/api/energie/tariffs', authenticated, read, async (_req, res) => {
    try {
      const r = await ctx.db.query<TariffRow>(`SELECT * FROM energy_tariffs ORDER BY valid_from DESC`);
      res.json({ tariffs: r.rows });
    } catch (err) {
      ctx.logger.error('[energie] tariffs list failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.post('/api/energie/tariffs', authenticated, adminOnly, async (req, res) => {
    const b = req.body as Partial<TariffRow>;
    if (!b.id || !b.label || !b.chf_per_unit || !b.valid_from) {
      return res.status(400).json({ error: 'id + label + chf_per_unit + valid_from required' });
    }
    try {
      const r = await ctx.db.query<TariffRow>(
        `INSERT INTO energy_tariffs (id, label, unit, chf_per_unit, valid_from, valid_until)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [b.id, b.label, b.unit ?? opts.defaultUnit, b.chf_per_unit, b.valid_from, b.valid_until ?? null],
      );
      res.status(201).json(r.rows[0]);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === '23505') return res.status(409).json({ error: 'Tariff id exists' });
      ctx.logger.error('[energie] tariff create failed', { err: e.message });
      res.status(500).json({ error: 'Failed' });
    }
  });
}
