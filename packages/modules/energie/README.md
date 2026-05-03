# @sam/module-energie

Energy and utility metering — collects readings from external
collectors (ioBroker, Modbus poller, Shelly, Loxone, …) and exposes
them as a queryable time series.

The module does not poll meters itself; it only accepts pushes via
`POST /api/energie/ingest` (authenticated with a shared secret) and
serves history queries to the UI.

## REST API

| Method | Path | Auth |
|---|---|---|
| GET | `/api/energie/meters` | `energie:read` |
| POST | `/api/energie/meters` | admin |
| GET | `/api/energie/meters/:id/readings?von=…&bis=…` | `energie:read` |
| POST | `/api/energie/ingest` | shared-secret header |
| GET | `/api/energie/tariffs` | `energie:read` |
| POST | `/api/energie/tariffs` | admin |

## Module options

```jsonc
{
  "modules": {
    "energie": {
      "enabled": true,
      "options": {
        "readPermissionKey": "energie",
        "ingestHeaderName": "x-sam-ingest-key",
        "ingestSecretEnv":  "SAM_ENERGIE_INGEST_KEY",
        "defaultUnit": "kWh",
        "maxRange": 10000
      }
    }
  }
}
```

The host must export `SAM_ENERGIE_INGEST_KEY=…` (or whatever name
you configure) — the ingest endpoint refuses the request otherwise.

## Ingest payload

```jsonc
// single reading
{ "meter_id": "stweg3-rw9-allg", "value": 12345.67, "timestamp": "2026-05-04T12:00:00Z", "source": "iobroker" }

// batch
{ "readings": [ { "meter_id": "...", "value": 1.23 }, ... ] }
```

## Permissions declared

| Key | Scopes | Description |
|---|---|---|
| `energie` | read | View meters and readings |
