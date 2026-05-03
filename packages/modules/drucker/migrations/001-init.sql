-- @sam/module-drucker — print-job inbox
--
-- Models the "drucker tag" workflow: residents who do not have a
-- usable email address get a virtual `<prefix>+<slug>@<domain>`
-- alias. When a sender writes to that alias, the host's mail
-- pipeline records a print_jobs row, prints the document and emails
-- the sender a pickup link. The recipient can later confirm pickup
-- via the public token URL.

CREATE TABLE IF NOT EXISTS print_jobs (
    id                  SERIAL PRIMARY KEY,
    token               VARCHAR(64) UNIQUE NOT NULL,
    printer             VARCHAR(80) NOT NULL,
    recipient_name      VARCHAR(255),
    recipient_address   VARCHAR(255),
    recipient_wohnung   VARCHAR(255),
    recipient_stweg     INTEGER,
    sender_email        VARCHAR(255),
    subject             TEXT,
    documents           INTEGER NOT NULL DEFAULT 0,
    message_id          VARCHAR(255),
    status              VARCHAR(20) NOT NULL DEFAULT 'printed',  -- printed | picked_up | cancelled
    picked_up_at        TIMESTAMPTZ,
    picked_up_by        VARCHAR(255),
    last_reminder_at    TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_print_jobs_token ON print_jobs(token);
CREATE INDEX IF NOT EXISTS idx_print_jobs_open
    ON print_jobs (created_at DESC)
    WHERE picked_up_at IS NULL AND status = 'printed';
