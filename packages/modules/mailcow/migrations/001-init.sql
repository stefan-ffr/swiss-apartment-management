-- @sam/module-mailcow — bookkeeping for SAM-managed Mailcow objects
--
-- Mailcow can hold mailboxes and aliases that are not under SAM
-- control (existing user accounts, manually-created lists, etc).
-- We track only the objects we provisioned so de-provisioning never
-- touches foreign data.

CREATE TABLE IF NOT EXISTS mailcow_managed_mailboxes (
    address       VARCHAR(320) PRIMARY KEY,
    name          VARCHAR(255),
    quota_mb      INTEGER,
    user_sub      VARCHAR(255),                  -- linked OIDC subject if known
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mailcow_managed_aliases (
    address       VARCHAR(320) PRIMARY KEY,
    goto          TEXT NOT NULL,                 -- comma-separated targets
    purpose       VARCHAR(120),                  -- e.g. "verteiler", "drucker"
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    last_seen_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION mailcow_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mailcow_mb_updated_at ON mailcow_managed_mailboxes;
CREATE TRIGGER trg_mailcow_mb_updated_at
    BEFORE UPDATE ON mailcow_managed_mailboxes
    FOR EACH ROW EXECUTE FUNCTION mailcow_touch_updated_at();

DROP TRIGGER IF EXISTS trg_mailcow_al_updated_at ON mailcow_managed_aliases;
CREATE TRIGGER trg_mailcow_al_updated_at
    BEFORE UPDATE ON mailcow_managed_aliases
    FOR EACH ROW EXECUTE FUNCTION mailcow_touch_updated_at();
