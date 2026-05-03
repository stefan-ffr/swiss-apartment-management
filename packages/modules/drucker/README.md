# @sam/module-drucker

Per-resident print-job inbox for households without usable email.
Each such resident gets a deterministic alias of the form
`<tagPrefix>+<slug>@<domain>` (e.g. `drucker+mueller.hans@print.example.ch`).
Mail sent to that alias is printed by the host's mail pipeline,
and a row in `print_jobs` is created so the recipient can confirm
pickup via a token URL.

## What this module is, and isn't

This module owns **only** the database side and the public pickup
endpoints. The host owns:

- IMAP polling / SMTP receiving
- Actually printing the documents (CUPS, Brother MFC, …)
- Sending the pickup-link email back to the original sender

The host calls `POST /api/drucker/jobs` (admin-authenticated) once
the document is queued at the printer, and this module returns the
public pickup URL.

## REST API

| Method | Path | Auth |
|---|---|---|
| GET | `/api/pickup/:token` | public |
| POST | `/api/pickup/:token` | public |
| GET | `/api/drucker/jobs` | `drucker:read` |
| POST | `/api/drucker/jobs` | `drucker:write` |
| POST | `/api/drucker/jobs/:token/cancel` | admin |

## Module options

```jsonc
{
  "modules": {
    "drucker": {
      "enabled": true,
      "options": {
        "tagPrefix": "drucker",
        "domain": "print.example.ch",
        "publicBaseUrl": "https://stweg.example.ch",
        "permissionKey": "drucker",
        "autoCancelAfterDays": 30,
        "printers": {
          "Main": "drucker-main",
          "Cellar": "drucker-cellar"
        }
      }
    }
  }
}
```

## Helpers

```ts
import { buildDruckerTag, isDruckerTag, extractSlug } from '@sam/module-drucker';

buildDruckerTag('Hans Müller', opts);             // drucker+mueller.hans@print.example.ch
isDruckerTag('drucker+x@print.example.ch', opts); // true
extractSlug('drucker+x@print.example.ch', opts);  // 'x'
```

## Cron

`auto-cancel-stale` runs daily and marks jobs as `cancelled` once
they exceed `autoCancelAfterDays` without pickup.

## Permissions declared

| Key | Scopes | Description |
|---|---|---|
| `drucker` | read, write | Manage print jobs |
