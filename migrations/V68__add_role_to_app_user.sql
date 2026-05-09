ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'athlete';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_app_user_role'
  ) THEN
    ALTER TABLE app_user
      ADD CONSTRAINT chk_app_user_role
      CHECK (role IN ('athlete', 'coach', 'admin'));
  END IF;
END $$;
