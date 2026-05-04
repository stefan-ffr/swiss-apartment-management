-- @sam/module-smtp2go — bookkeeping
--
-- We track:
--   1) processed inbound message-ids, so the webhook + IMAP poller
--      never deliver the same mail twice (Cloudflare Email Worker
--      retries on non-2xx; Gmail IMAP can return the same uid after
--      reconnect),
--   2) the SMTP2GO suppression list cached locally, so the verteiler
--      can refuse outbound to known-bad addresses without an API
--      round-trip per send.

CREATE TABLE IF NOT EXISTS smtp2go_processed_inbound (
    message_id   VARCHAR(998) PRIMARY KEY,    -- RFC 5322 max
    recipient    VARCHAR(320),
    received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_smtp2go_processed_received
    ON smtp2go_processed_inbound(received_at DESC);

CREATE TABLE IF NOT EXISTS smtp2go_suppressions (
    address       VARCHAR(320) PRIMARY KEY,
    reason        VARCHAR(120),                 -- bounce | spam | unsubscribe | manual
    detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_synced   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_smtp2go_suppr_reason
    ON smtp2go_suppressions(reason);
