ALTER TABLE hyrox_submissions
  ADD COLUMN IF NOT EXISTS calculator_mode TEXT,
  ADD COLUMN IF NOT EXISTS client_session_id TEXT,
  ADD COLUMN IF NOT EXISTS analysis_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS request_id TEXT;
