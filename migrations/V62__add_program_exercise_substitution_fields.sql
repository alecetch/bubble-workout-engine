ALTER TABLE program_exercise
  ADD COLUMN IF NOT EXISTS original_exercise_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS substitution_reason TEXT NULL;
