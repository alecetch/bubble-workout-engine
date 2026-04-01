-- Drop Bubble CSV import artifacts from client_profile.
-- These columns were populated by importClientProfilesFromCsv.js (now retired)
-- and are not referenced by any application code.
-- Stakeholder sign-off obtained before this migration was written.
ALTER TABLE client_profile
  DROP COLUMN IF EXISTS bubble_creation_date,
  DROP COLUMN IF EXISTS bubble_modified_date,
  DROP COLUMN IF EXISTS bubble_user_raw,
  DROP COLUMN IF EXISTS slug,
  DROP COLUMN IF EXISTS creator;
