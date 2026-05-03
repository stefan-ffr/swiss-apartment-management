# Migration plan: Rosenweg → Swiss Apartment Management

The reference implementation lives at
[Rosenweg/Website](https://github.com/Rosenweg/Website). It is a
single-file Express app (`api/server.js`, ~8400 lines) plus
hand-written HTML pages. This document tracks the port to the
modular `@sam/*` architecture.

## Phase 1 — Skeleton (this commit)

- [x] Repo bootstrap, pnpm-workspace, TypeScript
- [x] `@sam/core` with config loader, plugin registry, migrations
- [x] `tenant.config.example.json` schema
- [x] Stub modules (8) with permission slots reserved
- [x] AGPL-3.0 license, README, CI

## Phase 2 — Lift & shift the easiest module

Pick **`telefonbuch`** first — it's almost stateless, has clear
boundaries, and exercises the auth + CardDAV-sync paths.

- [ ] Port DB schema (none required — reads from `wohnungen_kontakte`)
- [ ] Port `/api/telefonbuch` endpoint
- [ ] Port hourly CardDAV sync cron
- [ ] Port PWA frontend (manifest, service worker)
- [ ] Add tests against a Postgres test container

## Phase 3 — Wohnungen + Verwaltung

These two have the most schema and are the spine of everything else.

- [ ] Port `wohnungen` + `wohnungen_kontakte` (incl. gueltig_ab + history)
- [ ] Port `verwaltungen` + `verwaltungs_kontakte`
- [ ] Port admin UIs

## Phase 4 — Verteiler

Email distribution lists with bounce handling, IMAP polling, etc.
The most stateful module after Wohnungen.

## Phase 5 — Specialty modules

- [ ] `unterschriftenlisten` (signature sheets, snapshot PDFs)
- [ ] `drucker` (per-resident print inbox)
- [ ] `waschkueche` (booking system, hardware integration)
- [ ] `energie` (meter polling)

## Phase 6 — Production cutover

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
