/**
 * Inbound via IMAP poll. The legacy Rosenweg pattern: Cloudflare
 * Email Routing forwards messages to a Gmail+tag mailbox; we poll
 * Gmail over IMAP, parse the messages, and hand them to the same
 * caller-supplied handler the webhook variant uses.
 *
 * The two variants share `setInboundHandler()` from inbound-webhook.ts
 * so the host wires the handler once regardless of which inbound
 * pipeline is active.
 */
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import type { Logger, ModuleContext } from '@sam/core';
import type { Smtp2goOptions } from './options.js';
import type { InboundHandler, InboundMessage } from './types.js';

let pollerActive = false;

export async function startGmailImapPoller(
  ctx: ModuleContext,
  opts: Smtp2goOptions,
  handler: InboundHandler,
): Promise<void> {
  if (!opts.imap) {
    ctx.logger.info('[smtp2go.imap] no imap section configured, poller not started');
    return;
  }
  if (pollerActive) {
    ctx.logger.warn('[smtp2go.imap] poller already running, skipping start');
    return;
  }
  pollerActive = true;

  const user = process.env[opts.imap.userEnv];
  const pass = process.env[opts.imap.passwordEnv];
  if (!user || !pass) {
    pollerActive = false;
    throw new Error(
      `[smtp2go.imap] env not set: ${opts.imap.userEnv}, ${opts.imap.passwordEnv}`,
    );
  }
  const imapCfg = opts.imap;

  const tick = async (): Promise<void> => {
    const client = new ImapFlow({
      host: imapCfg.host,
      port: imapCfg.port,
      secure: imapCfg.secure,
      auth: { user, pass },
      logger: false,
    });
    try {
      await client.connect();
      const lock = await client.getMailboxLock(imapCfg.mailbox);
      try {
        for await (const m of client.fetch({ seen: false }, { source: true, uid: true })) {
          if (!m.source) continue;
          let parsed: ParsedMail;
          try {
            parsed = await simpleParser(m.source);
          } catch (err) {
            ctx.logger.error('[smtp2go.imap] simpleParser failed', { err: (err as Error).message });
            continue;
          }
          const msg = toInbound(parsed, imapCfg.tagPrefixFilter);
          if (!msg) {
            await client.messageFlagsAdd({ uid: m.uid }, ['\\Seen']);
            continue;
          }
          // Dedup against already-processed message-ids
          if (msg.messageId) {
            const existing = await ctx.db.query(
              'SELECT 1 FROM smtp2go_processed_inbound WHERE message_id = $1',
              [msg.messageId],
            );
            if (existing.rowCount && existing.rowCount > 0) {
              await client.messageFlagsAdd({ uid: m.uid }, ['\\Seen']);
              continue;
            }
          }
          try {
            await handler(msg);
            if (msg.messageId) {
              await ctx.db.query(
                `INSERT INTO smtp2go_processed_inbound (message_id, recipient)
                 VALUES ($1, $2) ON CONFLICT (message_id) DO NOTHING`,
                [msg.messageId, msg.recipient],
              );
            }
            await client.messageFlagsAdd({ uid: m.uid }, ['\\Seen']);
            if (imapCfg.moveProcessedTo) {
              await client.messageMove({ uid: m.uid }, imapCfg.moveProcessedTo).catch(() => {
                /* destination may not exist; ignore */
              });
            }
          } catch (err) {
            ctx.logger.error('[smtp2go.imap] handler failed; leaving unseen', {
              err: (err as Error).message,
            });
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      ctx.logger.error('[smtp2go.imap] tick failed', { err: (err as Error).message });
    } finally {
      try {
        await client.logout();
      } catch {
        /* swallow */
      }
    }
  };

  schedule(tick, imapCfg.pollIntervalMs, ctx.logger);
}

function schedule(fn: () => Promise<void>, intervalMs: number, logger: Logger): void {
  const run = (): void => {
    fn()
      .catch((err: unknown) =>
        logger.error('[smtp2go.imap] poller crashed', { err: (err as Error).message }),
      )
      .finally(() => {
        setTimeout(run, intervalMs).unref();
      });
  };
  setTimeout(run, 5_000).unref();
}

function toInbound(p: ParsedMail, tagPrefixFilter?: string): InboundMessage | null {
  const fromAddr = Array.isArray(p.from) ? p.from[0] : p.from;
  const sender = fromAddr?.value?.[0]?.address;
  if (!sender) return null;

  const deliveredTo = (p.headers.get('delivered-to') as string | undefined) ?? null;
  const toField = Array.isArray(p.to) ? p.to[0] : p.to;
  const recipient = (deliveredTo ?? toField?.value?.[0]?.address ?? '').toLowerCase();
  if (!recipient) return null;

  // Optional Gmail-tag filter: only forward when the +tag matches
  if (tagPrefixFilter) {
    if (!recipient.includes(`+${tagPrefixFilter}`)) return null;
  }

  const headers: Record<string, string | string[]> = {};
  for (const [k, v] of p.headers) {
    headers[k.toLowerCase()] = typeof v === 'string' ? v : Array.isArray(v) ? v.map(String) : String(v);
  }

  return {
    messageId: p.messageId ?? `${recipient}-${p.date?.toISOString() ?? Date.now()}`,
    recipient,
    fromEmail: sender.toLowerCase(),
    fromName: fromAddr?.value?.[0]?.name,
    subject: p.subject ?? '',
    headers,
    text: p.text,
    html: typeof p.html === 'string' ? p.html : undefined,
  };
}
