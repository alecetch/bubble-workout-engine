-- Add hypertrophy_accessory to preferred_in_json for selected exercises
-- without removing or replacing any existing preference tags.

WITH target_ids AS (
  SELECT unnest(ARRAY[
    'bb_standing_calf_raise',
    'seated_calf_raise',
    'seated_db_calf_raise',
    'single_leg_standing_calf_raise',
    'standing_calf_raise',
    'cable_glute_kickback',
    'single_leg_glute_bridge',
    'hamstring_walkouts',
    'lying_leg_curl',
    'nordic_hamstring_curl',
    'seated_leg_curl',
    'singleleg_bodyweight_rdl',
    'bodyweight_reverse_lunge',
    'leg_extension',
    'cyclist_squat_heels_elevated',
    'shrimp_squat_assisted',
    'assisted_pistol_squat',
    'pistol_squat',
    'shrimp_squat'
  ]) AS exercise_id
)
UPDATE exercise_catalogue ec
SET preferred_in_json = ec.preferred_in_json || '["hypertrophy_accessory"]'::jsonb
FROM target_ids t
WHERE ec.exercise_id = t.exercise_id
  AND NOT (ec.preferred_in_json @> '["hypertrophy_accessory"]'::jsonb);
