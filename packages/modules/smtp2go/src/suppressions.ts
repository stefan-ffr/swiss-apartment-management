/**
 * Periodic sync of SMTP2GO's suppression list into the local cache,
 * so verteiler/drucker/etc. can refuse outbound to known-bad
 * addresses without an API round-trip per send.
 */
import type { ModuleContext } from '@sam/core';
import type { Smtp2goOptions } from './options.js';
import { Smtp2goActivityClient } from './activity.js';

export async function syncSuppressions(
  ctx: ModuleContext,
  opts: Smtp2goOptions,
): Promise<{ added: number; updated: number }> {
  if (!opts.activityApi) {
    ctx.logger.debug('[smtp2go.suppressions] no activityApi configured, skipping');
    return { added: 0, updated: 0 };
  }
  const client = new Smtp2goActivityClient(opts);
  const list = await client.listSuppressions({ limit: 1000 });

  let added = 0;
  let updated = 0;
  for (const s of list) {
    const r = await ctx.db.query<{ inserted: boolean }>(
      `INSERT INTO smtp2go_suppressions (address, reason, detected_at, last_synced)
       VALUES (LOWER($1), $2, COALESCE($3::timestamptz, NOW()), NOW())
       ON CONFLICT (address) DO UPDATE
         SET reason = EXCLUDED.reason,
             last_synced = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [s.email, s.reason, s.detected || null],
    );
    if (r.rows[0]?.inserted) added++;
    else updated++;
  }
  ctx.logger.info(`[smtp2go.suppressions] synced ${list.length} (${added} new, ${updated} updated)`);
  return { added, updated };
}

export async function isSuppressed(
  ctx: ModuleContext,
  address: string,
): Promise<boolean> {
  const r = await ctx.db.query(
    'SELECT 1 FROM smtp2go_suppressions WHERE address = LOWER($1)',
    [address],
  );
  return (r.rowCount ?? 0) > 0;
}
