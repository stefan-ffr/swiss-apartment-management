# @sam/module-unterschriftenlisten

Snapshot store + return-checklist for signature sheets / circular
votes (Zirkularbeschlüsse).

The actual sheet generation (HTML → PDF) is host-side because it
depends on the tenant's branding, formatting and content rules.
This module provides the **persistence layer**:

1. After the host generates a PDF, it computes a stable hash and
   posts the structured snapshot + optional `pdf_path` here.
2. A public verification page can later look up the hash to prove
   the sheet is unaltered (`/api/unterschriftenliste/verify-json?hash=…`).
3. Per-letter return statuses (received? vote? notes?) are tracked
   in `unterschriftenliste_rueckläufe`.

## REST API

Public:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/unterschriftenliste/verify-json?hash=…` | Authenticity proof (JSON) |
| GET | `/api/unterschriftenliste/snapshot/:hash.pdf` | Original PDF, if `pdfRoot` configured |

Authenticated:

| Method | Path | Auth |
|---|---|---|
| GET | `/api/unterschriftenliste/history` | `unterschriftenlisten:read` |
| POST | `/api/unterschriftenliste` | `unterschriftenlisten:write` |
| GET | `/api/unterschriftenliste/:hash/rueckläufe` | `unterschriftenlisten:read` |
| PUT | `/api/unterschriftenliste/:hash/rueckläufe/:idx` | `unterschriftenlisten:write` |

## Module options

```jsonc
{
  "modules": {
    "unterschriftenlisten": {
      "enabled": true,
      "options": {
        "permissionKey": "unterschriftenlisten",
        "pdfRoot": "/var/lib/sam/documents/unterschriftenlisten",
        "verificationPageUrl": "https://stweg.example.ch/echtheitspruefung.html"
      }
    }
  }
}
```

The hash is derived by the host before persisting; this module
treats it as opaque (must match `[a-f0-9]{16,64}`). Including the
hash in the printed sheet's footer is what makes the verification
page meaningful.

## Permissions declared

| Key | Scopes | Description |
|---|---|---|
| `unterschriftenlisten` | read, write | Manage circular vote sheets |
