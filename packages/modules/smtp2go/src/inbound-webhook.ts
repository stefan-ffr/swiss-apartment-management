/**
 * Inbound via webhook. Cloudflare Email Workers (or SMTP2GO's own
 * inbound-webhook feature) POST a JSON envelope here. The handler
 * verifies an HMAC-SHA256 signature, deduplicates by Message-ID,
 * normalises into an InboundMessage, and hands it to the
 * caller-supplied handler — typically wraps verteiler.processInbound.
 *
 * Expected payload shape (compatible with the upstream Rosenweg
 * Cloudflare worker; SMTP2GO-native is a superset):
 *
 *   {
 *     "messageId": "<...@gmail.com>",
 *     "recipient": "list@lists.example.ch",
 *     "from":      { "email": "alice@x.com", "name": "Alice" },
 *     "subject":   "Hi",
 *     "headers":   { "x-foo": "bar" },
 *     "text":      "...",
 *     "html":      "..."
 *   }
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import express from 'express';
import type { ModuleContext } from '@sam/core';
import { getLocale } from '@sam/core';
import type { Smtp2goOptions } from './options.js';
import type { InboundHandler, InboundMessage } from './types.js';

interface IncomingWebhookBody {
  messageId?: string;
  recipient?: string;
  from?: { email?: string; name?: string };
  subject?: string;
  headers?: Record<string, string | string[]>;
  text?: string;
  html?: string;
}

let inboundHandler: InboundHandler | null = null;
export function setInboundHandler(h: InboundHandler): void {
  inboundHandler = h;
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function registerWebhookEndpoint(
  app: Express,
  ctx: ModuleContext,
  opts: Smtp2goOptions,
): void {
  if (!opts.webhook) return;
  const wh = opts.webhook;
  const t = (req: Request, key: string, params?: Record<string, unknown>): string =>
    ctx.translator.t(key, getLocale(req), params);

  // Capture the raw body BEFORE express.json() runs so we can compute
  // HMAC over the exact bytes the sender signed.
  app.post(
    '/api/smtp2go/inbound',
    express.raw({ type: 'application/json', limit: '20mb' }),
    async (req: Request, res: Response) => {
      const secret = process.env[wh.secretEnv];
      if (!secret) {
        res.status(503).json({ error: t(req, 'errors.webhookDisabled', { env: wh.secretEnv }) });
        return;
      }
      const provided = req.header(wh.signatureHeader);
      if (!provided) return res.status(401).json({ error: t(req, 'errors.missingSignature') });

      const raw = (req.body as Buffer).toString('utf8');
      const expected = createHmac(wh.algorithm, secret).update(raw).digest('hex');
      if (!constantTimeEqual(provided, expected)) {
        return res.status(401).json({ error: t(req, 'errors.badSignature') });
      }

      let body: IncomingWebhookBody;
      try {
        body = JSON.parse(raw) as IncomingWebhookBody;
      } catch {
        return res.status(400).json({ error: t(req, 'errors.badJson') });
      }
      const messageId = body.messageId?.trim();
      const recipient = body.recipient?.trim().toLowerCase();
      const fromEmail = body.from?.email?.trim().toLowerCase();
      if (!messageId || !recipient || !fromEmail) {
        return res.status(400).json({ error: t(req, 'errors.envelopeFieldsRequired') });
      }

      // Dedup
      const existing = await ctx.db.query(
        'SELECT 1 FROM smtp2go_processed_inbound WHERE message_id = $1',
        [messageId],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        return res.json({ ok: true, action: 'dropped', reason: 'duplicate' });
      }

      const msg: InboundMessage = {
        messageId,
        recipient,
        fromEmail,
        fromName: body.from?.name,
        subject: body.subject ?? '',
        headers: body.headers ?? {},
        text: body.text,
        html: body.html,
      };

      try {
        if (!inboundHandler) {
          ctx.logger.warn('[smtp2go.webhook] no handler registered, dropping');
          return res.status(503).json({ error: t(req, 'errors.noHandler') });
        }
        await inboundHandler(msg);
        await ctx.db.query(
          `INSERT INTO smtp2go_processed_inbound (message_id, recipient) VALUES ($1, $2)
           ON CONFLICT (message_id) DO NOTHING`,
          [messageId, recipient],
        );
        res.json({ ok: true });
      } catch (err) {
        ctx.logger.error('[smtp2go.webhook] handler failed', { err: (err as Error).message });
        res.status(500).json({ error: t(req, 'errors.handlerFailed') });
      }
    },
  );
}
