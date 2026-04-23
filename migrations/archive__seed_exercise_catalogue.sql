-- Seed: baseline exercise_catalogue rows used by generator/routing and strength metrics.
-- Idempotent via ON CONFLICT (exercise_id) DO UPDATE.

WITH seed_rows AS (
  SELECT *
  FROM (
    VALUES
      (
        'barbell_back_squat', 'Barbell Back Squat', 'compound', 'squat',
        2, false, true, 'quad_compound', 'squat_compound', ARRAY['barbell']::text[],
        ARRAY['quads','glutes']::text[], ARRAY['general_heat','ankles','hips','squat_pattern']::text[],
        'lower'
      ),
      (
        'barbell_deadlift', 'Barbell Deadlift', 'compound', 'hinge',
        2, false, true, 'hinge_barbell', 'hinge_compound', ARRAY['barbell']::text[],
        ARRAY['hamstrings','glutes']::text[], ARRAY['general_heat','hips','hamstrings','hinge_pattern']::text[],
        'lower'
      ),
      (
        'bench_press', 'Barbell Bench Press', 'compound', 'push_horizontal',
        2, false, true, 'push_horizontal_barbell', 'push_horizontal_compound', ARRAY['barbell','bench']::text[],
        ARRAY['chest','triceps','shoulders']::text[], ARRAY['general_heat','t_spine','shoulders','scap_push']::text[],
        'upper'
      ),
      (
        'barbell_row', 'Barbell Bent-Over Row', 'compound', 'pull_horizontal',
        2, false, true, 'pull_horizontal', 'pull_horizontal_compound', ARRAY['barbell']::text[],
        ARRAY['upper_back','biceps']::text[], ARRAY['general_heat','t_spine','scap_pull']::text[],
        'upper'
      ),
      (
        'ohp', 'Barbell Overhead Press', 'compound', 'push_vertical',
        2, false, true, 'push_vertical', NULL, ARRAY['barbell']::text[],
        ARRAY['shoulders','triceps']::text[], ARRAY['general_heat','t_spine','shoulders','scap_up']::text[],
        'upper'
      ),
      (
        'pull_up', 'Pull-Up', 'compound', 'pull_vertical',
        2, false, true, 'pull_vertical', NULL, ARRAY['pull_up_bar']::text[],
        ARRAY['upper_back','biceps']::text[], ARRAY['general_heat','shoulders','lat_engage']::text[],
        'upper'
      ),
      (
        'bulgarian_split_squat', 'Bulgarian Split Squat', 'isolation', 'lunge',
        2, false, true, 'quad_iso_unilateral', NULL, ARRAY['dumbbells','bench']::text[],
        ARRAY['quads','glutes']::text[], ARRAY['general_heat','hips','ankles','lunge_pattern']::text[],
        'lower'
      ),
      (
        'bb_curl', 'Barbell Curl', 'isolation', 'arms',
        1, false, true, 'arms', NULL, ARRAY['barbell']::text[],
        ARRAY['arms']::text[], ARRAY['general_heat','elbows_wrists','pump']::text[],
        'upper'
      ),
      (
        'barbell_standing_calf_raise', 'Barbell Standing Calf Raise', 'isolation', 'calf',
        2, false, true, 'calf_iso', NULL, ARRAY['barbell']::text[],
        ARRAY['calves']::text[], ARRAY['general_heat','ankles','calf_pump']::text[],
        'lower'
      ),
      (
        'assault_bike', 'Assault Bike', 'engine', 'cyclical_engine',
        1, false, false, 'engine', NULL, ARRAY['assault_bike']::text[],
        ARRAY['cardio']::text[], ARRAY['general_heat']::text[],
        NULL
      )
  ) AS t(
    exercise_id,
    name,
    movement_class,
    movement_pattern_primary,
    min_fitness_rank,
    is_archived,
    is_loadable,
    swap_group_id_1,
    swap_group_id_2,
    equipment_items_slugs,
    target_regions_arr,
    warmup_hooks_arr,
    strength_primary_region
  )
)
INSERT INTO public.exercise_catalogue (
  exercise_id,
  name,
  movement_class,
  movement_pattern_primary,
  min_fitness_rank,
  is_archived,
  is_loadable,
  complexity_rank,
  contraindications_json,
  contraindications_slugs,
  density_rating,
  engine_anchor,
  engine_role,
  equipment_items_slugs,
  equipment_json,
  form_cues,
  impact_level,
  lift_class,
  preferred_in_json,
  swap_group_id_1,
  swap_group_id_2,
  target_regions_json,
  warmup_hooks,
  slug,
  bubble_unique_id,
  strength_primary_region,
  updated_at
)
SELECT
  s.exercise_id,
  s.name,
  s.movement_class,
  s.movement_pattern_primary,
  s.min_fitness_rank,
  s.is_archived,
  s.is_loadable,
  2,
  '[]'::jsonb,
  '{}'::text[],
  1,
  (s.movement_class = 'engine'),
  CASE WHEN s.movement_class = 'engine' THEN 'sustainable' ELSE NULL END,
  s.equipment_items_slugs,
  to_jsonb(s.equipment_items_slugs),
  NULL,
  1,
  NULL,
  '[]'::jsonb,
  s.swap_group_id_1,
  s.swap_group_id_2,
  to_jsonb(s.target_regions_arr),
  to_jsonb(s.warmup_hooks_arr),
  s.exercise_id,
  'seed_ex_' || s.exercise_id,
  s.strength_primary_region,
  now()
FROM seed_rows s
ON CONFLICT (exercise_id)
DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  strength_primary_region = EXCLUDED.strength_primary_region,
  updated_at = now();
