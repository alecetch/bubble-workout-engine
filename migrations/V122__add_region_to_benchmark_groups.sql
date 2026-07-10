ALTER TABLE hyrox_benchmark_groups
  ADD COLUMN IF NOT EXISTS region text DEFAULT NULL;
