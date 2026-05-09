ALTER TABLE program_exercise
  ADD COLUMN IF NOT EXISTS progression_outcome TEXT NULL,
  ADD COLUMN IF NOT EXISTS progression_primary_lever TEXT NULL,
  ADD COLUMN IF NOT EXISTS progression_confidence TEXT NULL,
  ADD COLUMN IF NOT EXISTS progression_source TEXT NULL,
  ADD COLUMN IF NOT EXISTS progression_reasoning_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recommended_load_kg NUMERIC(7,2) NULL,
  ADD COLUMN IF NOT EXISTS recommended_reps_target INT NULL CHECK (recommended_reps_target IS NULL OR recommended_reps_target >= 1),
  ADD COLUMN IF NOT EXISTS recommended_sets INT NULL CHECK (recommended_sets IS NULL OR recommended_sets >= 0),
  ADD COLUMN IF NOT EXISTS recommended_rest_seconds INT NULL CHECK (recommended_rest_seconds IS NULL OR recommended_rest_seconds >= 0);

CREATE INDEX IF NOT EXISTS idx_program_exercise_progression_outcome
  ON program_exercise (program_id, progression_outcome);
