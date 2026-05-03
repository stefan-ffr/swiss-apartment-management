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
  deactivate never runs on foreign accounts).
- `mailcow_managed_aliases` — same for aliases.

Both tables carry `last_seen_at` so you can run a periodic
reconciliation cron in the host.

## Permissions declared

| Key | Scopes | Description |
|---|---|---|
| `mailcow` | read, write | Manage Mailcow mailboxes and aliases |
