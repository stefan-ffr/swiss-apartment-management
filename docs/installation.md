# Installation

This document walks you through every supported way to run Swiss
Apartment Management. Pick the section that matches your topology.

## Table of contents

1. [One-liner installer (fastest)](#one-liner-installer)
2. [Manual Docker Compose](#manual-docker-compose)
3. [Proxmox LXC + Docker](#proxmox-lxc--docker)
4. [Proxmox LXC bare + systemd](#proxmox-lxc-bare--systemd)
5. [Mail backend selection (SMTP2GO vs Mailcow)](#mail-backend-selection)
6. [TLS termination + reverse proxy](#tls-termination--reverse-proxy)
7. [Backups](#backups)
8. [Updates](#updates)
9. [Troubleshooting](#troubleshooting)

---

## One-liner installer

Fast path — runs `scripts/install.sh` interactively. Asks for
tenant id, name, domain; generates strong random secrets; clones
the repo; brings the dev stack up.

```bash
curl -fsSL https://raw.githubusercontent.com/stefan-ffr/swiss-apartment-management/main/scripts/install.sh | bash
```

If you'd rather review first (recommended):

```bash
curl -fsSL https://raw.githubusercontent.com/stefan-ffr/swiss-apartment-management/main/scripts/install.sh -o install.sh
less install.sh        # ← read it
bash install.sh
```

Non-interactive (CI / config-management):

```bash
SAM_DIR=/opt/sam \
SAM_TENANT_ID=mystweg \
SAM_TENANT_NAME='My STWEG' \
SAM_DOMAIN=stweg.example.ch \
SAM_NON_INTERACTIVE=1 \
bash install.sh
```

Prerequisites the installer **does not** install for you:
- Docker Engine + the `docker compose` v2 plugin
- `git`, `curl`, `python3` (used to stamp the JSON config)

What it produces:
- Repo cloned to `$SAM_DIR` (default `/opt/sam`)
- `tenant.config.json` stamped with your tenant ids
- `.env` (mode 600) with cryptographically strong random passwords
- A running dev stack (postgres + sam + mailpit + baikal)

---

## Manual Docker Compose

Full control. Roughly what the installer does but you do each step.

```bash
git clone https://github.com/stefan-ffr/swiss-apartment-management.git /opt/sam
cd /opt/sam

cp tenant.config.example.json tenant.config.json
$EDITOR tenant.config.json   # tenant.id, stwegen, auth, modules

cp .env.example .env
$EDITOR .env                 # set POSTGRES_PASSWORD + SAM_ENERGIE_INGEST_KEY at least

# Development
docker compose -f docker-compose.yml -f deploy/compose.dev.yml up -d --build

# Production (no exposed dev fixtures, hardened)
docker compose -f docker-compose.yml -f deploy/compose.production.yml up -d --build
```

The base [docker-compose.yml](../docker-compose.yml) has only SAM
+ Postgres. Overlays in [`deploy/`](../deploy/) add what you need.
See [`deploy/README.md`](../deploy/README.md) for the layout.

---

## Proxmox LXC + Docker

Recommended for the typical small-condo / homelab setup.

```text
Proxmox host
└── LXC container (Debian 12, unprivileged, nesting=1, keyctl=1)
    └── Docker engine
        └── docker compose stack (SAM)
        └── (optionally) docker compose stack (Mailcow, separate)
```

### Container creation

```bash
pct create 200 \
  local:vztmpl/debian-12-standard_*.tar.zst \
  --hostname sam --cores 2 --memory 2048 --swap 1024 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --rootfs local-lvm:20 \
  --features keyctl=1,nesting=1 \
  --unprivileged 1
pct start 200
pct enter 200
```

If you mount a CIFS or NFS share for documents:
```text
# /etc/pve/lxc/200.conf
lxc.apparmor.profile: unconfined
```
(unprivileged + apparmor unconfined for nested mounts).

### Inside the LXC

```bash
apt update && apt install -y curl ca-certificates git
curl -fsSL https://get.docker.com | sh
curl -fsSL https://raw.githubusercontent.com/stefan-ffr/swiss-apartment-management/main/scripts/install.sh | bash
```

That's it.

---

## Proxmox LXC bare + systemd

When you want zero Docker overhead.

```bash
# inside an LXC container, as root
apt install -y nodejs postgresql git
useradd -m -s /bin/bash sam

# Postgres
sudo -u postgres createuser sam
sudo -u postgres createdb -O sam sam
sudo -u postgres psql -c "ALTER USER sam WITH PASSWORD 'CHANGE_ME';"

# Source
sudo -u sam -i bash <<'EOF'
git clone https://github.com/stefan-ffr/swiss-apartment-management.git
cd swiss-apartment-management
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install
pnpm build
pnpm --filter @sam/example-host build
cp tenant.config.example.json tenant.config.json
$EDITOR tenant.config.json
EOF
```

`/etc/sam.env` (chmod 600, owner sam):

```
DB_PASSWORD=CHANGE_ME
SAM_ENERGIE_INGEST_KEY=$(openssl rand -base64 32)
TENANT_CONFIG=/home/sam/swiss-apartment-management/tenant.config.json
PORT=3000
LOG_LEVEL=info
# plus the same MAILCOW_*/SMTP2GO_*/etc. vars from .env.example
```

`/etc/systemd/system/sam.service`:

```ini
[Unit]
Description=Swiss Apartment Management
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=sam
WorkingDirectory=/home/sam/swiss-apartment-management
EnvironmentFile=/etc/sam.env
ExecStart=/usr/bin/node ./examples/host/dist/main.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/home/sam/swiss-apartment-management
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now sam
journalctl -u sam -f
```

---

## Mail backend selection

SAM ships **two** mail-integration modules. Pick one in
`tenant.config.json`:

| Topology | Enable | Pros | Cons |
|---|---|---|---|
| Self-hosted Mailcow on the same host | `mailcow.enabled = true` | Lists become native aliases (no IMAP-loop), full control | Heavy stack, monthly upstream updates |
| Managed SMTP2GO | `smtp2go.enabled = true` | Zero infra to operate, deliverability is their problem | Paid; inbound needs Cloudflare worker or Gmail-IMAP poll |
| Both enabled | both `true` | Migration path: enable Mailcow, drain SMTP2GO | Pick one as the active mailer in your host |

Cross-references:
- [`packages/modules/mailcow/README.md`](../packages/modules/mailcow/README.md)
- [`packages/modules/smtp2go/README.md`](../packages/modules/smtp2go/README.md)
- [Mailcow co-deployment guide](./deployment-mailcow.md)

When **both modules are enabled**, the example host
([`examples/host/src/main.ts`](../examples/host/src/main.ts))
prefers Mailcow's mailer. To force SMTP2GO instead, write your
own host package and select it explicitly — that's three lines of
code (see the snippet in the smtp2go README).

---

## TLS termination + reverse proxy

SAM listens on plain HTTP on port 3000. Put a reverse proxy in
front. Two minimal examples:

### Caddy

```caddyfile
stweg.example.ch {
    reverse_proxy 127.0.0.1:3000
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name stweg.example.ch;

    ssl_certificate     /etc/letsencrypt/live/stweg.example.ch/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stweg.example.ch/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

When using `compose.production.yml`, SAM only binds to 127.0.0.1
so the reverse proxy is the only public ingress.

---

## Backups

Two things to back up:

1. **Postgres dump** —
   ```bash
   docker compose exec postgres pg_dump -F c -U sam sam > sam-$(date +%F).dump
   ```
   All module state lives here.

2. **Document directory** — whatever path is configured under
   `storage.path` in your `tenant.config.json` (PDFs, snapshots,
   uploads). When backed by a CIFS/NFS mount, back up the
   share, not the container.

Container images and source are immutable artefacts — they can be
rebuilt from the git tag and don't need backing up.

---

## Updates

```bash
cd /opt/sam
git pull
docker compose -f docker-compose.yml -f deploy/compose.production.yml up -d --build sam
```

Migrations run automatically on startup; the host's
`runMigrations()` records applied files in `sam_migrations` and
skips already-applied ones.

For breaking changes (major version bumps), the release notes will
call them out.

---

## Troubleshooting

**`/healthz` returns 200 but a route returns 401**
→ Auth is working. Check the user's groups in your IdP, and which
`adminGroups` are listed in `tenant.config.json#auth`.

**Migrations didn't run**
→ Logs say `[<module>] running migrations`. If absent: the module
isn't enabled, or `migrationsDir` doesn't resolve. Check
`tenant.config.json#modules.<name>.enabled`.

**Mailcow bridge says "no GroupResolver wired"**
→ The example host's resolver throws on purpose. Tenants must
inject one — see
[`packages/modules/verteiler/README.md`](../packages/modules/verteiler/README.md).

**SMTP2GO inbound returns 401 "Bad signature"**
→ The Cloudflare worker (or whatever signs the body) must compute
HMAC-SHA256 over the **exact** raw body bytes and pass the hex
digest in the configured signature header. Body parsing happens
*after* signature verification.

**Mailpit shows mail; my real users don't**
→ You're still wired to mailpit (port 1025). Switch
`tenant.config.json#modules.{mailcow|smtp2go}.options.smtp.host`
away from `mailpit:1025`.

**Postgres won't come up: `role "sam" does not exist`**
→ The volume `sam_postgres_data` was created with a different
user. Either edit `.env` to match the existing data, or
`docker compose down -v` (destroys data) and let it init fresh.
