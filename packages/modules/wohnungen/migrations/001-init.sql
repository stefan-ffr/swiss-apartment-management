-- @sam/module-wohnungen — core schema
--
-- Apartments and their occupants (owners, tenants, managers).
-- The history of occupants is preserved via gueltig_ab/archiviert_am
-- — entries are never hard-deleted from `wohnungen_kontakte`, they
-- are archived so historical context is recoverable.

CREATE TABLE IF NOT EXISTS wohnungen (
    id                       SERIAL PRIMARY KEY,
    stweg_nr                 INTEGER NOT NULL,
    bezeichnung              VARCHAR(100) NOT NULL,
    stockwerk                VARCHAR(50),
    zimmer                   NUMERIC(3,1),
    flaeche_m2               NUMERIC(6,2),
    typ                      VARCHAR(50) NOT NULL DEFAULT 'Wohnung',
    besonderheiten           TEXT,
    bewohnt_von              VARCHAR(50) NOT NULL DEFAULT 'eigentuemer',
    waschkueche_berechtigt   BOOLEAN NOT NULL DEFAULT TRUE,
    notizen                  TEXT,
    wertquote_zaehler        INTEGER,
    wertquote_nenner         INTEGER,
    created_at               TIMESTAMPTZ DEFAULT NOW(),
    updated_at               TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (stweg_nr, bezeichnung)
);
CREATE INDEX IF NOT EXISTS idx_wohnungen_stweg ON wohnungen(stweg_nr);

CREATE TABLE IF NOT EXISTS wohnungen_kontakte (
    id               SERIAL PRIMARY KEY,
    wohnung_id       INTEGER NOT NULL REFERENCES wohnungen(id) ON DELETE CASCADE,
    rolle            VARCHAR(50) NOT NULL DEFAULT 'eigentuemer',
    name             VARCHAR(255),
    email            VARCHAR(255),
    telefon          VARCHAR(100),
    adresse          TEXT,
    sort_order       INTEGER DEFAULT 0,
    authentik_zugang BOOLEAN,
    gueltig_ab       DATE,
    archiviert_am    DATE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wohnungen_kontakte_wohnung ON wohnungen_kontakte(wohnung_id);
CREATE INDEX IF NOT EXISTS idx_wohnungen_kontakte_active  ON wohnungen_kontakte(wohnung_id) WHERE archiviert_am IS NULL;

-- updated_at autotouch
CREATE OR REPLACE FUNCTION wohnungen_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wohnungen_updated_at ON wohnungen;
CREATE TRIGGER trg_wohnungen_updated_at
    BEFORE UPDATE ON wohnungen
    FOR EACH ROW EXECUTE FUNCTION wohnungen_touch_updated_at();
