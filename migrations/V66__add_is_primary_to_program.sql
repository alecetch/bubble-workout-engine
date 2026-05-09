ALTER TABLE program
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

WITH ranked_duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, program_type
      ORDER BY created_at DESC, id DESC
    ) AS duplicate_rank
  FROM program
  WHERE status = 'active'
    AND program_type IS NOT NULL
)
UPDATE program p
SET status = 'archived',
    updated_at = now()
FROM ranked_duplicates d
WHERE p.id = d.id
  AND d.duplicate_rank > 1;

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
