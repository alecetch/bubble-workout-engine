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

