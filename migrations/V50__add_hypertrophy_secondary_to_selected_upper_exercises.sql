-- Add hypertrophy_secondary to preferred_in_json for selected exercises
-- without removing or replacing any existing preference tags.

WITH target_ids AS (
  SELECT unnest(ARRAY[
    'db_flat_press',
    'db_floor_press',
    'inverted_row',
    'feetelevated_inverted_row',
    'towel_row',
    'weighted_pushup',
    'feetelevated_pushup',
    'ring_pushup',
    'closegrip_pushups',
    'pushup',
    'kb_shoulder_press',
    'singlearm_db_row',
    'bb_push_press',
    'pec_deck_fly',
    'cable_fly'
  ]) AS exercise_id
)
UPDATE exercise_catalogue ec
SET preferred_in_json = ec.preferred_in_json || '["hypertrophy_secondary"]'::jsonb
FROM target_ids t
WHERE ec.exercise_id = t.exercise_id
  AND NOT (ec.preferred_in_json @> '["hypertrophy_secondary"]'::jsonb);
