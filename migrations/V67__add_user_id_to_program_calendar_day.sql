ALTER TABLE program_calendar_day
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_user(id) ON DELETE CASCADE;

UPDATE program_calendar_day pcd
SET user_id = p.user_id
FROM program p
WHERE pcd.program_id = p.id
  AND pcd.user_id IS NULL;

ALTER TABLE program_calendar_day
  ALTER COLUMN user_id SET NOT NULL;

WITH ranked_training_days AS (
  SELECT
    pcd.id,
    ROW_NUMBER() OVER (
      PARTITION BY pcd.user_id, pcd.scheduled_date
      ORDER BY p.created_at DESC, pcd.id DESC
    ) AS duplicate_rank
  FROM program_calendar_day pcd
  JOIN program p
    ON p.id = pcd.program_id
  WHERE pcd.is_training_day = TRUE
)
DELETE FROM program_calendar_day pcd
USING ranked_training_days d
WHERE pcd.id = d.id
  AND d.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_user_training_date
  ON program_calendar_day (user_id, scheduled_date)
  WHERE is_training_day = TRUE;
