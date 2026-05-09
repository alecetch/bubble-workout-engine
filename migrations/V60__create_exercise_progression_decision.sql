CREATE TABLE IF NOT EXISTS exercise_progression_decision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  program_id UUID NULL REFERENCES program(id) ON DELETE CASCADE,
  program_day_id UUID NULL REFERENCES program_day(id) ON DELETE CASCADE,
  program_exercise_id UUID NULL REFERENCES program_exercise(id) ON DELETE CASCADE,
  source_log_id UUID NULL REFERENCES segment_exercise_log(id) ON DELETE SET NULL,
  exercise_id TEXT NOT NULL,
  progression_group_key TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  decision_outcome TEXT NOT NULL,
  primary_lever TEXT NULL,
  confidence TEXT NULL,
  recommended_load_delta_kg NUMERIC(7,2) NULL,
  recommended_rep_delta INT NULL,
  recommended_set_delta INT NULL,
  recommended_rest_delta_sec INT NULL,
  recommended_load_kg NUMERIC(7,2) NULL,
  recommended_reps_target INT NULL,
  recommended_sets INT NULL,
  recommended_rest_seconds INT NULL,
  evidence_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exercise_progression_decision_user_created
  ON exercise_progression_decision (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exercise_progression_decision_program
  ON exercise_progression_decision (program_id, program_exercise_id);
