-- @sam/module-waschkueche — laundry-room booking
--
-- Models a small set of bookable rooms and the per-resident
-- reservations + actual usage sessions. Energy and door-access
-- integrations are optional (handled by the host based on the
-- foreign-key columns `energy_meter_id` / `door_id`).

CREATE TABLE IF NOT EXISTS wasch_rooms (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    location        VARCHAR(255),
    stweg_nr        INTEGER,
    energy_meter_id VARCHAR(120),
    door_id         VARCHAR(120),
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wasch_reservations (
    id               SERIAL PRIMARY KEY,
    user_sub         VARCHAR(255) NOT NULL,         -- OIDC `sub` of the booker
    room_id          INTEGER NOT NULL REFERENCES wasch_rooms(id) ON DELETE CASCADE,
    start_time       TIMESTAMPTZ NOT NULL,
    end_time         TIMESTAMPTZ NOT NULL,
    recurring        BOOLEAN NOT NULL DEFAULT FALSE,
    recurring_until  DATE,
    cancelled        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wasch_reservations_room_time
    ON wasch_reservations(room_id, start_time, end_time)
    WHERE cancelled = FALSE;
CREATE INDEX IF NOT EXISTS idx_wasch_reservations_user
    ON wasch_reservations(user_sub, start_time DESC);

CREATE TABLE IF NOT EXISTS wasch_sessions (
    id                 SERIAL PRIMARY KEY,
    user_sub           VARCHAR(255) NOT NULL,
    room_id            INTEGER NOT NULL REFERENCES wasch_rooms(id),
    reservation_id     INTEGER REFERENCES wasch_reservations(id),
    status             VARCHAR(40) NOT NULL DEFAULT 'active',  -- active | finished | cancelled
    started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at           TIMESTAMPTZ,
    duration_minutes   INTEGER,
    energy_start_kwh   NUMERIC(10,4),
    energy_end_kwh     NUMERIC(10,4),
    energy_consumed    NUMERIC(10,4),
    cost               NUMERIC(10,2)
);
CREATE INDEX IF NOT EXISTS idx_wasch_sessions_user ON wasch_sessions(user_sub, started_at DESC);

CREATE TABLE IF NOT EXISTS wasch_billing (
    id              SERIAL PRIMARY KEY,
    user_sub        VARCHAR(255) NOT NULL,
    month           DATE NOT NULL,
    total_sessions  INTEGER NOT NULL DEFAULT 0,
    total_kwh       NUMERIC(10,4) NOT NULL DEFAULT 0,
    cost_per_kwh    NUMERIC(10,4),
    total_cost      NUMERIC(10,2) NOT NULL DEFAULT 0,
    email_sent_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_sub, month)
);

CREATE TABLE IF NOT EXISTS wasch_settings (
    key         VARCHAR(120) PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
