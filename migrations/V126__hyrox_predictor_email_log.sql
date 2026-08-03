CREATE TABLE IF NOT EXISTS hyrox_predictor_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predictor_submission_id UUID NOT NULL REFERENCES hyrox_predictor_submissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'queued',
  sent_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_hyrox_predictor_email_log_submission
  ON hyrox_predictor_email_log (predictor_submission_id);
