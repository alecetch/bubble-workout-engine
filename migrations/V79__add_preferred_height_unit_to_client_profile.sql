ALTER TABLE client_profile
  ADD COLUMN IF NOT EXISTS preferred_height_unit TEXT NOT NULL DEFAULT 'cm';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_profile_preferred_height_unit_check'
  ) THEN
    ALTER TABLE client_profile
      ADD CONSTRAINT client_profile_preferred_height_unit_check
        CHECK (preferred_height_unit IN ('cm', 'ft'));
  END IF;
END;
$$;
