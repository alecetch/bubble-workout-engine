-- Rename preferred_in_json tag values from hypertrophy_secondary to strength_secondary
-- without changing any other JSON array entries or their order.

WITH remapped AS (
  SELECT
    ec.exercise_id,
    (
      SELECT jsonb_agg(
               to_jsonb(
                 CASE
                   WHEN elem = 'hypertrophy_secondary' THEN 'strength_secondary'
                   ELSE elem
                 END
               )
               ORDER BY ord
             )
      FROM jsonb_array_elements_text(ec.preferred_in_json) WITH ORDINALITY AS t(elem, ord)
    ) AS new_preferred_in_json
  FROM exercise_catalogue ec
  WHERE ec.preferred_in_json @> '["hypertrophy_secondary"]'::jsonb
)
UPDATE exercise_catalogue ec
SET preferred_in_json = remapped.new_preferred_in_json
FROM remapped
WHERE ec.exercise_id = remapped.exercise_id;
