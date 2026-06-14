CREATE TABLE IF NOT EXISTS hyrox_clean_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_result_id UUID REFERENCES hyrox_raw_results(id) ON DELETE CASCADE,
  dataset_version TEXT NOT NULL,
  event_id TEXT,
  event_name TEXT,
  gender TEXT NOT NULL,
  nationality TEXT,
  age_group TEXT,
  division TEXT NOT NULL,
  total_time_seconds INTEGER NOT NULL,
  run_time_seconds INTEGER,
  work_time_seconds INTEGER,
  roxzone_time_seconds INTEGER,
  segments_json JSONB NOT NULL,
  validation_status TEXT NOT NULL,
  quality_score INTEGER NOT NULL,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  benchmark_eligibility JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hyrox_clean_results_dataset_status
  ON hyrox_clean_results (dataset_version, validation_status);

CREATE INDEX IF NOT EXISTS idx_hyrox_clean_results_group_dims
  ON hyrox_clean_results (dataset_version, division, gender, age_group);
