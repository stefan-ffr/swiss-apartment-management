# Architecture

## Goals

1. **Mandantenfähigkeit pro Instanz** — one deployment serves one
   tenant (one STWEG group / housing cooperative). Kept simple by
   not multiplexing tenants in the database.
2. **Module sind isoliert** — every feature ships as an own package
   with its own DB tables (prefixed by module name), its own routes,
   and a clear permission contract.
3. **Konfig statt Code** — anything that varies per tenant lives in
   `tenant.config.json`, never in source.

## Module Contract

```ts
import type { Module } from '@sam/core';

const myModule: Module = {
  name: 'mymodule',
  displayName: 'My Module',
  version: '1.0.0',

  // SQL files in this directory are applied in lexical order, once.
  migrationsDir: '/abs/path/migrations',

  // Permission keys this module declares.
  permissions: [
    { key: 'mymodule', label: 'My Module', scopes: ['read', 'write'] },
  ],

  // Express routes.
  register(app, ctx) {
    app.get('/api/mymodule/...', async (req, res) => { /* ... */ });
  },

  // Scheduled jobs.
  cron: [
    { name: 'cleanup', schedule: { everyMs: 86_400_000 }, run: async (ctx) => { /* ... */ } },
  ],

  healthcheck: async (ctx) => ({ ok: true }),
};

export default myModule;
```

## Module Lifecycle

```
load tenant.config.json
        │
        ▼
register all imported modules
        │
        ▼
for each module where modules[name].enabled:
    run migrations  ─►  register routes  ─►  schedule cron
        │
        ▼
HTTP listen
```

## DB Conventions

- One Postgres database, one schema per tenant deploy.
- Each module owns tables prefixed with its name when conflict is
  likely (`verteiler_lists`, `waschkueche_bookings`). Generic names
  (`wohnungen`, `users`) are acceptable when the module is the sole
  owner.
- Migrations go in `<module>/migrations/NNN-description.sql`,
  applied via `runMigrations()` from `@sam/core`.
- A central `sam_migrations` table tracks applied files.

## Config Schema

See [tenant.config.example.json](../tenant.config.example.json) and
the Zod schema in `packages/core/src/config.ts`.

## Auth

Default provider is Authentik (OIDC). The core ships only an
`AuthService` interface; any OIDC IdP works. The auth module
verifies session/JWT, resolves groups, and answers permission
queries.

Permission resolution rules (recommended default):

1. Membership in `auth.adminGroups` ⇒ all permissions, write scope.
2. Membership in `<stweg-prefix>-ausschuss` ⇒ all permissions for
   that STWEG.
3. Membership in `<stweg-prefix>-eigentuemer` ⇒ read on most
   things, write on a permission-by-permission basis.
4. Anything else: explicit per-permission lookup (per-user override
   stored in DB).

These are defaults. Modules can implement their own checks via
`auth.hasPermission(user, key, scope)`.
