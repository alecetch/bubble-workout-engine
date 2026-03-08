-- Seed: baseline equipment_items reference rows used by equipment preset filtering.
-- Idempotent via ON CONFLICT (bubble_id) DO UPDATE.

WITH seed_rows AS (
  SELECT *
  FROM (
    VALUES
      ('seed_eq_bodyweight', 'Bodyweight / no gear', 'bodyweight', 'bodyweight', true,  true,  true,  true,  true),
      ('seed_eq_barbell',   'Free weights',         'barbell and plates', 'barbell', true,  true,  true,  false, false),
      ('seed_eq_bench',     'Free weights',         'bench', 'bench', true,  true,  true,  false, false),
      ('seed_eq_dumbbells', 'Free weights',         'dumbbells', 'dumbbells', true,  true,  true,  false, false),
      ('seed_eq_kettlebells','Free weights',        'kettlebells', 'kettlebells', true, true,  true,  false, false),
      ('seed_eq_pullup_bar','Racks / rigs',         'pull-up bar', 'pull_up_bar', true,  true,  true,  false, false),
      ('seed_eq_treadmill', 'Cardio machine',       'treadmill', 'treadmill', true,  false, false, false, false),
      ('seed_eq_row_erg',   'Cardio machine',       'rowing machine', 'row_erg', true,  true,  false, false, false),
      ('seed_eq_bike_erg',  'Cardio machine',       'bikeerg', 'bike_erg', true,  true,  false, false, false)
  ) AS t(
    bubble_id,
    category,
    name,
    exercise_slug,
    commercial_gym,
    crossfit_hyrox_gym,
    decent_home_gym,
    minimal_equipment,
    no_equipment
  )
)
INSERT INTO public.equipment_items (
  bubble_id,
  category,
  name,
  exercise_slug,
  commercial_gym,
  crossfit_hyrox_gym,
  decent_home_gym,
  minimal_equipment,
  no_equipment,
  created_at,
  updated_at,
  raw_json
)
SELECT
  s.bubble_id,
  s.category,
  s.name,
  s.exercise_slug,
  s.commercial_gym,
  s.crossfit_hyrox_gym,
  s.decent_home_gym,
  s.minimal_equipment,
  s.no_equipment,
  now(),
  now(),
  jsonb_build_object(
    'seed_source', 'R__seed_equipment_items',
    'bubble_id', s.bubble_id,
    'exercise_slug', s.exercise_slug
  )
FROM seed_rows s
ON CONFLICT (bubble_id)
DO UPDATE SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  exercise_slug = EXCLUDED.exercise_slug,
  commercial_gym = EXCLUDED.commercial_gym,
  crossfit_hyrox_gym = EXCLUDED.crossfit_hyrox_gym,
  decent_home_gym = EXCLUDED.decent_home_gym,
  minimal_equipment = EXCLUDED.minimal_equipment,
  no_equipment = EXCLUDED.no_equipment,
  updated_at = now(),
  raw_json = EXCLUDED.raw_json;
