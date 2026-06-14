CREATE TABLE IF NOT EXISTS hyrox_raw_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  raw_json JSONB NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hyrox_raw_results_dataset_row
  ON hyrox_raw_results (dataset_version, row_number);
