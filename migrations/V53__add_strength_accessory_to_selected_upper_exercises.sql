-- Add strength_accessory to preferred_in_json for selected exercises
-- without removing or replacing any existing preference tags.

WITH target_ids AS (
  SELECT unnest(ARRAY[
    'inverted_row',
    'feetelevated_inverted_row',
    'towel_row',
    'pushup',
    'kneeling_pushup',
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
    'straightarm_pulldown',
    'pike_push_up'
  ]) AS exercise_id
)
UPDATE exercise_catalogue ec
SET preferred_in_json = ec.preferred_in_json || '["strength_accessory"]'::jsonb
FROM target_ids t
WHERE ec.exercise_id = t.exercise_id
  AND NOT (ec.preferred_in_json @> '["strength_accessory"]'::jsonb);
