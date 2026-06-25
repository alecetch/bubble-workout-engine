ALTER TABLE cs_athletes
  ADD COLUMN IF NOT EXISTS follower_band               TEXT,
  ADD COLUMN IF NOT EXISTS primary_market              TEXT,
  ADD COLUMN IF NOT EXISTS hyrox_role                  TEXT,
  ADD COLUMN IF NOT EXISTS follower_count_source       TEXT,
  ADD COLUMN IF NOT EXISTS forma_target_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS targeting_reason            TEXT,
  ADD COLUMN IF NOT EXISTS source_url                  TEXT;

DO $$ BEGIN
  ALTER TABLE cs_athletes ADD CONSTRAINT cs_athletes_instagram_handle_unique UNIQUE (instagram_handle);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
