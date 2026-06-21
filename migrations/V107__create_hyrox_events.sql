CREATE TABLE hyrox_events (
    id                SERIAL PRIMARY KEY,
    season            INTEGER         NOT NULL,
    event_name        TEXT            NOT NULL,
    city              TEXT            NOT NULL,
    country           TEXT,
    region            TEXT,
    start_date        DATE,
    end_date          DATE,
    is_championship   BOOLEAN         NOT NULL DEFAULT FALSE,
    championship_type TEXT,
    results_page_key  TEXT,
    is_youngstars     BOOLEAN         NOT NULL DEFAULT FALSE,
    is_invitational   BOOLEAN         NOT NULL DEFAULT FALSE,
    has_results       BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (results_page_key)
);

CREATE INDEX idx_hyrox_events_results_page_key ON hyrox_events (results_page_key)
    WHERE results_page_key IS NOT NULL;

CREATE INDEX idx_hyrox_events_season ON hyrox_events (season);
