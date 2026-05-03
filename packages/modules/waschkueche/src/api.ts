import type { Express, Request } from 'express';
import type { ModuleContext } from '@sam/core';
import { getUser } from '@sam/core';
import type { WaschkuecheOptions } from './options.js';
import type { RoomRow, ReservationRow, ReservationInput } from './types.js';

function parseId(raw: string | undefined): number | null {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function userSub(req: Request): string | null {
  const u = getUser(req);
  return u?.sub ?? null;
}

export function registerWaschkuecheApi(
  app: Express,
  ctx: ModuleContext,
  opts: WaschkuecheOptions,
): void {
  const { authenticated, requirePermission, adminOnly } = ctx.middleware;
  const read = requirePermission(opts.permissionKey, 'read');
  const write = requirePermission(opts.permissionKey, 'write');

  // ── Rooms ──────────────────────────────────────────────────────
  app.get('/api/wasch/rooms', authenticated, read, async (req, res) => {
    const stweg = req.query.stweg ? Number.parseInt(String(req.query.stweg), 10) : null;
    try {
      const r = stweg
        ? await ctx.db.query<RoomRow>('SELECT * FROM wasch_rooms WHERE active = TRUE AND stweg_nr = $1 ORDER BY name', [stweg])
        : await ctx.db.query<RoomRow>('SELECT * FROM wasch_rooms WHERE active = TRUE ORDER BY name');
      res.json({ rooms: r.rows });
    } catch (err) {
      ctx.logger.error('[waschkueche] rooms list failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.post('/api/wasch/rooms', authenticated, adminOnly, async (req, res) => {
    const b = req.body as Partial<RoomRow>;
    if (!b.name) return res.status(400).json({ error: 'name required' });
    try {
      const r = await ctx.db.query<RoomRow>(
        `INSERT INTO wasch_rooms (name, location, stweg_nr, energy_meter_id, door_id, active)
         VALUES ($1,$2,$3,$4,$5, COALESCE($6, TRUE)) RETURNING *`,
        [b.name, b.location ?? null, b.stweg_nr ?? null, b.energy_meter_id ?? null, b.door_id ?? null, b.active],
      );
      res.status(201).json(r.rows[0]);
    } catch (err) {
      ctx.logger.error('[waschkueche] room create failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.put('/api/wasch/rooms/:id', authenticated, adminOnly, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Bad id' });
    const b = req.body as Partial<RoomRow>;
    try {
      const r = await ctx.db.query<RoomRow>(
        `UPDATE wasch_rooms
            SET name = COALESCE($1, name),
                location = COALESCE($2, location),
                stweg_nr = COALESCE($3, stweg_nr),
                energy_meter_id = COALESCE($4, energy_meter_id),
                door_id = COALESCE($5, door_id),
                active = COALESCE($6, active)
          WHERE id = $7 RETURNING *`,
        [b.name ?? null, b.location ?? null, b.stweg_nr ?? null, b.energy_meter_id ?? null, b.door_id ?? null, b.active ?? null, id],
      );
      if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
      res.json(r.rows[0]);
    } catch (err) {
      ctx.logger.error('[waschkueche] room update failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Reservations ───────────────────────────────────────────────
  app.get('/api/wasch/reservations', authenticated, read, async (req, res) => {
    const room = req.query.room ? Number.parseInt(String(req.query.room), 10) : null;
    try {
      const sql = room
        ? `SELECT r.*, rm.name AS room_name FROM wasch_reservations r
             JOIN wasch_rooms rm ON rm.id = r.room_id
            WHERE r.cancelled = FALSE AND r.room_id = $1 AND r.end_time >= NOW()
            ORDER BY r.start_time`
        : `SELECT r.*, rm.name AS room_name FROM wasch_reservations r
             JOIN wasch_rooms rm ON rm.id = r.room_id
            WHERE r.cancelled = FALSE AND r.end_time >= NOW()
            ORDER BY r.start_time`;
      const result = room ? await ctx.db.query(sql, [room]) : await ctx.db.query(sql);
      res.json({ reservations: result.rows });
    } catch (err) {
      ctx.logger.error('[waschkueche] reservations list failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.post('/api/wasch/reservations', authenticated, write, async (req, res) => {
    const sub = userSub(req as Request);
    if (!sub) return res.status(401).json({ error: 'Auth required' });
    const b = req.body as ReservationInput;
    if (!b.room_id || !b.start_time || !b.end_time) {
      return res.status(400).json({ error: 'room_id + start_time + end_time required' });
    }
    const start = new Date(b.start_time);
    const end = new Date(b.end_time);
    const now = Date.now();
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format (ISO 8601)' });
    }
    if (end <= start) return res.status(400).json({ error: 'end_time must be after start_time' });
    if ((end.getTime() - start.getTime()) / 60000 > opts.maxSlotMinutes) {
      return res.status(400).json({ error: `Max slot duration: ${opts.maxSlotMinutes} min` });
    }
    if (start.getTime() - now > opts.maxAdvanceDays * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: `Max ${opts.maxAdvanceDays} days in advance` });
    }
    if (b.recurring && !opts.allowRecurring) {
      return res.status(400).json({ error: 'Recurring reservations are disabled' });
    }
    try {
      const conflict = await ctx.db.query(
        `SELECT id FROM wasch_reservations
          WHERE room_id = $1 AND cancelled = FALSE
            AND tstzrange(start_time, end_time, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
        [b.room_id, b.start_time, b.end_time],
      );
      if (conflict.rowCount && conflict.rowCount > 0) {
        return res.status(409).json({ error: 'Slot already taken' });
      }
      const r = await ctx.db.query<ReservationRow>(
        `INSERT INTO wasch_reservations
           (user_sub, room_id, start_time, end_time, recurring, recurring_until)
         VALUES ($1,$2,$3,$4, COALESCE($5, FALSE), $6) RETURNING *`,
        [sub, b.room_id, b.start_time, b.end_time, b.recurring, b.recurring_until ?? null],
      );
      res.status(201).json(r.rows[0]);
    } catch (err) {
      ctx.logger.error('[waschkueche] reservation create failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.get('/api/wasch/my/reservations', authenticated, read, async (req, res) => {
    const sub = userSub(req as Request);
    if (!sub) return res.status(401).json({ error: 'Auth required' });
    try {
      const r = await ctx.db.query(
        `SELECT r.*, rm.name AS room_name FROM wasch_reservations r
           JOIN wasch_rooms rm ON rm.id = r.room_id
          WHERE r.user_sub = $1 AND r.cancelled = FALSE AND r.end_time >= NOW() - INTERVAL '7 days'
          ORDER BY r.start_time DESC`,
        [sub],
      );
      res.json({ reservations: r.rows });
    } catch (err) {
      ctx.logger.error('[waschkueche] my-reservations failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.delete('/api/wasch/reservations/:id', authenticated, write, async (req, res) => {
    const sub = userSub(req as Request);
    if (!sub) return res.status(401).json({ error: 'Auth required' });
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Bad id' });
    try {
      const r = await ctx.db.query(
        `UPDATE wasch_reservations SET cancelled = TRUE
          WHERE id = $1 AND user_sub = $2 RETURNING id`,
        [id, sub],
      );
      if (r.rowCount === 0) return res.status(404).json({ error: 'Not found or not yours' });
      res.json({ ok: true });
    } catch (err) {
      ctx.logger.error('[waschkueche] cancel failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Sessions ───────────────────────────────────────────────────
  app.get('/api/wasch/my/sessions', authenticated, read, async (req, res) => {
    const sub = userSub(req as Request);
    if (!sub) return res.status(401).json({ error: 'Auth required' });
    try {
      const r = await ctx.db.query(
        `SELECT s.*, rm.name AS room_name FROM wasch_sessions s
           JOIN wasch_rooms rm ON rm.id = s.room_id
          WHERE s.user_sub = $1 ORDER BY s.started_at DESC LIMIT 50`,
        [sub],
      );
      res.json({ sessions: r.rows });
    } catch (err) {
      ctx.logger.error('[waschkueche] my-sessions failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.get('/api/wasch/my/costs', authenticated, read, async (req, res) => {
    const sub = userSub(req as Request);
    if (!sub) return res.status(401).json({ error: 'Auth required' });
    try {
      const r = await ctx.db.query(
        `SELECT * FROM wasch_billing WHERE user_sub = $1 ORDER BY month DESC LIMIT 24`,
        [sub],
      );
      res.json({ billing: r.rows });
    } catch (err) {
      ctx.logger.error('[waschkueche] my-costs failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });
}
