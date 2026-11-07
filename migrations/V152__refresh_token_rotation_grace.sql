-- Retain rotated tokens briefly so a lost refresh response can be retried.
ALTER TABLE auth_refresh_token
  ADD COLUMN IF NOT EXISTS rotated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS replaced_by uuid NULL;
