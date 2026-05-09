-- Add strength_accessory to preferred_in_json for selected exercises
-- without removing or replacing any existing preference tags.

WITH target_ids AS (
  SELECT unnest(ARRAY[
    'bb_good_morning',
    'bb_romanian_deadlift',
    'kb_romanian_deadlift',
    'singleleg_db_romanian_deadlift',
    'singleleg_kb_romanian_deadlift',
    'singleleg_romanian_deadlift',
    'bstance_rdl',
    'db_rdl',
    'kb_deadlift',
    'hip_thrust',
    'db_walking_lunges',
    'kb_walking_lunges',
    'walking_lunges',
    'weighted_walking_lunge',
    'bulgarian_split_squat',
    'kb_bulgarian_split_squat',
    'goblet_squat',
    'heel_elev_goblet_squat',
    'tempo_goblet_squat',
    'double_db_front_squat',
    'landmine_squat',
    'hack_squat_machine',
    'leg_press'
  ]) AS exercise_id
)
UPDATE exercise_catalogue ec
SET preferred_in_json = ec.preferred_in_json || '["strength_accessory"]'::jsonb
FROM target_ids t
WHERE ec.exercise_id = t.exercise_id
  AND NOT (ec.preferred_in_json @> '["strength_accessory"]'::jsonb);
