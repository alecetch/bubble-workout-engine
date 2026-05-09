-- Remove strength_secondary from preferred_in_json
-- without changing any other JSON array entries or their order.

WITH remapped AS (
  SELECT
    ec.exercise_id,
    COALESCE(
      (
        SELECT jsonb_agg(to_jsonb(elem) ORDER BY ord)
        FROM jsonb_array_elements_text(ec.preferred_in_json) WITH ORDINALITY AS t(elem, ord)
        WHERE elem <> 'strength_secondary'
      ),
      '[]'::jsonb
    ) AS new_preferred_in_json
  FROM exercise_catalogue ec
  WHERE ec.preferred_in_json @> '["strength_secondary"]'::jsonb
)
UPDATE exercise_catalogue ec
SET preferred_in_json = remapped.new_preferred_in_json
FROM remapped
WHERE ec.exercise_id = remapped.exercise_id;
