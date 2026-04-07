ALTER TABLE client_profile
  ADD COLUMN IF NOT EXISTS anchor_lifts_skipped boolean NOT NULL DEFAULT false;

ALTER TABLE client_profile
  ADD COLUMN IF NOT EXISTS anchor_lifts_collected_at timestamptz NULL;
