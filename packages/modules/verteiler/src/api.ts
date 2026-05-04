import type { Express, Request } from 'express';
import type { ModuleContext } from '@sam/core';
import { getUser, getLocale } from '@sam/core';
import type { VerteilerOptions } from './options.js';
import type { VerteilerRow, VerteilerInput } from './types.js';
import { resolveRecipients } from './resolve.js';
import { requireMailer } from './services.js';
import { logEmail } from './log.js';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sendLog = new Map<string, number[]>();

function parseId(raw: string | undefined): number | null {
  const n = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function registerVerteilerApi(
  app: Express,
  ctx: ModuleContext,
  opts: VerteilerOptions,
): void {
  const { authenticated, requirePermission, adminOnly } = ctx.middleware;
  const sendGate = requirePermission(opts.permissionKey, 'write');
  const t = (req: Request, key: string, params?: Record<string, unknown>): string =>
    ctx.translator.t(key, getLocale(req), params);

  // ── List for STWEG (auth required) ─────────────────────────────
  app.get('/api/verteiler/by-stweg/:stweg', authenticated, async (req, res) => {
    const stweg = Number.parseInt(req.params.stweg ?? '', 10);
    if (!Number.isFinite(stweg)) return res.status(400).json({ error: t(req, 'errors.badStweg') });
    try {
      const r = await ctx.db.query(
        `SELECT id, name, email_address, stweg_nr, description
           FROM email_verteiler
          WHERE stweg_nr = $1 AND active = TRUE
          ORDER BY name`,
        [stweg],
      );
      res.json(r.rows);
    } catch (err) {
      ctx.logger.error('[verteiler] list failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.load') });
    }
  });

  // ── Full CRUD (admin) ──────────────────────────────────────────
  app.get('/api/verteiler', authenticated, adminOnly, async (req, res) => {
    try {
      const r = await ctx.db.query<VerteilerRow>(
        `SELECT * FROM email_verteiler ORDER BY stweg_nr NULLS FIRST, name`,
      );
      res.json({ verteiler: r.rows });
    } catch (err) {
      ctx.logger.error('[verteiler] list-admin failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.load') });
    }
  });

  app.post('/api/verteiler', authenticated, adminOnly, async (req, res) => {
    const b = (req.body ?? {}) as VerteilerInput;
    if (!b.name || !b.email_address) return res.status(400).json({ error: t(req, 'errors.nameAndEmailRequired') });
    try {
      const r = await ctx.db.query<VerteilerRow>(
        `INSERT INTO email_verteiler
           (name, email_address, stweg_nr, description, group_names, members, active)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, COALESCE($7, TRUE))
         RETURNING *`,
        [
          b.name,
          b.email_address.toLowerCase(),
          b.stweg_nr ?? null,
          b.description ?? null,
          JSON.stringify(b.group_names ?? []),
          JSON.stringify(b.members ?? []),
          b.active,
        ],
      );
      res.status(201).json(r.rows[0]);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === '23505') return res.status(409).json({ error: t(req, 'errors.emailExists') });
      ctx.logger.error('[verteiler] create failed', { err: e.message });
      res.status(500).json({ error: t(req, 'errors.create') });
    }
  });

  app.put('/api/verteiler/:id', authenticated, adminOnly, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: t(req, 'errors.badId') });
    const b = (req.body ?? {}) as VerteilerInput;
    if (!b.name || !b.email_address) return res.status(400).json({ error: t(req, 'errors.nameAndEmailRequired') });
    try {
      const r = await ctx.db.query<VerteilerRow>(
        `UPDATE email_verteiler SET
           name=$1, email_address=$2, stweg_nr=$3, description=$4,
           group_names=$5::jsonb, members=$6::jsonb, active=$7
         WHERE id=$8 RETURNING *`,
        [
          b.name,
          b.email_address.toLowerCase(),
          b.stweg_nr ?? null,
          b.description ?? null,
          JSON.stringify(b.group_names ?? []),
          JSON.stringify(b.members ?? []),
          b.active === false ? false : true,
          id,
        ],
      );
      if (r.rowCount === 0) return res.status(404).json({ error: t(req, 'errors.notFound') });
      res.json(r.rows[0]);
    } catch (err) {
      ctx.logger.error('[verteiler] update failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.update') });
    }
  });

  app.delete('/api/verteiler/:id', authenticated, adminOnly, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: t(req, 'errors.badId') });
    try {
      const r = await ctx.db.query('DELETE FROM email_verteiler WHERE id = $1 RETURNING id', [id]);
      if (r.rowCount === 0) return res.status(404).json({ error: t(req, 'errors.notFound') });
      res.json({ ok: true });
    } catch (err) {
      ctx.logger.error('[verteiler] delete failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.delete') });
    }
  });

  // ── Resolve (preview the recipients of a verteiler) ────────────
  app.get('/api/verteiler/:id/resolve', authenticated, sendGate, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: t(req, 'errors.badId') });
    try {
      const r = await ctx.db.query<VerteilerRow>('SELECT * FROM email_verteiler WHERE id = $1', [id]);
      const v = r.rows[0];
      if (!v) return res.status(404).json({ error: t(req, 'errors.notFound') });
      const recipients = await resolveRecipients(v, opts);
      res.json({ recipients, count: recipients.length });
    } catch (err) {
      ctx.logger.error('[verteiler] resolve failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.resolve') });
    }
  });

  // ── Send ───────────────────────────────────────────────────────
  app.post('/api/verteiler/send', authenticated, sendGate, async (req, res) => {
    const u = getUser(req as Request);
    const uid = u?.sub ?? u?.email ?? 'unknown';
    const now = Date.now();
    const log = (sendLog.get(uid) ?? []).filter((t) => now - t < opts.rateLimitWindowMs);
    if (log.length >= opts.rateLimitMax) {
      return res.status(429).json({ error: t(req, 'errors.rateLimited', { max: opts.rateLimitMax }) });
    }
    log.push(now);
    sendLog.set(uid, log);

    const { verteiler_id, subject, body, recipients } = (req.body ?? {}) as {
      verteiler_id?: number;
      subject?: string;
      body?: string;
      recipients?: string[];
    };
    if (!subject || !body || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: t(req, 'errors.sendBodyRequired') });
    }
    const valid = recipients.filter((r) => typeof r === 'string' && EMAIL_RX.test(r));
    if (valid.length === 0) return res.status(400).json({ error: t(req, 'errors.noValidRecipients') });

    const mailer = requireMailer();
    let sent = 0;
    const failed: string[] = [];
    for (const to of valid) {
      try {
        await mailer({ from: opts.fromAddress, to, subject, html: body });
        sent++;
      } catch (e) {
        ctx.logger.warn('[verteiler] send failed', { to, err: (e as Error).message });
        failed.push(to);
      }
    }
    const status: 'sent' | 'partial' | 'failed' =
      failed.length === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed';
    await logEmail(ctx.db, {
      trigger: 'verteiler-direct',
      verteiler_id: verteiler_id ?? null,
      from_email: u?.email ?? opts.fromAddress,
      from_name: u?.name ?? 'Admin',
      subject,
      recipients_count: sent,
      recipients_list: recipients,
      failed_recipients: failed.length > 0 ? failed : null,
      status,
      to_addresses: recipients.join(', '),
    });
    res.json({ ok: true, sent, failed: failed.length });
  });

  // ── Email log read ─────────────────────────────────────────────
  app.get('/api/verteiler/log', authenticated, adminOnly, async (req, res) => {
    const limit = Math.min(Number.parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
    try {
      const r = await ctx.db.query(
        `SELECT * FROM email_log ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      res.json({ log: r.rows });
    } catch (err) {
      ctx.logger.error('[verteiler] log read failed', { err: (err as Error).message });
      res.status(500).json({ error: t(req, 'errors.logRead') });
    }
  });
}
