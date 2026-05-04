# Deployment overlays

The base [`../docker-compose.yml`](../docker-compose.yml) ships only
SAM + Postgres. Pick one or more overrides:

| File | Purpose |
|---|---|
| [`compose.dev.yml`](./compose.dev.yml) | Adds **mailpit** + **baikal** for local development. Exposes ports on the host. |
| [`compose.production.yml`](./compose.production.yml) | Hardening: `restart=always`, 127.0.0.1-only port bind, read-only fs, log/memory caps. |
| [`compose.with-external-mailcow.yml`](./compose.with-external-mailcow.yml) | Joins the external `mailcowdockerized_mailcow-network` so SAM can talk to a separately-deployed Mailcow stack. |

Compose merges files left-to-right; values from later files override
earlier ones.

## Common combinations

```bash
# Local development
docker compose -f docker-compose.yml -f deploy/compose.dev.yml up --build

# Production, SAM only (mail is external SMTP2GO over the public internet)
docker compose -f docker-compose.yml -f deploy/compose.production.yml up -d --build

# Production, SAM + Mailcow on the same host
docker compose -f docker-compose.yml \
               -f deploy/compose.production.yml \
               -f deploy/compose.with-external-mailcow.yml \
               up -d --build
```

## Why the split?

- **Lifecycles differ.** Mailcow runs its own `update.sh` monthly and
  pulls 8+ container updates at once. Mixing it into SAM's compose
  means every `pnpm-lock.yaml` change tempts you to also pull Mailcow.
- **Failure isolation.** A broken SAM migration shouldn't cycle
  Mailcow's mariadb / dovecot / rspamd containers. A Mailcow update
  shouldn't restart SAM mid-cron.
- **Security postures differ.** Mailcow exposes :25/:465/:587/:143/:993
  to the internet. SAM should sit behind a reverse proxy and only
  listen on 127.0.0.1. Different containers, different exposure.
- **Resource sizing differs.** Mailcow is heavy (rspamd + clamav
  alone want 1.5 GB RAM); SAM is light (~100 MB). They scale
  independently.
