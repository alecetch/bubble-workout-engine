-- Add hypertrophy_secondary to preferred_in_json for selected exercises
-- without removing or replacing any existing preference tags.

WITH target_ids AS (
  SELECT unnest(ARRAY[
    'hip_thrust',
    'bb_romanian_deadlift',
    'kb_romanian_deadlift',
    'bstance_rdl',
    'db_rdl',
    'singleleg_db_romanian_deadlift',
    'singleleg_kb_romanian_deadlift',
    'singleleg_romanian_deadlift',
    'kb_deadlift',
    'db_walking_lunges',
    'kb_walking_lunges',
    'walking_lunges',
    'weighted_walking_lunge',
    'bulgarian_split_squat',
    'db_bulgarian_split_squat',
    'kb_bulgarian_split_squat',
    'hack_squat_machine',
    'leg_press',
    'goblet_squat',
    'heel_elev_goblet_squat',
    'tempo_goblet_squat',
    'double_db_front_squat',
    'landmine_squat'
  ]) AS exercise_id
)
UPDATE exercise_catalogue ec
SET preferred_in_json = ec.preferred_in_json || '["hypertrophy_secondary"]'::jsonb
FROM target_ids t
WHERE ec.exercise_id = t.exercise_id
  AND NOT (ec.preferred_in_json @> '["hypertrophy_secondary"]'::jsonb);
