# Deployment

SAM is built to run inside a single OCI container, plus a Postgres
database. Two supported targets:

- **Docker / Docker Compose** — simplest, works on any Linux host
  or Docker Desktop.
- **Proxmox LXC** — for the typical small-condo deployment where a
  homelab Proxmox cluster is already in place. SAM runs as a
  Docker container *inside* an LXC, or natively as a systemd
  service.

## A) Docker Compose (recommended for dev / small prod)

```bash
git clone https://github.com/stefan-ffr/swiss-apartment-management.git
cd swiss-apartment-management
cp tenant.config.example.json tenant.config.json   # edit for your STWEG
cp .env.example .env                               # fill in secrets
docker compose up --build -d
docker compose logs -f sam
```

The bundled compose stack starts:

- `postgres` — datastore
- `mailpit` — capture-and-inspect SMTP server (UI on :8025)
- `baikal` — minimal Sabre/DAV server for testing the Telefonbuch
  CardDAV sync (UI on :8800)
- `sam` — the example host with all 10 modules enabled

In production you typically replace `mailpit` with a real Mailcow
deployment on a separate host, and `baikal` with whatever CardDAV
server you already use (Nextcloud, etc.).

### Updating

```bash
git pull
docker compose build sam
docker compose up -d sam
```

Migrations run automatically on startup (the host calls each
module's `migrationsDir`; `sam_migrations` tracks applied files).

## B) Proxmox LXC

### Option B1 — Docker inside an LXC (recommended)

```text
Proxmox host
└── LXC container (Debian 12, unprivileged, nesting=1)
    ├── docker engine
    └── docker compose stack (as above)
```

LXC config tweaks needed for Docker:

```text
features: keyctl=1,nesting=1
# If you mount NFS/CIFS for documents:
lxc.apparmor.profile: unconfined
```

### Option B2 — Native LXC + systemd

When you want to skip Docker entirely:

```bash
# inside the LXC
apt install -y nodejs postgresql
useradd -m -s /bin/bash sam
su - sam
git clone https://github.com/stefan-ffr/swiss-apartment-management.git
cd swiss-apartment-management
corepack enable && corepack prepare pnpm@9.15.0 --activate
pnpm install
pnpm build
pnpm --filter @sam/example-host build
```

Then a systemd unit:

```ini
# /etc/systemd/system/sam.service
[Unit]
Description=Swiss Apartment Management
After=network.target postgresql.service

[Service]
Type=simple
User=sam
WorkingDirectory=/home/sam/swiss-apartment-management
EnvironmentFile=/etc/sam.env
ExecStart=/usr/bin/node ./examples/host/dist/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/sam.env` holds the same variables as `.env.example`.

```bash
systemctl daemon-reload
systemctl enable --now sam
journalctl -u sam -f
```

### Mailcow co-location

If you also run Mailcow on the Proxmox cluster, point
`tenant.config.json#modules.mailcow.options.apiUrl` at it via the
internal Proxmox network for both speed and to bypass any external
brute-force rate limits. The `bridges.verteiler` and
`bridges.drucker` then realise list and printer aliases natively
in Mailcow — SAM stops polling IMAP for those flows and just keeps
the alias goto fields in sync.

## Health checks

- `GET /healthz` → `{ ok: true, tenant: "<id>" }` once bootstrap
  finished. Use this for Docker `healthcheck:` and HAProxy / Traefik
  health probes.

## Backups

Two things to back up:

1. **Postgres dump** — `pg_dump -F c sam > sam-$(date +%F).dump`
   (or your usual provider snapshot). All module state lives in
   Postgres.
2. **Document directory** — whatever path you set in
   `tenant.config.json#storage.path` (PDFs, snapshots, …). When
   you store them on a CIFS/NFS mount, the mount itself is the
   thing to back up — not the container.

The container is otherwise stateless and can be rebuilt from the
git tag at any time.
