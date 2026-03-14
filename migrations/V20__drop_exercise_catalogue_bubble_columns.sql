-- Remove Bubble.io import metadata columns from exercise_catalogue.
-- These were only ever used during the one-off CSV import and are not
-- referenced by any application code.

ALTER TABLE exercise_catalogue
  DROP COLUMN IF EXISTS bubble_creation_date,
  DROP COLUMN IF EXISTS bubble_modified_date,
  DROP COLUMN IF EXISTS bubble_unique_id;
