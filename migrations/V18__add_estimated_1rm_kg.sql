ALTER TABLE segment_exercise_log
  ADD COLUMN IF NOT EXISTS estimated_1rm_kg NUMERIC(7,2);
