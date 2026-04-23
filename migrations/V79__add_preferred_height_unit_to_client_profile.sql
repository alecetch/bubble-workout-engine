ALTER TABLE client_profile
  ADD COLUMN IF NOT EXISTS preferred_height_unit TEXT NOT NULL DEFAULT 'cm'
  CHECK (preferred_height_unit IN ('cm', 'ft'));
