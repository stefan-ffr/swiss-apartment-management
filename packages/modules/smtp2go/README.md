# @sam/module-smtp2go

Optional integration with [SMTP2GO](https://www.smtp2go.com) — a
managed SMTP relay — as a symmetric counterpart to
`@sam/module-mailcow`. Tenants pick whichever fits their topology;
the rest of SAM (verteiler, drucker, …) is unchanged.

## What it provides

1. **`Mailer` adapter** (`createSmtp2goMailer`) — nodemailer-backed,
   submits via `mail.smtp2go.com:587`. Same shape that
   `@sam/module-verteiler#setServices({ mailer })` accepts.
2. **Inbound via signed webhook** (`POST /api/smtp2go/inbound`) —
   for Cloudflare Email Workers or SMTP2GO's native inbound webhook.
   HMAC-SHA256 signature is verified against the raw request body;
   message-IDs are deduplicated.
3. **Inbound via IMAP poll** (`startGmailImapPoller`) — for the
   legacy "Cloudflare Email Routing → Gmail+tag → IMAP" pattern
   (Rosenweg's current production setup). Same handler signature
   as the webhook, so the host wires `setInboundHandler()` once.
4. **Activity-API client + suppressions sync** — pulls SMTP2GO's
   bounce/spam/unsubscribe list into a local cache so verteiler
   can refuse outbound to known-bad addresses without an API
   round-trip per send. Cron runs every 10 min by default.

## Symmetry with `@sam/module-mailcow`

| Concern | Mailcow | SMTP2GO |
|---|---|---|
| Send | `createMailcowMailer` | `createSmtp2goMailer` |
| Receive (push) | n/a (use IMAP) | `POST /api/smtp2go/inbound` (signed) |
| Receive (poll) | `startImapPoller` | `startGmailImapPoller` |
| Bounces | (LMTP filter) | `syncSuppressions` cron |
| Lists as native aliases | `bridges.verteiler` | n/a (SMTP2GO has no aliases) |

When SMTP2GO is the backend, the `verteiler` module's own
`processInbound()` is the alias substitute: SMTP2GO doesn't have
"the alias forwards natively to N people"; SAM does that itself.

## Bootstrap (host-side)

```ts
import { bootstrap } from '@sam/core';
import verteiler, { setServices, processInbound, VerteilerOptionsSchema } from '@sam/module-verteiler';
import smtp2go, {
  Smtp2goOptionsSchema,
  createSmtp2goMailer,
  setInboundHandler,
  startGmailImapPoller,
} from '@sam/module-smtp2go';

await bootstrap({ modules: [verteiler, smtp2go, /* ... */] });

const config = await loadTenantConfig();
const sgOpts = Smtp2goOptionsSchema.parse(config.modules.smtp2go.options);
const vOpts  = VerteilerOptionsSchema.parse(config.modules.verteiler.options);

setServices({
  mailer: createSmtp2goMailer(sgOpts),
  resolveGroup: yourGroupResolver,   // tenant-specific (Authentik / LDAP / …)
});

setInboundHandler(async (msg) => {
  await processInbound(ctx, vOpts, msg);
});

if (sgOpts.imap) await startGmailImapPoller(ctx, sgOpts, async (msg) => {
  await processInbound(ctx, vOpts, msg);
});
```

## REST API

| Method | Path | Auth |
|---|---|---|
| GET | `/api/smtp2go/health` | `smtp2go:read` |
| GET | `/api/smtp2go/suppressions` | `smtp2go:read` |
| GET | `/api/smtp2go/suppressions/:addr` | `smtp2go:read` |
| POST | `/api/smtp2go/suppressions/sync` | admin |
| POST | `/api/smtp2go/inbound` | HMAC-signed (no auth header) |

## Module options

```jsonc
{
  "modules": {
    "smtp2go": {
      "enabled": true,
      "options": {
        "permissionKey": "smtp2go",

        "smtp": {
          "host": "mail.smtp2go.com",
          "port": 587,
          "secure": false,
          "userEnv": "SMTP2GO_USER",
          "passwordEnv": "SMTP2GO_PASSWORD",
          "from": "noreply@example.ch"
        },

        "webhook": {
          "secretEnv": "SMTP2GO_WEBHOOK_SECRET",
          "signatureHeader": "x-sam-signature",
          "algorithm": "sha256"
        },

        "imap": {
          "host": "imap.gmail.com",
          "port": 993,
          "secure": true,
          "userEnv": "GMAIL_USER",
          "passwordEnv": "GMAIL_APP_PASSWORD",
          "mailbox": "INBOX",
          "tagPrefixFilter": "list",
          "moveProcessedTo": "Processed",
          "pollIntervalMs": 60000
        },

        "activityApi": {
          "baseUrl": "https://api.smtp2go.com/v3",
          "apiKeyEnv": "SMTP2GO_API_KEY",
          "syncIntervalMs": 600000
        }
      }
    }
  }
}
```

`smtp`, `webhook`, `imap` and `activityApi` are independently
optional. Tenants who only want outbound submission omit the rest.

## Inbound webhook payload

The webhook accepts JSON of this shape (compatible with the
upstream Rosenweg Cloudflare Worker):

```jsonc
{
  "messageId": "<abcd@gmail.com>",
  "recipient": "list@lists.example.ch",
  "from":      { "email": "alice@x.com", "name": "Alice" },
  "subject":   "Hi",
  "headers":   { "x-foo": "bar" },
  "text":      "...",
  "html":      "..."
}
```

The sender must compute `hex(HMAC-SHA256(secret, raw_body))` and
pass it in the `X-Sam-Signature` header (or whatever
`signatureHeader` is configured to). The endpoint compares using
`crypto.timingSafeEqual` so signatures are not vulnerable to
timing analysis.

## Bookkeeping tables

- `smtp2go_processed_inbound` — message-IDs already delivered, so
  the webhook + IMAP poller never deliver the same mail twice.
- `smtp2go_suppressions` — local cache of SMTP2GO's bounce list.

## Permissions declared

| Key | Scopes | Description |
|---|---|---|
| `smtp2go` | read, write | Manage SMTP2GO suppressions / health |
