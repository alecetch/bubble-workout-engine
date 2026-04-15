ALTER TABLE program
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE program p
SET is_primary = TRUE
FROM (
  SELECT DISTINCT ON (user_id) id
  FROM program
  WHERE status = 'active'
    AND is_ready = TRUE
  ORDER BY user_id, created_at DESC
) ranked
WHERE p.id = ranked.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_program_one_primary_active_per_user
  ON program (user_id)
  WHERE status = 'active' AND is_primary = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_program_one_active_per_type_per_user
  ON program (user_id, program_type)
  WHERE status = 'active';
