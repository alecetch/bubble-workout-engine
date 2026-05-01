-- Skip support on program_day
ALTER TABLE program_day
  ADD COLUMN IF NOT EXISTS is_skipped BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS skipped_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ NULL;

-- Reschedule support on program_calendar_day
ALTER TABLE program_calendar_day
  ADD COLUMN IF NOT EXISTS rescheduled_from_day_id UUID NULL
    REFERENCES program_day(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ NULL;

-- Index for dashboard query
CREATE INDEX IF NOT EXISTS idx_program_day_skipped
  ON program_day (program_id, is_skipped)
  WHERE is_skipped = TRUE;
