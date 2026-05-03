-- @sam/module-energie — meter readings + tariffs
--
-- Captures readings from arbitrary external collectors (ioBroker,
-- Modbus poller, Shelly, etc.). The collector posts JSON to the
-- ingest endpoint with a meter id and a value; this module is
-- agnostic about how the value was acquired.

CREATE TABLE IF NOT EXISTS energy_meters (
    id              VARCHAR(120) PRIMARY KEY,           -- stable external id
    label           VARCHAR(255) NOT NULL,
    unit            VARCHAR(20)  NOT NULL DEFAULT 'kWh',
    stweg_nr        INTEGER,
    wohnung_id      INTEGER,
    type            VARCHAR(40)  NOT NULL DEFAULT 'electric',  -- electric | water | gas | heat
    tariff_id       VARCHAR(120),
    cumulative      BOOLEAN NOT NULL DEFAULT TRUE,        -- true: meter reads odometer-style
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS energy_readings (
    id              BIGSERIAL PRIMARY KEY,
    meter_id        VARCHAR(120) NOT NULL REFERENCES energy_meters(id) ON DELETE CASCADE,
    value           NUMERIC(14,4) NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source          VARCHAR(80)
);
CREATE INDEX IF NOT EXISTS idx_energy_readings_meter_time
    ON energy_readings(meter_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS energy_tariffs (
    id              VARCHAR(120) PRIMARY KEY,
    label           VARCHAR(255) NOT NULL,
    unit            VARCHAR(20)  NOT NULL DEFAULT 'kWh',
    chf_per_unit    NUMERIC(10,4) NOT NULL,
    valid_from      DATE NOT NULL,
    valid_until     DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_energy_tariffs_validity ON energy_tariffs(valid_from, valid_until);
