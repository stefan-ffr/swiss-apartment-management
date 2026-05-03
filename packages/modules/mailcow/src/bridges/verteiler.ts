/**
 * Bridge: realise @sam/module-verteiler distribution lists as
 * native Mailcow aliases.
 *
 * For each row in `email_verteiler` (active=true) we:
 *   1) resolve its members via the verteiler module's resolver,
 *   2) ensure a Mailcow alias exists at `email_address` whose `goto`
 *      is the comma-separated list of resolved members (plus an
 *      optional fixed BCC for logging),
 *   3) keep the SAM bookkeeping table in sync.
 *
 * Mailcow then delivers list mail natively — SAM does NOT poll IMAP
 * or re-send anything. The host can disable verteiler's own
 * processInbound() entirely when this bridge is active.
 *
 * Aliases SAM previously created but whose verteiler row no longer
 * exists (or was deactivated) are cleaned up.
 */
import type { ModuleContext } from '@sam/core';
import {
  resolveRecipients,
  type VerteilerOptions,
  type VerteilerRow,
} from '@sam/module-verteiler';
import type { MailcowOptions } from '../options.js';
import { ensureAlias, deleteAlias } from '../sync.js';

export interface VerteilerBridgeOptions {
  /** verteiler module options (used by resolveRecipients) */
  verteilerOptions: VerteilerOptions;
  /** Optional BCC address attached to every alias (e.g. an audit
   *  mailbox) so the host can keep an immutable copy. */
  auditBcc?: string;
  /** Cap recipients per alias to protect Mailcow's `goto` field. */
  maxRecipientsPerAlias?: number;
}

export interface BridgeStats {
  upserted: number;
  removed: number;
  failed: number;
}

export async function syncVerteilerAliases(
  ctx: ModuleContext,
  mailcowOpts: MailcowOptions,
  opts: VerteilerBridgeOptions,
): Promise<BridgeStats> {
  const stats: BridgeStats = { upserted: 0, removed: 0, failed: 0 };
  const cap = opts.maxRecipientsPerAlias ?? 1000;

  const { rows } = await ctx.db.query<VerteilerRow>(
    'SELECT * FROM email_verteiler WHERE active = TRUE',
  );

  const validAddresses = new Set<string>();
  for (const v of rows) {
    try {
      const recipients = await resolveRecipients(v, opts.verteilerOptions);
      if (recipients.length === 0) {
        ctx.logger.warn('[mailcow.bridge.verteiler] empty membership, skipping', {
          addr: v.email_address,
        });
        continue;
      }
      const final = opts.auditBcc ? [...recipients, opts.auditBcc] : recipients;
      const goto = final.slice(0, cap).join(',');
      await ensureAlias(ctx, mailcowOpts, v.email_address, goto, 'verteiler');
      validAddresses.add(v.email_address.toLowerCase());
      stats.upserted++;
    } catch (e) {
      ctx.logger.error('[mailcow.bridge.verteiler] sync failed', {
        addr: v.email_address,
        err: (e as Error).message,
      });
      stats.failed++;
    }
  }

  // Garbage-collect SAM-managed verteiler aliases that no longer
  // have an active row in email_verteiler.
  const managed = await ctx.db.query<{ address: string }>(
    "SELECT address FROM mailcow_managed_aliases WHERE purpose = 'verteiler' AND active = TRUE",
  );
  for (const m of managed.rows) {
    if (validAddresses.has(m.address.toLowerCase())) continue;
    try {
      const ok = await deleteAlias(ctx, mailcowOpts, m.address);
      if (ok) stats.removed++;
    } catch (e) {
      ctx.logger.error('[mailcow.bridge.verteiler] cleanup failed', {
        addr: m.address,
        err: (e as Error).message,
      });
      stats.failed++;
    }
  }

  ctx.logger.info('[mailcow.bridge.verteiler] sync complete', { ...stats });
  return stats;
}
