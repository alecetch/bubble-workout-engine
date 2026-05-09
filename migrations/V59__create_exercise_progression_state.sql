CREATE TABLE IF NOT EXISTS exercise_progression_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  program_type TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  progression_group_key TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  current_load_kg_override NUMERIC(7,2) NULL,
  current_rep_target_override INT NULL CHECK (current_rep_target_override IS NULL OR current_rep_target_override >= 1),
  current_set_override INT NULL CHECK (current_set_override IS NULL OR current_set_override >= 0),
  current_rest_sec_override INT NULL CHECK (current_rest_sec_override IS NULL OR current_rest_sec_override >= 0),
  last_outcome TEXT NULL,
  last_primary_lever TEXT NULL,
  progress_streak INT NOT NULL DEFAULT 0 CHECK (progress_streak >= 0),
  underperformance_streak INT NOT NULL DEFAULT 0 CHECK (underperformance_streak >= 0),
  confidence TEXT NULL,
  last_decided_at TIMESTAMPTZ NULL,
  last_source_exposure_id UUID NULL REFERENCES segment_exercise_log(id) ON DELETE SET NULL,
  last_decision_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, program_type, progression_group_key, purpose)
);

CREATE INDEX IF NOT EXISTS idx_exercise_progression_state_user_type
  ON exercise_progression_state (user_id, program_type, exercise_id);
