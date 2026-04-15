ALTER TABLE program_calendar_day
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id) ON DELETE CASCADE;

UPDATE program_calendar_day pcd
SET user_id = p.user_id
FROM program p
WHERE pcd.program_id = p.id
  AND pcd.user_id IS NULL;

ALTER TABLE program_calendar_day
  ALTER COLUMN user_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_user_training_date
  ON program_calendar_day (user_id, scheduled_date)
  WHERE is_training_day = TRUE;
