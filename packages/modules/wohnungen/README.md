# @sam/module-wohnungen

Apartments + occupants (owners, tenants, managers).

## Concepts

- **Wohnung** — one unit (apartment, parking spot, hobby room, …).
  Belongs to a STWEG (`stweg_nr` from `tenant.config.json#stwegen[].nr`).
- **Wohnungs-Kontakt** — a person linked to a Wohnung with a role
  (`eigentuemer`, `mieter`, `verwalter`, `bewohner`, `sonstige`).
- **Time-bounded occupancy** — each kontakt has an optional
  `gueltig_ab`. When a successor's `gueltig_ab` passes, the
  predecessor of the same role is auto-archived (set
  `archiviert_am`). History is preserved, never deleted.

## Permissions declared

| Key | Scopes | Description |
|---|---|---|
| `wohnungen` | read, write | View / edit apartments and contacts |

History view (archived contacts) is gated to admin-equivalent groups
configured in `tenant.config.json#auth.adminGroups`.

## Status

Skeleton — DB schema present, business logic to be ported from
[Rosenweg/Website](https://github.com/Rosenweg/Website)
`api/server.js`.
