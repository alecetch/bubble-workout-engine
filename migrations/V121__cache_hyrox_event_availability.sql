ALTER TABLE hyrox_events
  ADD COLUMN IF NOT EXISTS doubles_availability_json jsonb,
  ADD COLUMN IF NOT EXISTS doubles_availability_checked_at timestamptz;

