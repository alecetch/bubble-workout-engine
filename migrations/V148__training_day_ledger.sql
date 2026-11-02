CREATE TABLE IF NOT EXISTS training_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  source text NOT NULL CHECK (source IN ('program_day', 'manual', 'apple_health')),
  program_day_id uuid NULL REFERENCES program_day(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_training_session_program_day
  ON training_session(program_day_id) WHERE program_day_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_session_user_date ON training_session(user_id, local_date);
ALTER TABLE program_day ADD COLUMN IF NOT EXISTS completed_at timestamptz NULL;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS timezone text NULL;
