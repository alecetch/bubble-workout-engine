CREATE TABLE IF NOT EXISTS training_history_import (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  client_profile_id UUID NULL REFERENCES client_profile(id) ON DELETE SET NULL,
  source_app TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,

  CONSTRAINT chk_thi_status
    CHECK (status IN ('processing', 'completed', 'completed_with_warnings', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_thi_user_id
  ON training_history_import (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS training_history_import_row (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES training_history_import(id) ON DELETE CASCADE,
  raw_exercise_name TEXT NOT NULL,
  mapped_exercise_id TEXT NULL,
  mapped_estimation_family TEXT NULL,
  weight_kg NUMERIC NULL,
  reps INT NULL,
  performed_at DATE NULL,
  mapping_confidence TEXT NULL,
  warning_code TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_thi_row_import_id
  ON training_history_import_row (import_id);

CREATE TABLE IF NOT EXISTS exercise_import_alias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_app TEXT NOT NULL,
  source_name_normalized TEXT NOT NULL,
  exercise_id TEXT NULL REFERENCES exercise_catalogue(exercise_id) ON DELETE SET NULL,
  estimation_family TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT uq_exercise_import_alias UNIQUE (source_app, source_name_normalized)
);

CREATE INDEX IF NOT EXISTS idx_eia_lookup
  ON exercise_import_alias (source_app, source_name_normalized)
  WHERE is_active = TRUE;

INSERT INTO exercise_import_alias (source_app, source_name_normalized, exercise_id, estimation_family)
VALUES
  ('hevy', 'barbell back squat', 'bb_back_squat', 'squat'),
  ('hevy', 'barbell squat', 'bb_back_squat', 'squat'),
  ('hevy', 'squat (barbell)', 'bb_back_squat', 'squat'),
  ('hevy', 'barbell deadlift', 'bb_conventional_deadlift', 'hinge'),
  ('hevy', 'deadlift (barbell)', 'bb_conventional_deadlift', 'hinge'),
  ('hevy', 'romanian deadlift', NULL, 'hinge'),
  ('hevy', 'barbell bench press', 'bb_bench_press_flat', 'horizontal_push'),
  ('hevy', 'bench press (barbell)', 'bb_bench_press_flat', 'horizontal_push'),
  ('hevy', 'incline bench press', NULL, 'horizontal_push'),
  ('hevy', 'overhead press (barbell)', NULL, 'vertical_push'),
  ('hevy', 'barbell overhead press', NULL, 'vertical_push'),
  ('hevy', 'ohp', NULL, 'vertical_push'),
  ('hevy', 'barbell row', NULL, 'horizontal_pull'),
  ('hevy', 'bent over row (barbell)', NULL, 'horizontal_pull'),
  ('hevy', 'pull up', NULL, 'vertical_pull'),
  ('hevy', 'pull-up', NULL, 'vertical_pull'),
  ('hevy', 'lat pulldown', NULL, 'vertical_pull')
ON CONFLICT (source_app, source_name_normalized) DO NOTHING;
