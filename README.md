# Swiss Apartment Management

A modular, open-source property-management platform for Swiss
condominium associations (Stockwerkeigentümergemeinschaften, STWEG)
and similar housing cooperatives.

> **Status:** early-stage greenfield. The reference implementation
> [Rosenweg/Website](https://github.com/Rosenweg/Website) is being
> refactored into modules and ported here. Not yet production-ready.

## Goals

- **Tenant-agnostic core** — no hard-coded names, addresses, groups
  or domains. Everything mandant-specific lives in
  [`tenant.config.json`](./tenant.config.example.json).
- **Plug-in architecture** — each feature (apartments, mailing list,
  laundry-room booking, energy monitor, …) is an independent package
  that registers itself with the core. Disable what you don't need.
- **Standards over lock-in** — Authentik / generic OIDC for SSO,
  CardDAV for contacts, IMAP/SMTP for mail, Postgres for storage.
- **Boring tech** — Node + TypeScript + Postgres + plain HTML/CSS +
  esbuild. No framework lock-in.

## Architecture (target)

```
┌─────────────────────────────────────────────┐
│            tenant.config.json               │  ← single source of truth
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────▼──────────────────────┐
│         packages/core                        │
│  - Config loader & validator                 │
│  - Plugin registry                           │
│  - Auth interface (OIDC / Authentik)         │
│  - Migration runner                          │
│  - HTTP server bootstrap (Express)           │
└──────────────────────┬──────────────────────┘
                       │   register()
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  modules/    │ │  modules/    │ │  modules/    │
│  wohnungen   │ │  verteiler   │ │  waschkueche │  …etc
└──────────────┘ └──────────────┘ └──────────────┘
       │               │               │
       └───────┬───────┴───────────────┘
               ▼
       ┌──────────────┐
       │ packages/web │  ← static frontend, served by core
       └──────────────┘
```

Each module exports:

```ts
export default {
  name: 'wohnungen',
  routes: (app, ctx) => { /* Express routes */ },
  migrations: './migrations',
  cron: [ /* scheduled jobs */ ],
  permissions: [ /* permission keys this module declares */ ],
};
```

The core loads only modules listed in `tenant.config.json#modules`.

## Quick start (once skeleton is wired)

```bash
pnpm install
cp tenant.config.example.json tenant.config.json
# edit tenant.config.json for your STWEG
pnpm migrate
pnpm dev
```

## Modules

| Package | Purpose | Status |
|---|---|---|
| `core` | Config, plugin loader, auth contract, migrations, HTTP server bootstrap | ported |
| `modules/wohnungen` | Apartments, owners/tenants, gueltig_ab + history | ported |
| `modules/verteiler` | Mailing lists with group-resolver / mailer injection, loop detection | ported |
| `modules/verwaltung` | External property-management firms + contacts | ported |
| `modules/waschkueche` | Laundry-room booking, sessions, billing | ported |
| `modules/energie` | Energy / utility metering (push-ingest, tariffs) | ported |
| `modules/drucker` | Per-resident print-job inbox + token pickup | ported |
| `modules/telefonbuch` | Phonebook (REST + CardDAV sync to Sabre/DAV) | ported |
| `modules/unterschriftenlisten` | Circular vote sheets, hash-verifiable snapshots | ported |
| `modules/mailcow` | Optional Mailcow integration: provisioning + Mailer + IMAP poller | ported |

## License

[AGPL-3.0-or-later](./LICENSE) — same license as Proxmox VE. If you
run a modified version as a network service, you must offer your
users the modified source code.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Issues and PRs welcome.
