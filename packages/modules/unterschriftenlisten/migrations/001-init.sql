-- @sam/module-unterschriftenlisten — circular vote signature sheets
--
-- Generates collated signature lists (per STWEG) and snapshots them
-- with a stable hash so the public verification page can prove the
-- list was unaltered. Tracks per-letter return status.

CREATE TABLE IF NOT EXISTS unterschriftenliste_snapshots (
    hash             VARCHAR(64) PRIMARY KEY,
    stweg_nr         INTEGER NOT NULL,
    datum            DATE NOT NULL,
    anlass_titel     VARCHAR(500) NOT NULL,
    snapshot_data    JSONB NOT NULL,             -- the structured payload (rows, addresses, etc.)
    pdf_path         VARCHAR(500),               -- relative path under storage root, optional
    generated_by     VARCHAR(255),
    download_count   INTEGER NOT NULL DEFAULT 0,
    generated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unterschriftenliste_rueckläufe (
    id                  SERIAL PRIMARY KEY,
    snapshot_hash       VARCHAR(64) NOT NULL REFERENCES unterschriftenliste_snapshots(hash) ON DELETE CASCADE,
    brief_idx           INTEGER NOT NULL,
    brief_typ           VARCHAR(20) NOT NULL DEFAULT 'einzel',
    einheit             VARCHAR(255),
    empfaenger_name     VARCHAR(500),
    empfaenger_adresse  TEXT,
    retourniert_am      TIMESTAMPTZ,
    vote                VARCHAR(20),                 -- ja | nein | enthaltung | null
    notiz               TEXT,
    erfasst_von         VARCHAR(255),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (snapshot_hash, brief_idx)
);
CREATE INDEX IF NOT EXISTS idx_rueckl_snap ON unterschriftenliste_rueckläufe (snapshot_hash);
