-- Add hypertrophy_main to preferred_in_json for selected upper-body exercises
-- without removing or replacing any existing preference tags.

WITH target_ids AS (
  SELECT unnest(ARRAY[
    'bb_bench_press',
    'incline_bb_bench_press',
    'db_bench_press',
    'db_incline_press',
    'machine_chest_press',
    'bb_overhead_press',
    'db_shoulder_press',
    'machine_shoulder_press',
    'lat_pulldown',
    'pullup',
    'bb_bentover_row',
    'seated_cable_row',
    'singlearm_db_row'
  ]) AS exercise_id
)
UPDATE exercise_catalogue ec
SET preferred_in_json = ec.preferred_in_json || '["hypertrophy_main"]'::jsonb
FROM target_ids t
WHERE ec.exercise_id = t.exercise_id
  AND NOT (ec.preferred_in_json @> '["hypertrophy_main"]'::jsonb);
