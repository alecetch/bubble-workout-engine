-- Smoke checks for repeatable seed migrations:
-- - R__seed_equipment_items.sql
-- - R__seed_exercise_catalogue.sql
-- - R__seed_narration_template.sql
-- - R__seed_program_generation_config.sql
-- - R__seed_media_assets.sql
-- - R__seed_program_rep_rules.sql
--
-- Usage (local):
-- docker compose exec db psql -U app -d app -f "api/scripts/sql/smoke_seed_checks.sql"
--
-- Usage (direct psql):
-- psql "$DATABASE_URL" -f "api/scripts/sql/smoke_seed_checks.sql"

WITH checks AS (
  SELECT
    'equipment_seed_rows_present'::text AS check_name,
    (SELECT COUNT(*) FROM public.equipment_items WHERE bubble_id LIKE 'seed_eq_%')::int AS actual,
    9::int AS expected_min
  UNION ALL
  SELECT
    'exercise_seed_rows_present',
    (SELECT COUNT(*) FROM public.exercise_catalogue
      WHERE exercise_id IN (
        'bb_back_squat','bb_deadlift','bb_bench_press','bb_overhead_press',
        'pullup','bb_bentover_row','row_erg','ski_erg','assault_bike','burpee'
      ))::int,
    8
  UNION ALL
  SELECT
    'narration_templates_present',
    (SELECT COUNT(*) FROM public.narration_template WHERE template_id IN (
      'prog_title_1','prog_summary_1','prog_progression_1','prog_safety_1',
      'day_title_1','day_goal_1','warmup_title_1','warmup_heat_1','warmup_ramp_1',
      'seg_title_main','seg_title_secondary','seg_title_accessory',
      'seg_exec_single','seg_exec_superset','seg_exec_giant',
      'exercise_line_1','exercise_cue_1','exercise_log_1'
    ))::int,
    18
  UNION ALL
  SELECT
    'program_generation_config_present',
    (SELECT COUNT(*) FROM public.program_generation_config WHERE config_key IN ('hypertrophy_default_v1', 'hyrox_default_v1'))::int,
    2
  UNION ALL
  SELECT
    'media_assets_seed_rows_present',
    (SELECT COUNT(*) FROM public.media_assets WHERE image_key IN (
      'program_day/mixed_full_body.png',
      'program_day/recovery_recovery.png',
      'program_day/conditioning_conditioning.png',
      'program/mixed_full_body.png',
      'program_day/skills_lower_body.png',
      'program_day/hypertrophy_upper_body.png',
      'program/hypertrophy.png',
      'program_day/hypertrophy_lower_body.png',
      'program_day/hypertrophy_full_body.png'
    ))::int,
    9
  UNION ALL
  SELECT
    'program_rep_rules_seed_rows_present',
    (SELECT COUNT(*) FROM public.program_rep_rule WHERE rule_id IN (
      'hyp_global_fallback_v1',
      'hyp_main_default_v1',
      'hyp_main_squat_v1',
      'hyp_main_hinge_v1',
      'hyp_main_push_horizontal_v1',
      'hyp_superset_main_v1',
      'hyp_secondary_default_v1',
      'hyp_secondary_pull_horizontal_v1',
      'hyp_secondary_lunge_v1',
      'hyp_push_vertical_secondary_v1',
      'hyp_pull_vertical_secondary_v1',
      'hyp_superset_secondary_v1',
      'hyp_giant_secondary_v1',
      'hyp_accessory_default_v1',
      'hyp_accessory_arms_v1',
      'hyp_accessory_calves_v1',
      'hyp_isolation_general_v1',
      'hyp_giant_accessory_v1'
    ))::int,
    18
  UNION ALL
  SELECT
    'strength_primary_region_seeded',
    (SELECT COUNT(*) FROM public.exercise_catalogue
      WHERE exercise_id IN ('bb_back_squat','bb_deadlift','bb_bench_press','bb_bentover_row','bb_overhead_press','pullup')
        AND strength_primary_region IN ('upper','lower'))::int,
    4
)
SELECT
  check_name,
  actual,
  expected_min,
  CASE WHEN actual >= expected_min THEN 'PASS' ELSE 'FAIL' END AS status
FROM checks
ORDER BY check_name;

-- Detail: active hypertrophy config row used by engine selection.
SELECT
  config_key,
  is_active,
  program_type,
  schema_version,
  total_weeks_default
FROM public.program_generation_config
WHERE config_key IN ('hypertrophy_default_v1', 'hyrox_default_v1')
ORDER BY config_key ASC;

-- Detail: sample narration templates expected by applyNarration.
SELECT
  template_id,
  scope,
  field,
  priority,
  is_active
FROM public.narration_template
WHERE template_id IN ('prog_title_1','day_goal_1','seg_exec_single','exercise_log_1')
ORDER BY template_id;

-- Detail: sample exercise rows and strength region coverage.
SELECT
  exercise_id,
  movement_pattern_primary,
  is_loadable,
  strength_primary_region
FROM public.exercise_catalogue
WHERE exercise_id IN ('bb_back_squat','bb_bench_press','bb_deadlift','assault_bike')
ORDER BY exercise_id;

-- Detail: seeded equipment preset booleans.
SELECT
  bubble_id,
  exercise_slug,
  commercial_gym,
  crossfit_hyrox_gym,
  decent_home_gym,
  minimal_equipment,
  no_equipment
FROM public.equipment_items
WHERE bubble_id LIKE 'seed_eq_%'
ORDER BY exercise_slug;

-- Detail: media assets seeded by repeatable migration.
SELECT
  usage_scope,
  day_type,
  focus_type,
  image_key,
  is_active
FROM public.media_assets
WHERE image_key IN (
  'program_day/mixed_full_body.png',
  'program_day/recovery_recovery.png',
  'program_day/conditioning_conditioning.png',
  'program/mixed_full_body.png',
  'program_day/skills_lower_body.png',
  'program_day/hypertrophy_upper_body.png',
  'program/hypertrophy.png',
  'program_day/hypertrophy_lower_body.png',
  'program_day/hypertrophy_full_body.png'
)
ORDER BY usage_scope, day_type, focus_type NULLS LAST, image_key;

-- Detail: hypertrophy rep rules seeded by repeatable migration.
SELECT
  rule_id,
  program_type,
  purpose,
  segment_type,
  movement_pattern,
  rep_low,
  rep_high,
  rest_after_set_sec,
  priority,
  is_active
FROM public.program_rep_rule
WHERE rule_id IN (
  'hyp_global_fallback_v1',
  'hyp_main_default_v1',
  'hyp_main_squat_v1',
  'hyp_main_hinge_v1',
  'hyp_main_push_horizontal_v1',
  'hyp_superset_main_v1',
  'hyp_secondary_default_v1',
  'hyp_secondary_pull_horizontal_v1',
  'hyp_secondary_lunge_v1',
  'hyp_push_vertical_secondary_v1',
  'hyp_pull_vertical_secondary_v1',
  'hyp_superset_secondary_v1',
  'hyp_giant_secondary_v1',
  'hyp_accessory_default_v1',
  'hyp_accessory_arms_v1',
  'hyp_accessory_calves_v1',
  'hyp_isolation_general_v1',
  'hyp_giant_accessory_v1'
)
ORDER BY priority DESC, rule_id;
