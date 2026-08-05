CREATE TABLE hyrox_calculator_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  environment TEXT NOT NULL DEFAULT 'production',
  session_id TEXT NOT NULL,
  submission_id UUID REFERENCES hyrox_submissions(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  status TEXT,
  cache_hit BOOLEAN,
  duration_ms INTEGER,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_hyrox_calc_events_created ON hyrox_calculator_events (created_at DESC);
CREATE INDEX idx_hyrox_calc_events_session ON hyrox_calculator_events (session_id, created_at DESC);
CREATE INDEX idx_hyrox_calc_events_submission ON hyrox_calculator_events (submission_id);
CREATE INDEX idx_hyrox_calc_events_name_created ON hyrox_calculator_events (event_name, created_at DESC);
