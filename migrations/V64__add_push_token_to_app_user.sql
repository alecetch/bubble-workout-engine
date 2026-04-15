ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS device_push_token TEXT NULL,
  ADD COLUMN IF NOT EXISTS device_push_token_updated_at TIMESTAMPTZ NULL;
