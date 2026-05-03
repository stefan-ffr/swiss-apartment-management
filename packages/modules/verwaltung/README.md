# @sam/module-verwaltung

External property-management firm tracker — the *Hausverwaltung* /
*Liegenschaftsverwaltung* (the company that handles billing, AGM
organisation, contractor coordination etc. on behalf of the STWEG).

Different from `@sam/module-wohnungen`, which deals with apartment
*owners and tenants*.

## REST API

Public (no auth):

| Method | Path | Notes |
|---|---|---|
| GET | `/api/verwaltungen/public` | Active firms only, no credentials, no notes |

Admin (requires `verwaltung` permission):

| Method | Path | Scope |
|---|---|---|
| GET | `/api/verwaltungen` | read |
| POST | `/api/verwaltungen` | write |
| PUT | `/api/verwaltungen/:id` | write |
| DELETE | `/api/verwaltungen/:id` | write |
| POST | `/api/verwaltungen/:id/kontakte` | write |
| PUT | `/api/verwaltungen/kontakte/:kid` | write |
| DELETE | `/api/verwaltungen/kontakte/:kid` | write |

## Module options

```jsonc
{
  "modules": {
    "verwaltung": {
      "enabled": true,
      "options": {
        "permissionKey": "verwaltung",
        "exposePublicEndpoint": true
      }
    }
  }
}
```

Set `exposePublicEndpoint: false` if your tenant requires the firm
list to be authenticated as well.

## Schema

`verwaltungen` carries one row per firm + contract metadata
(`vertrag_von`, `vertrag_bis`, `kuendigungsfrist_monate`,
`kuendigung_eingereicht_am`) and the platform credentials
(`plattform_url`, `plattform_user`, `plattform_pass`).

`stweg_nr` may be `NULL` when the firm manages all STWEGen.

`verwaltungs_kontakte` lists the named individuals at the firm
(Sachbearbeiter*innen).

## Permissions declared

| Key | Scopes | Description |
|---|---|---|
| `verwaltung` | read, write | Manage external management firms |
