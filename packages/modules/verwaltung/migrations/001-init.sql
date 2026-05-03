-- @sam/module-verwaltung — external property-management firms
--
-- Tracks the Hausverwaltung / Liegenschaftsverwaltung — the
-- *external* company that handles billing, AGM organisation,
-- contractor coordination etc. on behalf of one (or all) STWEG.

CREATE TABLE IF NOT EXISTS verwaltungen (
    id                          SERIAL PRIMARY KEY,
    stweg_nr                    INTEGER,                    -- NULL = all STWEGen
    firma_name                  VARCHAR(255) NOT NULL,
    adresse                     TEXT,
    telefon                     VARCHAR(100),
    email                       VARCHAR(255),
    plattform_name              VARCHAR(120),
    plattform_url               VARCHAR(500),
    plattform_user              VARCHAR(255),
    plattform_pass              TEXT,
    vertrag_von                 DATE,
    vertrag_bis                 DATE,
    kuendigungsfrist_monate     INTEGER,
    kuendigung_eingereicht_am   DATE,
    dokument_pfad               VARCHAR(500),
    notizen                     TEXT,
    aktiv                       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_verwaltungen_stweg ON verwaltungen(stweg_nr, aktiv);

CREATE TABLE IF NOT EXISTS verwaltungs_kontakte (
    id              SERIAL PRIMARY KEY,
    verwaltung_id   INTEGER NOT NULL REFERENCES verwaltungen(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    funktion        VARCHAR(120),
    email           VARCHAR(255),
    telefon         VARCHAR(100),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_verwaltungs_kontakte_verw ON verwaltungs_kontakte(verwaltung_id);

-- updated_at autotouch
CREATE OR REPLACE FUNCTION verwaltungen_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verwaltungen_updated_at ON verwaltungen;
CREATE TRIGGER trg_verwaltungen_updated_at
    BEFORE UPDATE ON verwaltungen
    FOR EACH ROW EXECUTE FUNCTION verwaltungen_touch_updated_at();
