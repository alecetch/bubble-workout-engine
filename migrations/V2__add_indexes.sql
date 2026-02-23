-- V2__add_indexes.sql
-- Add indexes that match real schema as of 2026-02-22.
-- Focus: segment_exercise_log scale/perf.

-- ------------------------------------------------------------
-- segment_exercise_log
-- ------------------------------------------------------------

-- Day view: load all logs for a scheduled day in stable order
create index if not exists idx_log_day_order
  on segment_exercise_log(user_id, program_day_id, order_index);

-- Segment view: drill into a segment's performed work
create index if not exists idx_log_segment_order
  on segment_exercise_log(user_id, workout_segment_id, order_index);

-- Completed-only fast path (avoid mixing drafts with completed sets)
create index if not exists idx_log_day_order_completed
  on segment_exercise_log(user_id, program_day_id, order_index)
  where is_draft = false;

-- Timeline / history queries (range scans by time)
create index if not exists idx_log_user_created_at
  on segment_exercise_log(user_id, created_at);

-- Optional: if you frequently fetch “latest performed set for an exercise”
-- (Postgres can scan backwards efficiently on btree)
create index if not exists idx_log_exercise_created_at
  on segment_exercise_log(user_id, program_exercise_id, created_at);