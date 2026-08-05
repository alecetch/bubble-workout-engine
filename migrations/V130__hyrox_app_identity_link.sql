ALTER TABLE hyrox_submissions
  ADD COLUMN IF NOT EXISTS app_link_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_app_user_id UUID REFERENCES app_user(id);

CREATE INDEX IF NOT EXISTS idx_hyrox_submissions_linked_app_user
  ON hyrox_submissions (linked_app_user_id)
  WHERE linked_app_user_id IS NOT NULL;

ALTER TABLE hyrox_predictor_submissions
  ADD COLUMN IF NOT EXISTS app_link_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_app_user_id UUID REFERENCES app_user(id);

CREATE INDEX IF NOT EXISTS idx_hyrox_predictor_submissions_linked_app_user
  ON hyrox_predictor_submissions (linked_app_user_id)
  WHERE linked_app_user_id IS NOT NULL;
