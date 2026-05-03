/**
 * IMAP poller. Connects to a Mailcow IMAP mailbox, fetches unseen
 * messages, parses them with mailparser and hands them to the
 * caller's processInbound() — typically @sam/module-verteiler's.
 *
 * The poller starts on demand via `startImapPoller()` from the
 * host's bootstrap (we deliberately don't auto-start in register()
 * because IMAP credentials are sensitive and starting requires the
 * host to wire processInbound() first).
 */
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import type { Logger, ModuleContext } from '@sam/core';
import type { MailcowOptions } from './options.js';

export interface InboundMessage {
  recipient: string;            // Delivered-To / To header
  fromEmail: string;
  fromName?: string;
  subject: string;
  headers: Record<string, string | string[]>;
  text?: string;
  html?: string;
  raw: ParsedMail;
}

/** Caller-supplied handler — typically wraps processInbound() of verteiler. */
export type InboundHandler = (msg: InboundMessage) => Promise<void>;

let pollerActive = false;

export async function startImapPoller(
  ctx: ModuleContext,
  opts: MailcowOptions,
  handler: InboundHandler,
): Promise<void> {
  if (!opts.imap) {
    ctx.logger.info('[mailcow] no imap section configured; poller not started');
    return;
  }
  if (pollerActive) {
    ctx.logger.warn('[mailcow] imap poller already running, skipping start');
    return;
  }
  pollerActive = true;

  const user = process.env[opts.imap.userEnv];
  const pass = process.env[opts.imap.passwordEnv];
  if (!user || !pass) {
    pollerActive = false;
    throw new Error(
      `[mailcow] imap creds env not set: ${opts.imap.userEnv}, ${opts.imap.passwordEnv}`,
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
            ctx.logger.error('[mailcow] simpleParser failed', { err: (err as Error).message });
            continue;
          }
          const msg = toInbound(parsed);
          if (!msg) continue;
          try {
            await handler(msg);
            await client.messageFlagsAdd({ uid: m.uid }, ['\\Seen']);
            if (imapCfg.moveProcessedTo) {
              await client.messageMove({ uid: m.uid }, imapCfg.moveProcessedTo).catch(() => {
                /* destination may not exist; ignore */
              });
            }
          } catch (err) {
            ctx.logger.error('[mailcow] handler failed, leaving message unseen', {
              err: (err as Error).message,
            });
          }
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      ctx.logger.error('[mailcow] imap tick failed', { err: (err as Error).message });
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
        logger.error('[mailcow] imap poller crashed', { err: (err as Error).message }),
      )
      .finally(() => {
        setTimeout(run, intervalMs).unref();
      });
  };
  // Initial run in 5s so bootstrap log isn't spammed
  setTimeout(run, 5_000).unref();
}

function toInbound(p: ParsedMail): InboundMessage | null {
  const fromAddr = Array.isArray(p.from) ? p.from[0] : p.from;
  const sender = fromAddr?.value?.[0]?.address;
  if (!sender) return null;

  // Prefer Delivered-To over To when present (catch-all + alias setups)
  const deliveredTo = (p.headers.get('delivered-to') as string | undefined) ?? null;
  const toField = Array.isArray(p.to) ? p.to[0] : p.to;
  const recipient = (deliveredTo ?? toField?.value?.[0]?.address ?? '').toLowerCase();
  if (!recipient) return null;

  // Flatten headers into a record (lower-cased keys, raw values)
  const headers: Record<string, string | string[]> = {};
  for (const [k, v] of p.headers) {
    headers[k.toLowerCase()] = typeof v === 'string' ? v : Array.isArray(v) ? v.map(String) : String(v);
  }

  return {
    recipient,
    fromEmail: sender.toLowerCase(),
    fromName: fromAddr?.value?.[0]?.name,
    subject: p.subject ?? '',
    headers,
    text: p.text,
    html: typeof p.html === 'string' ? p.html : undefined,
    raw: p,
  };
}
