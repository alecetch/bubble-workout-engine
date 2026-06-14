CREATE TABLE IF NOT EXISTS hyrox_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES hyrox_submissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  analysis_version TEXT NOT NULL,
  analysis_scope TEXT NOT NULL,
  analysis_json JSONB NOT NULL,
  benchmark_group_key TEXT,
  confidence TEXT,
  selected_insights_json JSONB,
  report_json JSONB,
  carousel_a_json JSONB,
  carousel_b_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_hyrox_analyses_submission
  ON hyrox_analyses (submission_id);
