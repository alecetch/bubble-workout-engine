-- V11: Composite index to support timeline cursor pagination.
--
-- The history timeline query orders and filters by:
--   WHERE program_id = ... AND is_completed = TRUE
--   ORDER BY scheduled_date DESC, id DESC
--
-- A composite index on (program_id, scheduled_date DESC, id DESC) lets
-- Postgres satisfy both the equality filter and the keyset cursor condition
-- ((scheduled_date, id) < (cursor_date, cursor_id)) with a single index scan,
-- avoiding a sequential scan + sort as the program_day table grows.

CREATE INDEX IF NOT EXISTS idx_program_day_program_sched_id
  ON program_day (program_id, scheduled_date DESC, id DESC);
