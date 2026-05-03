# @sam/module-waschkueche

Laundry-room booking + per-resident usage and billing tracking.

## Resources

- **wasch_rooms** — bookable rooms; `energy_meter_id` and `door_id`
  link to optional hardware integrations the host provides.
- **wasch_reservations** — slot bookings (start/end, recurring opt.)
  keyed on the OIDC `sub` of the booking user.
- **wasch_sessions** — actual usage (started_at/ended_at + energy
  consumption).
- **wasch_billing** — monthly aggregates per user.

Door-access enforcement (UniFi etc.) and meter polling are not part
of this module — they live in the host because they depend on
hardware-specific integrations.

## REST API

| Method | Path | Auth |
|---|---|---|
| GET | `/api/wasch/rooms` | `waschkueche:read` |
| POST | `/api/wasch/rooms` | admin |
| PUT | `/api/wasch/rooms/:id` | admin |
| GET | `/api/wasch/reservations` | `waschkueche:read` |
| POST | `/api/wasch/reservations` | `waschkueche:write` |
| DELETE | `/api/wasch/reservations/:id` | `waschkueche:write` (own only) |
| GET | `/api/wasch/my/reservations` | `waschkueche:read` |
| GET | `/api/wasch/my/sessions` | `waschkueche:read` |
| GET | `/api/wasch/my/costs` | `waschkueche:read` |

## Module options

```jsonc
{
  "modules": {
    "waschkueche": {
      "enabled": true,
      "options": {
        "permissionKey": "waschkueche",
        "maxSlotMinutes": 240,
        "maxAdvanceDays": 28,
        "allowRecurring": true,
        "costPerKwh": 0.30
      }
    }
  }
}
```

## Conflict detection

Reservations use a Postgres range overlap check
(`tstzrange && tstzrange`) to reject double-bookings atomically.

## Permissions declared

| Key | Scopes | Description |
|---|---|---|
| `waschkueche` | read, write | Book / view laundry rooms |
