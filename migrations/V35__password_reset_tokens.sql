-- V35__password_reset_tokens.sql
-- Short-lived OTP codes for password reset (6-digit numeric, SHA-256 hashed).

CREATE TABLE IF NOT EXISTS password_reset_token (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  code_hash  TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_token (user_id);
