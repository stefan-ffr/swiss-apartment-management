import type { ModuleContext } from '@sam/core';
import type { DruckerOptions } from './options.js';

/**
 * Daily auto-cancel of un-picked-up jobs older than `autoCancelAfterDays`.
 * Reminder dispatch is left to the host (it must own the email channel).
 */
export async function autoCancelStaleJobs(
  ctx: ModuleContext,
  opts: DruckerOptions,
): Promise<void> {
  try {
    const r = await ctx.db.query(
      `UPDATE print_jobs
          SET status = 'cancelled'
        WHERE picked_up_at IS NULL
          AND status = 'printed'
          AND created_at < NOW() - ($1 || ' days')::interval
        RETURNING id`,
      [String(opts.autoCancelAfterDays)],
    );
    if (r.rowCount && r.rowCount > 0) {
      ctx.logger.info(`[drucker] auto-cancelled ${r.rowCount} stale jobs`);
    }
  } catch (err) {
    ctx.logger.error('[drucker] auto-cancel failed', { err: (err as Error).message });
  }
}
