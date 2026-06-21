CREATE TABLE cs_race_events (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  event_name          TEXT         NOT NULL,
  event_date          DATE,
  season              INTEGER,
  division            TEXT         NOT NULL DEFAULT 'open',
  sex                 TEXT         NOT NULL DEFAULT 'male',
  uploaded_by         TEXT,
  athlete_count       INTEGER,
  source              TEXT         NOT NULL DEFAULT 'csv',
  raw_data_json       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  analysis_json       JSONB,
  status              TEXT         NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'analysed', 'archived'))
);

CREATE INDEX idx_cs_race_events_status    ON cs_race_events (status);
CREATE INDEX idx_cs_race_events_created   ON cs_race_events (created_at DESC);

CREATE TABLE cs_athletes (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  full_name                TEXT         NOT NULL,
  instagram_handle         TEXT,
  instagram_follower_count INTEGER,
  sex                      TEXT,
  division                 TEXT,
  notes                    TEXT,
  last_featured_at         TIMESTAMPTZ,
  content_history_json     JSONB        NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_cs_athletes_instagram ON cs_athletes (instagram_handle)
  WHERE instagram_handle IS NOT NULL;

CREATE TABLE cs_content_jobs (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  race_event_id       UUID         REFERENCES cs_race_events(id) ON DELETE CASCADE,
  content_mode        TEXT         NOT NULL
                      CHECK (content_mode IN (
                        'auto_pick','athlete_spotlight','head_to_head',
                        'podium_breakdown','race_breakdown','myth_buster','what_we_learn'
                      )),
  mode_params_json    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  status              TEXT         NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','pending_review','approved','exported')),
  generated_content_json JSONB,
  generated_at        TIMESTAMPTZ,
  approved_at         TIMESTAMPTZ,
  approved_by         TEXT
);

CREATE INDEX idx_cs_content_jobs_race  ON cs_content_jobs (race_event_id);
CREATE INDEX idx_cs_content_jobs_status ON cs_content_jobs (status);

CREATE TABLE cs_content_items (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  job_id              UUID         NOT NULL REFERENCES cs_content_jobs(id) ON DELETE CASCADE,
  item_type           TEXT         NOT NULL
                      CHECK (item_type IN ('carousel','caption','insight_summary')),
  insights_json       JSONB        NOT NULL DEFAULT '[]'::jsonb,
  carousel_json       JSONB,
  caption_text        TEXT,
  hashtags            TEXT[]       NOT NULL DEFAULT '{}',
  athlete_handles     TEXT[]       NOT NULL DEFAULT '{}',
  export_status       TEXT         NOT NULL DEFAULT 'pending'
                      CHECK (export_status IN ('pending','exported'))
);

CREATE INDEX idx_cs_content_items_job ON cs_content_items (job_id);
