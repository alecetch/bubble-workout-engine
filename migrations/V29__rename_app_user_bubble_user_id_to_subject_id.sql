-- Rename the external user identity column. All values are preserved.
-- Application code must be updated in the same release as this migration.
ALTER TABLE app_user RENAME COLUMN bubble_user_id TO subject_id;
