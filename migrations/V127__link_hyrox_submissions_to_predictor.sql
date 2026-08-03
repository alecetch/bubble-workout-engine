ALTER TABLE hyrox_submissions
  ADD COLUMN IF NOT EXISTS linked_predictor_submission_id UUID REFERENCES hyrox_predictor_submissions(id);

CREATE INDEX IF NOT EXISTS idx_hyrox_submissions_linked_predictor
  ON hyrox_submissions (linked_predictor_submission_id)
  WHERE linked_predictor_submission_id IS NOT NULL;
