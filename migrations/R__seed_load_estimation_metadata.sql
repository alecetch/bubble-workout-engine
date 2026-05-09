UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"squat",
  "family_conversion_factor":1.0,
  "is_anchor_eligible":true,
  "anchor_priority":1,
  "rounding_increment_kg":2.5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id = 'bb_back_squat';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"squat",
  "family_conversion_factor":0.92,
  "is_anchor_eligible":true,
  "anchor_priority":4,
  "rounding_increment_kg":2.5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id = 'bb_front_squat';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"squat",
  "family_conversion_factor":1.08,
  "is_anchor_eligible":true,
  "anchor_priority":2,
  "rounding_increment_kg":5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id = 'hack_squat_machine';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"squat",
  "family_conversion_factor":1.35,
  "is_anchor_eligible":true,
  "anchor_priority":3,
  "rounding_increment_kg":5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id = 'leg_press';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"squat",
  "family_conversion_factor":0.58,
  "is_anchor_eligible":true,
  "anchor_priority":5,
  "rounding_increment_kg":2,
  "unit":"kg_per_hand",
  "is_unilateral":false
}'::jsonb
WHERE exercise_id IN ('goblet_squat', 'double_db_front_squat', 'tempo_goblet_squat');

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"hinge",
  "family_conversion_factor":1.0,
  "is_anchor_eligible":true,
  "anchor_priority":1,
  "rounding_increment_kg":2.5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id = 'bb_deadlift';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"hinge",
  "family_conversion_factor":0.88,
  "is_anchor_eligible":true,
  "anchor_priority":2,
  "rounding_increment_kg":2.5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id IN ('bb_romanian_deadlift', 'trap_bar_deadlift');

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"hinge",
  "family_conversion_factor":0.56,
  "is_anchor_eligible":true,
  "anchor_priority":3,
  "rounding_increment_kg":2,
  "unit":"kg_per_hand"
}'::jsonb
WHERE exercise_id IN ('db_rdl', 'kb_deadlift', 'kb_romanian_deadlift');

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"horizontal_press",
  "family_conversion_factor":1.0,
  "is_anchor_eligible":true,
  "anchor_priority":1,
  "rounding_increment_kg":2.5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id = 'bb_bench_press';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"horizontal_press",
  "family_conversion_factor":0.90,
  "is_anchor_eligible":true,
  "anchor_priority":2,
  "rounding_increment_kg":2.5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id = 'incline_bb_bench_press';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"horizontal_press",
  "family_conversion_factor":0.74,
  "is_anchor_eligible":true,
  "anchor_priority":3,
  "rounding_increment_kg":2,
  "unit":"kg_per_hand"
}'::jsonb
WHERE exercise_id IN ('db_bench_press', 'db_flat_press', 'db_floor_press', 'db_incline_press', 'incline_db_bench_press');

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"horizontal_press",
  "family_conversion_factor":0.82,
  "is_anchor_eligible":true,
  "anchor_priority":4,
  "rounding_increment_kg":5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id = 'machine_chest_press';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"horizontal_press",
  "family_conversion_factor":0.42,
  "is_anchor_eligible":true,
  "anchor_priority":5,
  "rounding_increment_kg":2.5,
  "unit":"kg",
  "bodyweight_anchor":true
}'::jsonb
WHERE exercise_id IN ('pushup', 'weighted_pushup', 'ring_pushup', 'feetelevated_pushup', 'closegrip_pushups');

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"vertical_press",
  "family_conversion_factor":1.0,
  "is_anchor_eligible":true,
  "anchor_priority":1,
  "rounding_increment_kg":2.5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id IN ('bb_overhead_press', 'bb_push_press');

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"vertical_press",
  "family_conversion_factor":0.72,
  "is_anchor_eligible":true,
  "anchor_priority":2,
  "rounding_increment_kg":2,
  "unit":"kg_per_hand"
}'::jsonb
WHERE exercise_id IN ('db_shoulder_press', 'kb_shoulder_press');

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"vertical_press",
  "family_conversion_factor":0.84,
  "is_anchor_eligible":true,
  "anchor_priority":3,
  "rounding_increment_kg":5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id = 'machine_shoulder_press';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"vertical_press",
  "family_conversion_factor":0.38,
  "is_anchor_eligible":true,
  "anchor_priority":4,
  "rounding_increment_kg":2.5,
  "unit":"kg",
  "bodyweight_anchor":true
}'::jsonb
WHERE exercise_id = 'pike_push_up';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"horizontal_pull",
  "family_conversion_factor":1.0,
  "is_anchor_eligible":true,
  "anchor_priority":1,
  "rounding_increment_kg":2.5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id = 'bb_bentover_row';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"horizontal_pull",
  "family_conversion_factor":0.92,
  "is_anchor_eligible":true,
  "anchor_priority":2,
  "rounding_increment_kg":5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id IN ('seated_cable_row', 'chestsupported_row_machine');

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"horizontal_pull",
  "family_conversion_factor":0.44,
  "is_anchor_eligible":true,
  "anchor_priority":3,
  "rounding_increment_kg":2,
  "unit":"kg_per_hand",
  "is_unilateral":true,
  "unilateral_factor":0.5
}'::jsonb
WHERE exercise_id = 'singlearm_db_row';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"horizontal_pull",
  "family_conversion_factor":0.40,
  "is_anchor_eligible":true,
  "anchor_priority":4,
  "rounding_increment_kg":2.5,
  "unit":"kg",
  "bodyweight_anchor":true
}'::jsonb
WHERE exercise_id IN ('ring_row', 'inverted_row', 'feetelevated_inverted_row', 'towel_row', 'table_row');

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"vertical_pull",
  "family_conversion_factor":1.0,
  "is_anchor_eligible":true,
  "anchor_priority":1,
  "rounding_increment_kg":5,
  "unit":"kg"
}'::jsonb
WHERE exercise_id = 'lat_pulldown';

UPDATE exercise_catalogue
SET load_estimation_metadata = '{
  "estimation_family":"vertical_pull",
  "family_conversion_factor":0.72,
  "is_anchor_eligible":false,
  "anchor_priority":9,
  "not_estimatable":true,
  "unit":"bodyweight"
}'::jsonb
WHERE exercise_id IN ('pullup', 'straightarm_pulldown');
