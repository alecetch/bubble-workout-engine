ALTER TABLE referral_conversion
  ADD COLUMN reward_status TEXT NOT NULL DEFAULT 'none'
    CHECK (reward_status IN ('none','pending','granted','capped','void','failed')),
  ADD COLUMN conversion_event_id TEXT NULL,      -- RevenueCat event id, for idempotency
  ADD COLUMN reward_due_at TIMESTAMPTZ NULL,
  ADD COLUMN reward_method TEXT NULL
    CHECK (reward_method IS NULL OR reward_method IN ('promotional_entitlement','apple_extension','google_deferral')),
  ADD COLUMN reward_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN reward_next_attempt_at TIMESTAMPTZ NULL,
  ADD COLUMN reward_last_error TEXT NULL,
  ADD COLUMN reward_notified_at TIMESTAMPTZ NULL;
CREATE INDEX idx_referral_conversion_due ON referral_conversion (reward_status, reward_next_attempt_at)
  WHERE reward_status = 'pending';
