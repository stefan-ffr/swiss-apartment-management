-- Add `purpose` to managed mailboxes so the bridges can identify
-- system-owned accounts (e.g. printer-ingest, verteiler-log) and
-- never touch user mailboxes by accident.
ALTER TABLE mailcow_managed_mailboxes
    ADD COLUMN IF NOT EXISTS purpose VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_mailcow_mb_purpose
    ON mailcow_managed_mailboxes(purpose) WHERE purpose IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mailcow_al_purpose
    ON mailcow_managed_aliases(purpose) WHERE purpose IS NOT NULL;
