ALTER TABLE program_day
  ADD COLUMN IF NOT EXISTS is_bonus BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_program_day_bonus
  ON program_day (program_id, is_bonus)
  WHERE is_bonus = TRUE;
