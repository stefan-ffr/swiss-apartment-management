import type { ModuleContext } from '@sam/core';

/**
 * Daily auto-archive cron.
 *
 * When a kontakt with a future `gueltig_ab` date crosses today, the
 * predecessor of the same role on the same wohnung must move into
 * the history. Doing this with one SQL statement keeps the
 * invariant that there is at most one active kontakt per (wohnung,
 * role).
 */
export async function autoArchiveSupersededKontakte(ctx: ModuleContext): Promise<void> {
  try {
    const r = await ctx.db.query(`
      WITH heute_aktiv AS (
        SELECT id, wohnung_id, rolle, gueltig_ab
          FROM wohnungen_kontakte
         WHERE archiviert_am IS NULL
           AND gueltig_ab IS NOT NULL
           AND gueltig_ab <= CURRENT_DATE
      )
      UPDATE wohnungen_kontakte alt
         SET archiviert_am = CURRENT_DATE
        FROM heute_aktiv neu
       WHERE alt.wohnung_id = neu.wohnung_id
         AND alt.rolle      = neu.rolle
         AND alt.id         <> neu.id
         AND alt.archiviert_am IS NULL
         AND (alt.gueltig_ab IS NULL OR alt.gueltig_ab < neu.gueltig_ab)
      RETURNING alt.id
    `);
    if (r.rowCount && r.rowCount > 0) {
      ctx.logger.info(`[wohnungen] archived ${r.rowCount} superseded kontakte`);
    }
  } catch (err) {
    ctx.logger.error('[wohnungen] auto-archive failed', { err: (err as Error).message });
  }
}
