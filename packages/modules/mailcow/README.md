# @sam/module-mailcow

Optional integration with [Mailcow](https://mailcow.email) — a
self-hosted Postfix/Dovecot/Sogo stack — as an **alternative to**
the SMTP2GO-based mail backend used in the Rosenweg reference
deployment. Provides three things:

1. **Provisioning API** — create / disable mailboxes and aliases
   via the Mailcow REST API, with bookkeeping so SAM never touches
   foreign accounts.
2. **`Mailer` adapter** — a nodemailer-backed `Mailer` that the
   host can inject into `@sam/module-verteiler` (or any other
   module) without that module having to know about SMTP libs.
3. **IMAP inbound poller** — connects to a mailbox (typically a
   catch-all behind a `goto` alias), parses unseen messages with
   mailparser, and hands them to a caller-supplied handler such as
   `processInbound()` from `@sam/module-verteiler`.

## Why this lives in its own module

Mailcow is one valid mail backend, not the only one. Tenants that
prefer Cloudflare Email Routing + SMTP2GO, AWS SES, or a managed
provider just don't enable this module. The other modules
(verteiler, drucker, telefonbuch, ...) are agnostic; they accept a
`Mailer` and a `processInbound()` consumer through service injection.

## Bootstrap (host-side)

```ts
import { bootstrap } from '@sam/core';
import wohnungen from '@sam/module-wohnungen';
import verteiler, { setServices, processInbound } from '@sam/module-verteiler';
import mailcow, {
  MailcowOptionsSchema,
  createMailcowMailer,
  startImapPoller,
} from '@sam/module-mailcow';

await bootstrap({
  modules: [wohnungen, verteiler, mailcow, /* ... */],
  async afterBootstrap(ctx, registry) {
    const opts = MailcowOptionsSchema.parse(
      ctx.config.modules.mailcow?.options ?? {},
    );

    // Inject Mailer into verteiler
    setServices({
      mailer: createMailcowMailer(opts),
      resolveGroup: yourGroupResolver,
    });

    // Inbound: wire IMAP poller to verteiler.processInbound
    const verteilerOpts = /* ... */;
    await startImapPoller(ctx, opts, async (msg) => {
      await processInbound(ctx, verteilerOpts, {
        recipient: msg.recipient,
        fromEmail: msg.fromEmail,
        fromName: msg.fromName,
        subject: msg.subject,
        headers: msg.headers,
        text: msg.text,
        html: msg.html,
      });
    });
  },
});
```

## REST API

| Method | Path | Auth |
|---|---|---|
| GET | `/api/mailcow/health` | `mailcow:read` |
| GET | `/api/mailcow/mailboxes` | `mailcow:read` |
| POST | `/api/mailcow/mailboxes` | `mailcow:write` |
| POST | `/api/mailcow/mailboxes/:addr/deactivate` | admin |
| GET | `/api/mailcow/aliases` | `mailcow:read` |
| POST | `/api/mailcow/aliases` | `mailcow:write` |
| DELETE | `/api/mailcow/aliases/:addr` | admin |

The mailbox/alias listings annotate every record with
`sam_managed: true|false` so admins see at a glance which entries
SAM owns.

## Module options

```jsonc
{
  "modules": {
    "mailcow": {
      "enabled": true,
      "options": {
        "apiUrl": "https://mail.example.ch",
        "apiKeyEnv": "MAILCOW_API_KEY",
        "defaultDomain": "example.ch",
        "permissionKey": "mailcow",
        "defaultQuotaMb": 1024,
        "smtp": {
          "host": "mail.example.ch",
          "port": 587,
          "secure": false,
          "userEnv": "MAILCOW_SMTP_USER",
          "passwordEnv": "MAILCOW_SMTP_PASSWORD",
          "from": "noreply@example.ch"
        },
        "imap": {
          "host": "mail.example.ch",
          "port": 993,
          "secure": true,
          "userEnv": "MAILCOW_IMAP_USER",
          "passwordEnv": "MAILCOW_IMAP_PASSWORD",
          "mailbox": "INBOX",
          "moveProcessedTo": "Processed",
          "pollIntervalMs": 60000
        }
      }
    }
  }
}
```

`smtp` and `imap` are independently optional. Tenants who only
want the provisioning API can omit both.

## Bookkeeping tables

- `mailcow_managed_mailboxes` — addresses provisioned by SAM (so
  deactivate never runs on foreign accounts). Carries `purpose`
  for system-owned mailboxes (printer-ingest, verteiler-log, …).
- `mailcow_managed_aliases` — same for aliases. The `purpose`
  field tags bridge-managed entries so the GC step never deletes
  user-created aliases.

Both tables carry `last_seen_at` so you can run a periodic
reconciliation cron in the host.

## Bridges

When Mailcow is the mail backend, distribution lists and printer
tags can be implemented as **native Mailcow aliases** instead of
SAM polling IMAP and re-sending. Two opt-in bridges:

### `bridges.verteiler` — verteiler → Mailcow alias

For every active row in `email_verteiler`, ensure a Mailcow alias
at `email_address` whose `goto` is the resolved member list.
Mail to that alias is then delivered natively by Mailcow without
SAM ever seeing it. Manual trigger:

```
POST /api/mailcow/bridges/verteiler/sync
```

The bridge runs additionally on a configurable interval
(`bridges.verteiler.syncIntervalMs`, default 15 min). An optional
`auditBcc` adds a BCC mailbox to every alias so the host can
keep an immutable copy.

### `bridges.drucker` — drucker tags → Mailcow alias

For every drucker-tagged contact in `wohnungen_kontakte`, ensure
an alias `<tagPrefix>+<slug>@<domain>` whose `goto` is the
host's printer-ingest mailbox.

```
POST /api/mailcow/bridges/drucker/sync
```

Both bridges only touch records they themselves manage (purpose
column on `mailcow_managed_aliases`); user-created Mailcow aliases
are left alone.

## Purpose mailboxes

`ensurePurposeMailbox()` provisions stable system mailboxes
(printer-ingest, verteiler-log, bounces, …) with a tag so they
survive cron-driven reconciliation:

```ts
import { ensurePurposeMailbox } from '@sam/module-mailcow';

await ensurePurposeMailbox(ctx, opts, {
  purpose: 'printer-ingest',
  localPart: 'printer-ingest',
  passwordEnv: 'PRINTER_INGEST_PASSWORD',
});
```

## Permissions declared

| Key | Scopes | Description |
|---|---|---|
| `mailcow` | read, write | Manage Mailcow mailboxes and aliases |
