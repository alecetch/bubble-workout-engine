-- Add hypertrophy_main to preferred_in_json for selected exercises
-- without removing or replacing any existing preference tags.

WITH target_ids AS (
  SELECT unnest(ARRAY[
    'bb_back_squat',
    'bb_front_squat',
    'bb_tempo_back_squat',
    'tempo_back_squat',
    'hack_squat_machine',
    'leg_press',
    'trap_bar_deadlift'
  ]) AS exercise_id
)
UPDATE exercise_catalogue ec
SET preferred_in_json = ec.preferred_in_json || '["hypertrophy_main"]'::jsonb
FROM target_ids t
WHERE ec.exercise_id = t.exercise_id
  AND NOT (ec.preferred_in_json @> '["hypertrophy_main"]'::jsonb);
