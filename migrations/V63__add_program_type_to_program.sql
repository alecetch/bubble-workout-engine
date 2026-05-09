ALTER TABLE program
  ADD COLUMN IF NOT EXISTS program_type TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_program_program_type
  ON program (user_id, program_type);
