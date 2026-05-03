import type { Express, Request, Response } from 'express';
import type { ModuleContext } from '@sam/core';
import { randomBytes } from 'node:crypto';
import type { DruckerOptions } from './options.js';
import type { PrintJobInput, PrintJobRow } from './types.js';

function genToken(): string {
  return randomBytes(24).toString('base64url');
}

export function registerDruckerApi(
  app: Express,
  ctx: ModuleContext,
  opts: DruckerOptions,
): void {
  const { authenticated, requirePermission, adminOnly } = ctx.middleware;
  const adminRead = requirePermission(opts.permissionKey, 'read');
  const adminWrite = requirePermission(opts.permissionKey, 'write');

  // ── Public pickup-by-token ─────────────────────────────────────
  // Anyone with the token URL (sent to the resident) can confirm.
  app.get('/api/pickup/:token', async (req: Request, res: Response) => {
    try {
      const r = await ctx.db.query<PrintJobRow>(
        'SELECT * FROM print_jobs WHERE token = $1',
        [req.params.token],
      );
      const job = r.rows[0];
      if (!job) return res.status(404).json({ error: 'Not found' });
      res.json(job);
    } catch (err) {
      ctx.logger.error('[drucker] pickup get failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  app.post('/api/pickup/:token', async (req: Request, res: Response) => {
    try {
      const cur = await ctx.db.query<PrintJobRow>('SELECT * FROM print_jobs WHERE token = $1', [
        req.params.token,
      ]);
      const job = cur.rows[0];
      if (!job) return res.status(404).json({ error: 'Not found' });
      if (job.status === 'picked_up') return res.json({ ...job, message: 'Already picked up' });
      const upd = await ctx.db.query<PrintJobRow>(
        `UPDATE print_jobs
            SET status = 'picked_up', picked_up_at = NOW(), picked_up_by = $1
          WHERE token = $2 RETURNING *`,
        [(req.body?.name as string | undefined) ?? 'Recipient', req.params.token],
      );
      res.json({ ...upd.rows[0], message: 'Confirmed' });
    } catch (err) {
      ctx.logger.error('[drucker] pickup post failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Admin: list jobs ───────────────────────────────────────────
  app.get('/api/drucker/jobs', authenticated, adminRead, async (req, res) => {
    const open = req.query.open === '1';
    try {
      const r = await ctx.db.query<PrintJobRow>(
        `SELECT * FROM print_jobs
         ${open ? "WHERE picked_up_at IS NULL AND status = 'printed'" : ''}
         ORDER BY created_at DESC
         LIMIT 500`,
      );
      res.json({ jobs: r.rows });
    } catch (err) {
      ctx.logger.error('[drucker] list failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Admin: create a job (called by the host's mail pipeline) ──
  // Authenticated + admin so external systems must use a service
  // account rather than guess a public endpoint.
  app.post('/api/drucker/jobs', authenticated, adminWrite, async (req, res) => {
    const b = (req.body ?? {}) as Partial<PrintJobInput>;
    if (!b.printer) return res.status(400).json({ error: 'printer required' });
    const token = b.token ?? genToken();
    try {
      const r = await ctx.db.query<PrintJobRow>(
        `INSERT INTO print_jobs
           (token, printer, recipient_name, recipient_address, recipient_wohnung,
            recipient_stweg, sender_email, subject, documents, message_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          token,
          b.printer,
          b.recipient_name ?? null,
          b.recipient_address ?? null,
          b.recipient_wohnung ?? null,
          b.recipient_stweg ?? null,
          b.sender_email ?? null,
          b.subject ?? null,
          b.documents ?? 0,
          b.message_id ?? null,
        ],
      );
      const pickupUrl = opts.publicBaseUrl
        ? `${opts.publicBaseUrl.replace(/\/$/, '')}/pickup/${token}`
        : null;
      res.status(201).json({ job: r.rows[0], pickupUrl });
    } catch (err) {
      ctx.logger.error('[drucker] create failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Admin: cancel an open job ──────────────────────────────────
  app.post('/api/drucker/jobs/:token/cancel', authenticated, adminOnly, async (req, res) => {
    try {
      const r = await ctx.db.query<PrintJobRow>(
        `UPDATE print_jobs SET status = 'cancelled' WHERE token = $1 AND status = 'printed' RETURNING *`,
        [req.params.token],
      );
      if (r.rowCount === 0) return res.status(404).json({ error: 'Not found or not open' });
      res.json(r.rows[0]);
    } catch (err) {
      ctx.logger.error('[drucker] cancel failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });
}
