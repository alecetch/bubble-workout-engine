-- User's preferred training split persisted from the Split Review screen
ALTER TABLE client_profile
  ADD COLUMN IF NOT EXISTS preferred_split_json JSONB NULL;

-- Focus type persisted per generated program day (enables Recalibrate bulk update)
ALTER TABLE program_day
  ADD COLUMN IF NOT EXISTS focus_type TEXT NULL;

-- Index: Recalibrate endpoint updates unstarted days by program
CREATE INDEX IF NOT EXISTS idx_program_day_focus_type
  ON program_day (program_id, focus_type)
  WHERE is_completed = FALSE;
