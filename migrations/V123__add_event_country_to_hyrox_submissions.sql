ALTER TABLE hyrox_submissions
  ADD COLUMN IF NOT EXISTS event_country text DEFAULT NULL;
