/**
 * Inbound mail processing: when an email arrives at one of the
 * tenant-owned distribution addresses (e.g. via a forwarder or
 * IMAP poller), the host calls `processInbound()` with the raw
 * envelope + parsed message; this module decides whether to
 * forward, drop (loop / blocked) or reject.
 *
 * The actual IMAP polling lives in the host — different hosts use
 * different libs (imapflow, IMAP-only-via-Cloudflare-Forwarder, ...)
 * so we don't bake one in here.
 */
import type { ModuleContext } from '@sam/core';
import type { VerteilerOptions } from './options.js';
import type { VerteilerRow } from './types.js';
import { resolveRecipients } from './resolve.js';
import { requireMailer } from './services.js';
import { logEmail } from './log.js';

export interface InboundEnvelope {
  /** Address the message was sent TO (one of the tenant lists) */
  recipient: string;
  /** Sender of the original message */
  fromEmail: string;
  fromName?: string;
  subject: string;
  /** Full headers as a flat object (lower-cased keys) */
  headers: Record<string, string | string[]>;
  /** Plain-text body (optional) */
  text?: string;
  /** HTML body (optional) */
  html?: string;
}

export interface InboundResult {
  action: 'forwarded' | 'dropped' | 'rejected';
  reason: string;
  forwardedTo?: number;
}

/** Decides whether this envelope is a loop/spam/blocked. */
function isLoop(envelope: InboundEnvelope, opts: VerteilerOptions): boolean {
  for (const prefix of opts.loopSubjectPrefixes) {
    if (envelope.subject.startsWith(prefix)) return true;
  }
  for (const headerName of opts.loopHeaderNames) {
    const v = envelope.headers[headerName.toLowerCase()];
    if (v) return true;
  }
  // Same-domain self-mail = loop
  const senderDomain = envelope.fromEmail.split('@')[1]?.toLowerCase();
  if (senderDomain === opts.domain.toLowerCase()) return true;
  return false;
}

export async function processInbound(
  ctx: ModuleContext,
  opts: VerteilerOptions,
  envelope: InboundEnvelope,
): Promise<InboundResult> {
  if (isLoop(envelope, opts)) {
    return { action: 'dropped', reason: 'loop-detected' };
  }

  const r = await ctx.db.query<VerteilerRow>(
    'SELECT * FROM email_verteiler WHERE LOWER(email_address) = LOWER($1) AND active = TRUE',
    [envelope.recipient],
  );
  const v = r.rows[0];
  if (!v) return { action: 'dropped', reason: 'no-such-verteiler' };

  const recipients = await resolveRecipients(v, opts);
  if (recipients.length === 0) {
    return { action: 'dropped', reason: 'no-recipients' };
  }

  const mailer = requireMailer();
  let sent = 0;
  const failed: string[] = [];
  for (const to of recipients) {
    try {
      await mailer({
        from: opts.fromAddress,
        to,
        subject: envelope.subject,
        html: envelope.html,
        text: envelope.text,
      });
      sent++;
    } catch (e) {
      ctx.logger.warn('[verteiler] inbound forward failed', { to, err: (e as Error).message });
      failed.push(to);
    }
  }
  await logEmail(ctx.db, {
    trigger: 'verteiler-inbound',
    verteiler_id: v.id,
    from_email: envelope.fromEmail,
    from_name: envelope.fromName ?? null,
    subject: envelope.subject,
    recipients_count: sent,
    recipients_list: recipients,
    failed_recipients: failed.length > 0 ? failed : null,
    status: failed.length === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed',
    to_addresses: 'undisclosed-recipients:;',
  });
  return { action: 'forwarded', reason: 'ok', forwardedTo: sent };
}
