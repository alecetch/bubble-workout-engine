CREATE TABLE IF NOT EXISTS hyrox_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predictor_submission_id UUID NOT NULL REFERENCES hyrox_predictor_submissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prediction_version TEXT NOT NULL,
  predicted_finish_seconds INTEGER NOT NULL,
  range_low_seconds INTEGER,
  range_high_seconds INTEGER,
  confidence_score NUMERIC(5,2),
  confidence_label TEXT,
  prediction_mode TEXT,
  segments_json JSONB NOT NULL,
  target_comparison_json JSONB,
  prediction_json JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hyrox_predictions_submission
  ON hyrox_predictions (predictor_submission_id);
