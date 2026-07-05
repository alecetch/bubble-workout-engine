ALTER TABLE hyrox_submissions
  ADD COLUMN IF NOT EXISTS race_replay_json jsonb NOT NULL DEFAULT '[]'::jsonb;
