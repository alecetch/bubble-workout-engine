-- Historical/completed calendar rows must survive program replacement. Uniqueness
-- is already enforced per (program_id, scheduled_date); cross-program clashes
-- are checked against active programs under an app_user row lock at activation.
DROP INDEX IF EXISTS idx_calendar_user_training_date;
CREATE INDEX IF NOT EXISTS idx_calendar_user_training_date_lookup
  ON program_calendar_day (user_id, scheduled_date)
  WHERE is_training_day = TRUE;
