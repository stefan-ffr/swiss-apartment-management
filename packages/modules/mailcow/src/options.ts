import { z } from 'zod';

export const MailcowOptionsSchema = z.object({
  /** Mailcow base URL (no trailing slash), e.g. "https://mail.example.ch" */
  apiUrl: z.string().url(),

  /** Env var name holding the X-API-Key value */
  apiKeyEnv: z.string().min(1).default('MAILCOW_API_KEY'),

  /** Default domain for new mailboxes (e.g. "example.ch") */
  defaultDomain: z.string().min(1),

  /** Permission key required for admin endpoints */
  permissionKey: z.string().default('mailcow'),

  /** SMTP submission settings (used to expose a Mailer to the host
   *  which then injects it into @sam/module-verteiler). */
  smtp: z
    .object({
      host: z.string().min(1),
      port: z.number().int().positive().default(587),
      secure: z.boolean().default(false),
      userEnv: z.string().min(1),
      passwordEnv: z.string().min(1),
      from: z.string().email(),
    })
    .optional(),

  /** Optional IMAP poll target — a single mailbox that catches all
   *  inbound list mail (typically a mailcow alias goto a real mbx). */
  imap: z
    .object({
      host: z.string().min(1),
      port: z.number().int().positive().default(993),
      secure: z.boolean().default(true),
      userEnv: z.string().min(1),
      passwordEnv: z.string().min(1),
      mailbox: z.string().default('INBOX'),
      pollIntervalMs: z.number().int().positive().default(60_000),
      /** When true, processed messages are moved to this folder. */
      moveProcessedTo: z.string().optional(),
    })
    .optional(),

  /** Default mailbox quota for newly-provisioned accounts (MB) */
  defaultQuotaMb: z.number().int().positive().default(1024),

  /** Bridges are opt-in glue between mailcow and other modules. */
  bridges: z
    .object({
      verteiler: z
        .object({
          enabled: z.boolean().default(false),
          /** Optional address to BCC every list to (audit/log mailbox) */
          auditBcc: z.string().email().optional(),
          /** Cap recipients per alias (Mailcow goto field) */
          maxRecipientsPerAlias: z.number().int().positive().default(1000),
          /** Sync interval for the periodic re-sync cron */
          syncIntervalMs: z.number().int().positive().default(15 * 60 * 1000),
        })
        .default({}),
      drucker: z
        .object({
          enabled: z.boolean().default(false),
          /** Where mail to drucker-tagged aliases lands (a real mailbox) */
          ingestAddress: z.string().email().optional(),
          syncIntervalMs: z.number().int().positive().default(15 * 60 * 1000),
        })
        .default({}),
    })
    .default({}),
});

export type MailcowOptions = z.infer<typeof MailcowOptionsSchema>;
