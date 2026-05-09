ALTER TABLE client_profile
  ADD COLUMN IF NOT EXISTS preferred_unit TEXT NOT NULL DEFAULT 'kg'
  CHECK (preferred_unit IN ('kg', 'lbs'));
