import { z } from 'zod';

export const Smtp2goOptionsSchema = z.object({
  /** Permission key required for admin endpoints */
  permissionKey: z.string().default('smtp2go'),

  /** SMTP submission settings (the host injects createSmtp2goMailer
   *  into @sam/module-verteiler, mirroring the mailcow module). */
  smtp: z
    .object({
      host: z.string().min(1).default('mail.smtp2go.com'),
      port: z.number().int().positive().default(587),
      secure: z.boolean().default(false),
      userEnv: z.string().min(1).default('SMTP2GO_USER'),
      passwordEnv: z.string().min(1).default('SMTP2GO_PASSWORD'),
      from: z.string().email(),
    })
    .optional(),

  /** Inbound via webhook — Cloudflare Email Worker or SMTP2GO's
   *  native inbound-webhook posts to /api/smtp2go/inbound. The body
   *  is HMAC-signed with the secret in `webhookSecretEnv`. */
  webhook: z
    .object({
      secretEnv: z.string().min(1).default('SMTP2GO_WEBHOOK_SECRET'),
      /** Header name the sender uses for the signature. */
      signatureHeader: z.string().default('x-sam-signature'),
      /** Algorithm: hex(HMAC-SHA256(secret, raw_body)) */
      algorithm: z.literal('sha256').default('sha256'),
    })
    .optional(),

  /** Inbound via IMAP poll — the legacy "Cloudflare Email Routing
   *  → Gmail+tag → IMAP poll" pattern (Rosenweg's current setup).
   *  Mutually compatible with `webhook`: enable both if the host
   *  migrates from one to the other. */
  imap: z
    .object({
      host: z.string().min(1).default('imap.gmail.com'),
      port: z.number().int().positive().default(993),
      secure: z.boolean().default(true),
      userEnv: z.string().min(1),
      passwordEnv: z.string().min(1),
      mailbox: z.string().default('INBOX'),
      pollIntervalMs: z.number().int().positive().default(60_000),
      /** Only deliver messages whose To/Delivered-To carries this
       *  Gmail-style +tag prefix, otherwise drop. */
      tagPrefixFilter: z.string().optional(),
      /** Move processed messages to this label; default keeps them
       *  in INBOX and only marks them \\Seen. */
      moveProcessedTo: z.string().optional(),
    })
    .optional(),

  /** SMTP2GO Activity API for bounce/suppression sync. */
  activityApi: z
    .object({
      baseUrl: z.string().url().default('https://api.smtp2go.com/v3'),
      apiKeyEnv: z.string().min(1).default('SMTP2GO_API_KEY'),
      /** How often to pull suppressions into the local cache */
      syncIntervalMs: z.number().int().positive().default(10 * 60 * 1000),
    })
    .optional(),
});

export type Smtp2goOptions = z.infer<typeof Smtp2goOptionsSchema>;
