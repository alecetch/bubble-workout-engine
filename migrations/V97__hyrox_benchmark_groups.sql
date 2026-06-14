CREATE TABLE IF NOT EXISTS hyrox_benchmark_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_key TEXT UNIQUE NOT NULL,
  dataset_version TEXT NOT NULL,
  division TEXT,
  gender TEXT,
  age_group TEXT,
  performance_band TEXT,
  fallback_level INTEGER NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hyrox_benchmark_groups_dataset
  ON hyrox_benchmark_groups (dataset_version);
