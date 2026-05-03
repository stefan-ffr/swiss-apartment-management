-- @sam/module-verteiler — mailing-list distribution
--
-- email_verteiler  : list definitions
-- email_log        : audit log for every send (manual or batch)

CREATE TABLE IF NOT EXISTS email_verteiler (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    email_address VARCHAR(255) NOT NULL UNIQUE,
    stweg_nr      INTEGER,
    description   TEXT,
    /* Recipient resolution: list of group names that the host's
     * resolver translates to email addresses. Free-form so tenants
     * can use their own conventions (Authentik group names, LDAP DNs,
     * "verwaltung:STWEG3" pseudo-groups, ...). */
    group_names   JSONB NOT NULL DEFAULT '[]'::jsonb,
    /* Static fallback recipients (for lists that bypass groups) */
    members       JSONB NOT NULL DEFAULT '[]'::jsonb,
    active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verteiler_stweg ON email_verteiler(stweg_nr, active);

CREATE TABLE IF NOT EXISTS email_log (
    id                  SERIAL PRIMARY KEY,
    trigger             VARCHAR(80),
    verteiler_id        INTEGER REFERENCES email_verteiler(id) ON DELETE SET NULL,
    from_email          VARCHAR(255),
    from_name           VARCHAR(255),
    to_addresses        TEXT,
    subject             TEXT,
    recipients_count    INTEGER NOT NULL DEFAULT 0,
    recipients_list     JSONB,
    failed_recipients   JSONB,
    has_attachments     BOOLEAN NOT NULL DEFAULT FALSE,
    status              VARCHAR(40) NOT NULL DEFAULT 'sent',  -- sent | partial | failed
    message_id          VARCHAR(255),
    error_message       TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_log_created ON email_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_verteiler ON email_log(verteiler_id);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log(status);

CREATE OR REPLACE FUNCTION email_verteiler_touch()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_email_verteiler_updated_at ON email_verteiler;
CREATE TRIGGER trg_email_verteiler_updated_at
    BEFORE UPDATE ON email_verteiler
    FOR EACH ROW EXECUTE FUNCTION email_verteiler_touch();
