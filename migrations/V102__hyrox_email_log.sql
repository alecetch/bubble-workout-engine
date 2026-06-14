CREATE TABLE IF NOT EXISTS hyrox_email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES hyrox_submissions(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'queued',
  resend_message_id TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_hyrox_email_log_submission
  ON hyrox_email_log (submission_id);
