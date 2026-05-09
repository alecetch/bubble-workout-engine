ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS referral_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS referred_by_code TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_referral_code
  ON app_user (referral_code)
  WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS referral_conversion (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id  UUID        REFERENCES app_user(id) ON DELETE SET NULL,
  referred_user_id  UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  referred_code     TEXT        NOT NULL,
  converted_at      TIMESTAMPTZ NULL,
  reward_granted_at TIMESTAMPTZ NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_conversion_referrer
  ON referral_conversion (referrer_user_id);
