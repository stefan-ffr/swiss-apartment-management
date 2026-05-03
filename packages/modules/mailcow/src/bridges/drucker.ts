/**
 * Bridge: realise @sam/module-drucker tagged aliases as native
 * Mailcow aliases.
 *
 * Each drucker-tagged contact (e.g. `drucker+mueller.hans@print.example.ch`)
 * becomes a Mailcow alias whose `goto` is the tenant's printer-ingest
 * mailbox. Mailcow then delivers reliably and the host's IMAP poller
 * (or LMTP filter) creates the print_jobs row from there.
 *
 * Walks `wohnungen_kontakte` (provided by @sam/module-wohnungen),
 * extracts every distinct drucker-tag email, ensures the alias
 * exists, and garbage-collects orphans.
 */
import type { ModuleContext } from '@sam/core';
import { isDruckerTag, type DruckerOptions } from '@sam/module-drucker';
import type { MailcowOptions } from '../options.js';
import { ensureAlias, deleteAlias } from '../sync.js';

export interface DruckerBridgeOptions {
  /** drucker module options (so isDruckerTag knows the prefix/domain) */
  druckerOptions: DruckerOptions;
  /** Where mail to drucker-tagged aliases should ultimately land. */
  ingestAddress: string;
}

export interface BridgeStats {
  upserted: number;
  removed: number;
  failed: number;
}

export async function syncDruckerAliases(
  ctx: ModuleContext,
  mailcowOpts: MailcowOptions,
  opts: DruckerBridgeOptions,
): Promise<BridgeStats> {
  const stats: BridgeStats = { upserted: 0, removed: 0, failed: 0 };

  const { rows } = await ctx.db.query<{ email: string }>(
    `SELECT DISTINCT LOWER(email) AS email
       FROM wohnungen_kontakte
      WHERE email IS NOT NULL
        AND archiviert_am IS NULL`,
  );

  const validAddresses = new Set<string>();
  for (const r of rows) {
    if (!isDruckerTag(r.email, opts.druckerOptions)) continue;
    try {
      await ensureAlias(ctx, mailcowOpts, r.email, opts.ingestAddress, 'drucker');
      validAddresses.add(r.email);
      stats.upserted++;
    } catch (e) {
      ctx.logger.error('[mailcow.bridge.drucker] ensure failed', {
        addr: r.email,
        err: (e as Error).message,
      });
      stats.failed++;
    }
  }

  const managed = await ctx.db.query<{ address: string }>(
    "SELECT address FROM mailcow_managed_aliases WHERE purpose = 'drucker' AND active = TRUE",
  );
  for (const m of managed.rows) {
    if (validAddresses.has(m.address.toLowerCase())) continue;
    try {
      const ok = await deleteAlias(ctx, mailcowOpts, m.address);
      if (ok) stats.removed++;
    } catch (e) {
      ctx.logger.error('[mailcow.bridge.drucker] cleanup failed', {
        addr: m.address,
        err: (e as Error).message,
      });
      stats.failed++;
    }
  }

  ctx.logger.info('[mailcow.bridge.drucker] sync complete', { ...stats });
  return stats;
}
