ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS revenuecat_customer_id TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_app_user_subscription_status'
  ) THEN
    ALTER TABLE app_user
      ADD CONSTRAINT chk_app_user_subscription_status
        CHECK (subscription_status IN ('trialing', 'active', 'expired', 'cancelled'));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_revenuecat_customer_id
  ON app_user (revenuecat_customer_id)
  WHERE revenuecat_customer_id IS NOT NULL;
