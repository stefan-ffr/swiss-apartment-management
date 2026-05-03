# @sam/module-wohnungen

Apartments + occupants (owners, tenants, managers).

## Concepts

- **Wohnung** — one unit (apartment, parking spot, hobby room, …).
  Belongs to a STWEG via `stweg_nr` (must match an entry in
  `tenant.config.json#stwegen[].nr`).
- **Wohnungs-Kontakt** — a person linked to a Wohnung with a role
  (`eigentuemer`, `mieter`, `verwalter`, `bewohner`, `sonstige`).
- **Time-bounded occupancy** — each kontakt has an optional
  `gueltig_ab` (start date). When a kontakt with `gueltig_ab` <= today
  exists alongside an older active kontakt of the same role, a daily
  cron archives the predecessor (sets `archiviert_am`). History is
  preserved, never deleted.

## REST API

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/api/wohnungen/:stweg` | `wohnungen:read` | List + active kontakte |
| GET | `/api/wohnungen/:stweg/:id` | `wohnungen:read` | Single, with active kontakte |
| POST | `/api/wohnungen/:stweg` | `wohnungen:write` | Create |
| PUT | `/api/wohnungen/:stweg/:id` | `wohnungen:write` | Update + saveKontakte |
| DELETE | `/api/wohnungen/:stweg/:id` | `wohnungen:write` | Cascades to kontakte |
| GET | `/api/wohnungen/:stweg/:id/historie` | `wohnungen-historie:read` | Archived kontakte only |
| POST | `/api/wohnungen/:stweg/:id/kontakte/:kid/archive` | `wohnungen:write` | Manual archive |

## Save-Kontakte semantics (history-preserving)

`PUT /api/wohnungen/:stweg/:id` accepts `body.kontakte: KontaktInput[]`.
For each item:

- carries an `id` matching an active row → **UPDATE** (in place)
- no `id` (new entry) → **INSERT** (with `gueltig_ab` from body)

Active rows whose IDs are absent from the body are not deleted —
they are **archived** by setting `archiviert_am = CURRENT_DATE`.
Archived rows are never modified by this endpoint.

## Cron

`auto-archive-superseded` runs every 24 h and, in a single SQL
statement, marks predecessors as archived when a same-role kontakt
with later `gueltig_ab` becomes active today.

## Module options

```jsonc
{
  "modules": {
    "wohnungen": {
      "enabled": true,
      "options": {
        "permissionKey": "wohnungen",
        "historyPermissionKey": "wohnungen-historie",
        "defaultAuthentikZugangPerRolle": {
          "eigentuemer": true,
          "verwalter": true,
          "mieter": null,
          "bewohner": null,
          "sonstige": null
        }
      }
    }
  }
}
```

## Permissions declared

| Key | Scopes | Description |
|---|---|---|
| `wohnungen` | read, write | View / edit apartments and contacts |
| `wohnungen-historie` | read | View archived contacts |
