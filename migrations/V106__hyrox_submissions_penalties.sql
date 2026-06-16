ALTER TABLE hyrox_submissions
  ADD COLUMN IF NOT EXISTS penalties_json jsonb NOT NULL DEFAULT '[]'::jsonb;
