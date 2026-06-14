CREATE TABLE IF NOT EXISTS hyrox_validation_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clean_result_id UUID REFERENCES hyrox_clean_results(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  validation_status TEXT NOT NULL,
  quality_score INTEGER NOT NULL,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  parsed_times JSONB,
  consistency JSONB,
  benchmark_eligibility JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hyrox_validation_audits_status
  ON hyrox_validation_audits (validation_status);
