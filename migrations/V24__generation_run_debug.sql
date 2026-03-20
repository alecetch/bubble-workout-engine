-- Add debug/observability columns to generation_run.
-- All columns are nullable so existing rows are unaffected.

ALTER TABLE generation_run
  ADD COLUMN IF NOT EXISTS config_key        text,
  ADD COLUMN IF NOT EXISTS fitness_rank       smallint,
  ADD COLUMN IF NOT EXISTS duration_mins      smallint,
  ADD COLUMN IF NOT EXISTS step1_stats_json   jsonb,
  ADD COLUMN IF NOT EXISTS step5_debug_json   jsonb,
  ADD COLUMN IF NOT EXISTS step6_debug_json   jsonb;

CREATE INDEX IF NOT EXISTS idx_gen_run_config_key
  ON generation_run (config_key)
  WHERE config_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gen_run_completed_at
  ON generation_run (completed_at DESC)
  WHERE completed_at IS NOT NULL;
