CREATE TABLE IF NOT EXISTS coach_progression_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  client_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  program_id UUID NULL REFERENCES program(id) ON DELETE CASCADE,
  program_exercise_id UUID NULL REFERENCES program_exercise(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL,
  progression_group_key TEXT NOT NULL,
  program_type TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  override_kind TEXT NOT NULL,
  override_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason_text TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  applies_until_program_day_id UUID NULL REFERENCES program_day(id) ON DELETE SET NULL,
  consumed_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_cpo_override_kind
    CHECK (override_kind IN ('next_session_load', 'next_session_reps', 'next_session_hold')),
  CONSTRAINT chk_cpo_status
    CHECK (status IN ('pending', 'consumed', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_cpo_client_status
  ON coach_progression_override (client_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cpo_coach_status
  ON coach_progression_override (coach_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cpo_program_exercise
  ON coach_progression_override (program_exercise_id, status);
