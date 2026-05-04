import type { Express } from 'express';
import type { ModuleContext } from '@sam/core';
import type { Smtp2goOptions } from './options.js';
import { syncSuppressions, isSuppressed } from './suppressions.js';
import { Smtp2goActivityClient } from './activity.js';

export function registerSmtp2goApi(
  app: Express,
  ctx: ModuleContext,
  opts: Smtp2goOptions,
): void {
  const { authenticated, requirePermission, adminOnly } = ctx.middleware;
  const adminRead = requirePermission(opts.permissionKey, 'read');

  // ── Health check ───────────────────────────────────────────────
  app.get('/api/smtp2go/health', authenticated, adminRead, async (_req, res) => {
    if (!opts.activityApi) return res.json({ ok: true, activityApi: false });
    try {
      const client = new Smtp2goActivityClient(opts);
      await client.listSuppressions({ limit: 1 });
      res.json({ ok: true, activityApi: true });
    } catch (err) {
      res.status(502).json({ ok: false, error: (err as Error).message });
    }
  });

  // ── List local suppression cache ───────────────────────────────
  app.get('/api/smtp2go/suppressions', authenticated, adminRead, async (req, res) => {
    const limit = Math.min(Number.parseInt(String(req.query.limit ?? '500'), 10) || 500, 2000);
    try {
      const r = await ctx.db.query(
        `SELECT * FROM smtp2go_suppressions ORDER BY detected_at DESC LIMIT $1`,
        [limit],
      );
      res.json({ suppressions: r.rows });
    } catch (err) {
      ctx.logger.error('[smtp2go] suppressions read failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });

  // ── Trigger a suppression sync now ─────────────────────────────
  app.post('/api/smtp2go/suppressions/sync', authenticated, adminOnly, async (_req, res) => {
    try {
      const stats = await syncSuppressions(ctx, opts);
      res.json({ ok: true, ...stats });
    } catch (err) {
      ctx.logger.error('[smtp2go] suppressions sync failed', { err: (err as Error).message });
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Check a single address ─────────────────────────────────────
  app.get('/api/smtp2go/suppressions/:addr', authenticated, adminRead, async (req, res) => {
    try {
      const suppressed = await isSuppressed(ctx, req.params.addr ?? '');
      res.json({ address: req.params.addr, suppressed });
    } catch (err) {
      ctx.logger.error('[smtp2go] suppressions check failed', { err: (err as Error).message });
      res.status(500).json({ error: 'Failed' });
    }
  });
}
