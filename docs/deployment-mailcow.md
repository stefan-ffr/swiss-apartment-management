# Co-deploying SAM with Mailcow

This is the recommended topology for self-hosted operation: Mailcow
provides the mail plane, SAM provides the application plane, both
on the same Docker host (typically a single Proxmox LXC), each
managed via its own `docker-compose.yml`.

## Why two separate stacks?

Mailcow and SAM have very different lifecycles, exposures and
resource profiles. Putting them in one compose file is convenient
on day one and painful on day 100.

| Aspect | Mailcow | SAM |
|---|---|---|
| Update cadence | Monthly upstream `update.sh`, pulls 8+ images | Per git push |
| Public ports | `25 / 465 / 587 / 143 / 993 / 80 / 443` | None (sits behind reverse proxy) |
| Memory floor | ~2 GB (rspamd + clamav alone) | ~150 MB |
| Restart blast | Mariadb + dovecot + rspamd cycle is non-trivial | Single Node process |
| Data on disk | Mailboxes, queues, logs (TBs over time) | Postgres + uploads (GBs) |

Coupling them means a broken SAM migration risks your mail flow,
and a Mailcow update risks restarting SAM mid-cron. Separating
them is essentially a hard requirement for production.

## Target layout

```text
/opt/
├── mailcow-dockerized/           ← upstream repo, owns its lifecycle
│   ├── docker-compose.yml
│   ├── mailcow.conf
│   └── data/
└── sam/                          ← this repo
    ├── docker-compose.yml
    ├── deploy/
    │   ├── compose.production.yml
    │   └── compose.with-external-mailcow.yml
    ├── tenant.config.json
    └── .env
```

The two stacks talk via Docker networks: Mailcow creates a
network called `mailcowdockerized_mailcow-network` when it comes
up, and SAM joins that network through the
[`compose.with-external-mailcow.yml`](../deploy/compose.with-external-mailcow.yml)
overlay.

## Step-by-step

### 1. Deploy Mailcow

Follow upstream:

```bash
cd /opt
git clone https://github.com/mailcow/mailcow-dockerized
cd mailcow-dockerized
./generate_config.sh        # asks for your mail FQDN
docker compose pull
docker compose up -d
```

Reach the admin UI at `https://<your-mail-fqdn>/`. Default credentials
are documented in Mailcow's README — change them immediately.

### 2. Provision a SAM API key + accounts in Mailcow

In the Mailcow UI:

1. **Configuration → Configuration & Details → Access → API**
   Enable "Read/Write API access" and copy the API key.
2. **Configuration → Mail Setup → Domains** add your domain (the
   one in `tenant.config.json#tenant.domain`).
3. (Optional) **Configuration → Mail Setup → Mailboxes**: create
   `printer-ingest@yourdomain` (drucker bridge target),
   `verteiler-log@yourdomain` (audit BCC), `noreply@yourdomain`
   (outbound from-address).

### 3. Wire SAM

In `tenant.config.json`:

```jsonc
{
  "modules": {
    "mailcow": {
      "enabled": true,
      "options": {
        "apiUrl": "https://nginx-mailcow",         // internal DNS
        "apiKeyEnv": "MAILCOW_API_KEY",
        "defaultDomain": "yourdomain",
        "smtp": {
          "host": "postfix-mailcow",
          "port": 587,
          "secure": false,
          "userEnv": "MAILCOW_SMTP_USER",
          "passwordEnv": "MAILCOW_SMTP_PASSWORD",
          "from": "noreply@yourdomain"
        },
        "imap": {
          "host": "dovecot-mailcow",
          "port": 993,
          "secure": true,
          "userEnv": "MAILCOW_IMAP_USER",
          "passwordEnv": "MAILCOW_IMAP_PASSWORD",
          "mailbox": "INBOX",
          "moveProcessedTo": "Processed"
        },
        "bridges": {
          "verteiler": {
            "enabled": true,
            "auditBcc": "verteiler-log@yourdomain",
            "syncIntervalMs": 900000
          },
          "drucker": {
            "enabled": true,
            "ingestAddress": "printer-ingest@yourdomain",
            "syncIntervalMs": 900000
          }
        }
      }
    }
  }
}
```

In `.env`:

```
MAILCOW_API_KEY=<paste from Mailcow UI>
MAILCOW_SMTP_USER=noreply@yourdomain
MAILCOW_SMTP_PASSWORD=<password from Mailcow>
MAILCOW_IMAP_USER=printer-ingest@yourdomain
MAILCOW_IMAP_PASSWORD=<password from Mailcow>
```

### 4. Bring SAM up on the shared network

```bash
cd /opt/sam
docker compose -f docker-compose.yml \
               -f deploy/compose.production.yml \
               -f deploy/compose.with-external-mailcow.yml \
               up -d --build
```

The third overlay declares the external network — SAM joins
`mailcowdockerized_mailcow-network` and can now resolve
`nginx-mailcow`, `postfix-mailcow`, `dovecot-mailcow` by name.

### 5. Verify

```bash
# health endpoint up
curl http://127.0.0.1:3000/healthz

# Mailcow API reachable from SAM
docker compose exec sam wget -qO- \
  --header="X-API-Key: $MAILCOW_API_KEY" \
  http://nginx-mailcow/api/v1/get/mailbox/all | head -c 200

# trigger the verteiler bridge
curl -X POST http://127.0.0.1:3000/api/mailcow/bridges/verteiler/sync
# → check Mailcow UI: aliases now match email_verteiler rows
```

## What the bridges actually do

When `bridges.verteiler.enabled = true`, every active row in
`email_verteiler` is materialised as a native Mailcow alias whose
`goto` is the comma-separated resolved member list. Mail to the
list address is delivered by **Mailcow** to all members natively
— SAM never sees it. This is why we don't need an IMAP poller at
all in the typical Mailcow setup.

When a member set changes (a tenant moves out, an
authentik group changes), the bridge cron re-runs every 15 min
and updates the alias. For instant updates, hit
`POST /api/mailcow/bridges/verteiler/sync` from the relevant
admin handler.

When `bridges.drucker.enabled = true`, every drucker-tagged email
in `wohnungen_kontakte` becomes an alias forwarding to
`printer-ingest@yourdomain`. The host's mail pipeline (LMTP
filter, IMAP poller, or whatever you wire) picks up incoming mail
from there and creates `print_jobs` rows + sends pickup links.

## Updating

The two stacks update independently:

```bash
# Mailcow (monthly)
cd /opt/mailcow-dockerized
./update.sh

# SAM (whenever you push)
cd /opt/sam
git pull
docker compose -f docker-compose.yml \
               -f deploy/compose.production.yml \
               -f deploy/compose.with-external-mailcow.yml \
               up -d --build sam
```

A failure in either has no effect on the other.

## Co-deployment on Proxmox

Two LXCs, one Mailcow, one SAM, each on the same Proxmox host but
their own filesystem and update window. The shared Docker network
is host-local — it doesn't span LXC containers. So if you really
want them in separate LXCs, point SAM at Mailcow's public hostname
(over the LAN) instead of the internal Docker DNS:

```jsonc
"apiUrl": "https://mail.yourdomain"
```

In that case the bridge calls go through Mailcow's nginx like any
external client; you trade a few ms of overhead for stronger
isolation.
