-- Email/password credentials on app_user.
-- subject_id remains NOT NULL; for registered users it is set to the
-- normalized email address. existing device-identity rows are unaffected.
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS password_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_email
  ON app_user (lower(email))
  WHERE email IS NOT NULL;

-- Refresh tokens. Stored as SHA-256 hex hash; the raw token is never
-- persisted. Single-use: each refresh rotates to a new token.
CREATE TABLE IF NOT EXISTS auth_refresh_token (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash  text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_token_user
  ON auth_refresh_token (user_id);
