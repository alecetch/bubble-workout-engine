ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS physique_consent_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS physique_check_in (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  photo_s3_key TEXT NOT NULL,
  analysis_json JSONB NULL,
  program_emphasis_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physique_check_in_user_submitted
  ON physique_check_in (user_id, submitted_at DESC);
