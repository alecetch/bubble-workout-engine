ALTER TABLE password_reset_token
  ADD COLUMN attempts INT NOT NULL DEFAULT 0;
DELETE FROM password_reset_token WHERE used_at IS NULL;   -- D5: old SHA-256 codes

ALTER TABLE app_user
  ADD COLUMN password_changed_at TIMESTAMPTZ NULL;

CREATE TABLE rate_limit_hit (
  key         TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  hits        INT         NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX idx_rate_limit_hit_expires ON rate_limit_hit (expires_at);
