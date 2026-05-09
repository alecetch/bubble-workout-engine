-- Add hypertrophy_accessory to preferred_in_json for selected exercises
-- without removing or replacing any existing preference tags.

WITH target_ids AS (
  SELECT unnest(ARRAY[
    'bb_curl',
    'cable_curl',
    'db_incline_curl',
    'pushdown',
    'overhead_cable_extension',
    'skullcrusher',
    'face_pull',
    'rear_delt_fly_machine_or_db',
    'cable_lateral_raise',
    'db_lateral_raise',
    'pec_deck_fly',
    'cable_fly',
    'straightarm_pulldown',
    'kneeling_pushup',
    'pike_push_up'
  ]) AS exercise_id
)
UPDATE exercise_catalogue ec
SET preferred_in_json = ec.preferred_in_json || '["hypertrophy_accessory"]'::jsonb
FROM target_ids t
WHERE ec.exercise_id = t.exercise_id
  AND NOT (ec.preferred_in_json @> '["hypertrophy_accessory"]'::jsonb);
