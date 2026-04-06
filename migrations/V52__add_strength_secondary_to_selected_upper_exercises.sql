-- Add strength_secondary to preferred_in_json for selected exercises
-- without removing or replacing any existing preference tags.

WITH target_ids AS (
  SELECT unnest(ARRAY[
    'db_bench_press',
    'db_incline_press',
    'db_flat_press',
    'db_floor_press',
    'machine_chest_press',
    'db_shoulder_press',
    'kb_shoulder_press',
    'lat_pulldown',
    'seated_cable_row',
    'singlearm_db_row',
    'weighted_pushup',
    'feetelevated_pushup',
    'ring_pushup',
    'closegrip_pushups',
    'bb_push_press'
  ]) AS exercise_id
)
UPDATE exercise_catalogue ec
SET preferred_in_json = ec.preferred_in_json || '["strength_secondary"]'::jsonb
FROM target_ids t
WHERE ec.exercise_id = t.exercise_id
  AND NOT (ec.preferred_in_json @> '["strength_secondary"]'::jsonb);
