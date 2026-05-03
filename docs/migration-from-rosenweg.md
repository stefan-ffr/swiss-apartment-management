# Migration plan: Rosenweg → Swiss Apartment Management

The reference implementation lives at
[Rosenweg/Website](https://github.com/Rosenweg/Website). It is a
single-file Express app (`api/server.js`, ~8400 lines) plus
hand-written HTML pages. This document tracks the port to the
modular `@sam/*` architecture.

## Phase 1 — Skeleton ✅

- [x] Repo bootstrap, pnpm-workspace, TypeScript
- [x] `@sam/core` with config loader, plugin registry, migrations,
      auth-middleware contract (`ctx.middleware`)
- [x] `tenant.config.example.json` schema
- [x] AGPL-3.0 license, README, CI

## Phase 2 — telefonbuch ✅

- [x] `GET /api/telefonbuch` (de-duplicated per-person aggregate)
- [x] CardDAV-sync (hourly cron, Sabre/DAV-compatible)
- [x] vCard 3.0 generator
- [x] Module options validated with Zod

## Phase 3 — wohnungen ✅

- [x] Schema: wohnungen + wohnungen_kontakte (gueltig_ab / archiviert_am)
- [x] CRUD endpoints (list, single, create, update, delete)
- [x] history-preserving saveKontakte (UPDATE/INSERT/ARCHIVE)
- [x] Manual archive endpoint
- [x] History endpoint (gated to admin-equivalent groups)
- [x] Daily auto-archive cron

## Phase 4 — verwaltung ✅

- [x] verwaltungen + verwaltungs_kontakte schema
- [x] Public endpoint (no credentials), admin CRUD
- [x] Per-firm Kontaktpersonen sub-resource

## Phase 5 — verteiler ✅

- [x] email_verteiler + email_log schema
- [x] CRUD + send + resolve endpoints
- [x] Rate limiting (per-user)
- [x] Group-resolver service injection (no IdP lock-in)
- [x] Mailer service injection (no SMTP lib lock-in)
- [x] Inbound message processing (loop detection, blocklist)
- [x] Email log + last-100 viewing endpoint

## Phase 6 — drucker ✅

- [x] print_jobs schema with token-based pickup
- [x] Public pickup endpoints (no auth, hash-as-token)
- [x] Admin job creation + cancel endpoints
- [x] Tag-builder helpers (buildDruckerTag / isDruckerTag / extractSlug)
- [x] Auto-cancel cron for stale jobs

## Phase 7 — waschkueche ✅

- [x] wasch_rooms + wasch_reservations + wasch_sessions + wasch_billing
- [x] Booking + cancellation endpoints with conflict detection
- [x] Per-user views (my-reservations, my-sessions, my-costs)
- [x] Hardware integrations are deferred to host (energy_meter_id, door_id)

## Phase 8 — energie ✅

- [x] energy_meters + energy_readings + energy_tariffs
- [x] Shared-secret ingest endpoint (collector → API)
- [x] Time-series read endpoint
- [x] Tariff CRUD

## Phase 9 — unterschriftenlisten ✅

- [x] unterschriftenliste_snapshots + _rueckläufe schema
- [x] Public verify-json endpoint (authenticity proof)
- [x] Public PDF download (hash as token)
- [x] Snapshot persistence + Rücklauf-checklist endpoints

## Phase 10 — verification & integration testing

All modules built. Next step is to wire them up in an example host
and run integration tests across the full stack:

- [ ] `examples/host/` — bootstrap that loads all 8 modules with a
      Postgres + Authentik-mock stack via docker-compose
- [ ] Postgres-backed tests for migrations + cron jobs
- [ ] Cross-module flows:
      - Apartment update → Telefonbuch refresh → CardDAV propagation
      - Rüecklauf-row generated when Unterschriftenliste snapshot saved
      - Drucker tag → Verteiler resolution → Print job creation
      - Waschküche reservation → Energy meter → Billing aggregation

## Phase 11 — Production cutover

When all modules required by the Rosenweg deployment are ready and
test-covered, switch the production CI/CD over and archive the old
repo.

## Non-goals

- **Multi-tenant single-instance** — out of scope. Run one
  deployment per tenant.
- **Mobile-native apps** — the PWA stays the supported channel.
- **Custom auth provider** — Authentik is reference; any OIDC IdP
  is supported via the `AuthService` interface, but writing one is
  not in scope here.
