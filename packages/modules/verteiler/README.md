# @sam/module-verteiler

Mailing-list distribution. Resolves a list of group names (Authentik
groups, LDAP DNs, "verwaltung:*" pseudo-groups, …) into actual
recipient email addresses, and forwards messages to them — either
on demand via the REST `send` endpoint, or automatically when an
inbound email arrives at one of the tenant-owned list addresses.

## Architecture

This module is **transport-agnostic**. It does not import nodemailer
or imapflow. The host injects two services before bootstrap:

```ts
import { setServices } from '@sam/module-verteiler';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({ /* ... */ });

setServices({
  resolveGroup: async (groupName: string) => {
    // Talk to your IdP (Authentik, LDAP, ...) and return string[]
    return await myIdp.lookupGroupEmails(groupName);
  },
  mailer: async ({ from, to, subject, html, text }) =>
    transporter.sendMail({ from, to, subject, html, text }),
});
```

The host is also responsible for IMAP polling. When a message
arrives at one of the verteiler addresses, call:

```ts
import { processInbound } from '@sam/module-verteiler';

const result = await processInbound(ctx, opts, {
  recipient: 'all-stweg3@lists.example.ch',
  fromEmail: 'someone@example.com',
  subject: 'Important notice',
  headers: { /* lower-cased header map */ },
  html, text,
});
// result.action: 'forwarded' | 'dropped' | 'rejected'
```

## REST API

| Method | Path | Auth |
|---|---|---|
| GET | `/api/verteiler/by-stweg/:stweg` | authenticated |
| GET | `/api/verteiler` | admin |
| POST | `/api/verteiler` | admin |
| PUT | `/api/verteiler/:id` | admin |
| DELETE | `/api/verteiler/:id` | admin |
| GET | `/api/verteiler/:id/resolve` | `verteiler:write` |
| POST | `/api/verteiler/send` | `verteiler:write` (rate-limited) |
| GET | `/api/verteiler/log` | admin |

## Module options

```jsonc
{
  "modules": {
    "verteiler": {
      "enabled": true,
      "options": {
        "domain": "lists.example.ch",
        "fromAddress": "noreply@example.ch",
        "permissionKey": "verteiler",
        "rateLimitMax": 10,
        "rateLimitWindowMs": 600000,
        "recipientBlocklistPatterns": [
          "^drucker[a-z0-9]*@",          // printer-tag bare (no +tag) addresses
          ".*\\.invalid$"                 // RFC2606 invalid TLD
        ],
        "loopSubjectPrefixes": ["Zustellbericht:", "Auto-Reply:"],
        "loopHeaderNames":     ["x-forwarded-by-sam"],
        "loopHeaderValue":     "sam-verteiler"
      }
    }
  }
}
```

## Loop detection (carried over from Rosenweg)

A common failure mode is messages bouncing between the list and
the upstream provider. Three independent guards:

1. Subject prefixes (`Zustellbericht:` etc.) drop the message.
2. Sender domain == tenant domain ⇒ drop (self-mail loop).
3. A custom outbound header (`X-Forwarded-By: sam-verteiler`) lets
   us detect our own messages coming back. Configure the name and
   value via `loopHeaderNames` / `loopHeaderValue`.

## Permissions declared

| Key | Scopes | Description |
|---|---|---|
| `verteiler` | read, write | View / send mailing lists |
