-- V12: Partial index on segment_exercise_log for analytics queries.
--
-- The history endpoints (personal records, exercise series, overview trends)
-- all filter on is_draft = FALSE and weight_kg IS NOT NULL before joining
-- back to program_day by program_day_id. This partial index covers that
-- exact access pattern, eliminating full-table scans on segment_exercise_log
-- as log volume grows.

CREATE INDEX IF NOT EXISTS idx_seglog_day_weight_nondraft
  ON segment_exercise_log (program_day_id, weight_kg)
  WHERE is_draft = FALSE AND weight_kg IS NOT NULL;
