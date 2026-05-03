# @sam/module-telefonbuch

Internal phonebook backed by `wohnungen_kontakte`. Two surfaces:

- **REST API** — `GET /api/telefonbuch` returns a deduplicated,
  per-person aggregate of all active contacts (one entry per
  `name`, even when the same person appears across multiple
  apartments).
- **CardDAV sync** — hourly cron that mirrors the same data into a
  Nextcloud (or any Sabre/DAV) addressbook so iOS native, Android
  via DAVx5, or Exchange ActiveSync clients can subscribe.

## Module options

```jsonc
{
  "modules": {
    "telefonbuch": {
      "enabled": true,
      "options": {
        "uidPrefix": "example",          // used for vCard UIDs
        "category": "Example Phonebook", // vCard CATEGORIES value
        "internalEmailPatterns": [
          "^drucker[a-z0-9]*\\+.*"       // hide internal printer-tag emails
        ],
        "syncIntervalMs": 3600000,
        "carddav": {
          "url":         "http://nextcloud_nextcloud",  // internal/private
          "publicUrl":   "https://cloud.example.ch",    // for trusted_domains Host header
          "username":    "carddav-sync",
          "passwordEnv": "NEXTCLOUD_APP_PASSWORD",      // env var holding app password
          "addressbook": "example-tel",
          "displayName": "Example Phonebook",
          "description": "Auto-synced internal phonebook"
        }
      }
    }
  }
}
```

If `carddav` is omitted, only the REST API is exposed (no sync).

## Notes & gotchas (ported from Rosenweg)

- Sabre/DAV does not reliably accept chunked `PUT`/`MKCOL` from
  Node fetch/undici. The module uses `node:http`/`https` directly
  with explicit `Content-Length` and `Connection: close`.
- When Nextcloud sits behind Cloudflare, prefer the **internal**
  URL (`url`) and override the `Host` header with `publicUrl` so
  `trusted_domains` validates without paying the egress IP's
  brute-force-detection toll.
- Deceased contacts (`Name (verstorben)`) are excluded from the
  CardDAV export but still listed in the API with `deceased: true`.

## Required tables

This module only reads. The schema is owned by
`@sam/module-wohnungen` and must be present:

- `wohnungen(id, stweg_nr, bezeichnung, typ, …)`
- `wohnungen_kontakte(id, wohnung_id, rolle, name, email, telefon, archiviert_am, …)`

## Permissions

Declares `telefonbuch` (read). The host should require this for
`GET /api/telefonbuch` and admin-equivalent for `POST /sync`.
