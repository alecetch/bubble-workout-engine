DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_app_user_subscription_status' AND conrelid = 'app_user'::regclass
  ) THEN
    ALTER TABLE app_user DROP CONSTRAINT chk_app_user_subscription_status;
  END IF;
  ALTER TABLE app_user ADD CONSTRAINT chk_app_user_subscription_status
    CHECK (subscription_status IN ('trialing', 'active', 'expired', 'cancelled', 'billing_issue'));
END;
$$;

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS subscription_event_at timestamptz NULL;
