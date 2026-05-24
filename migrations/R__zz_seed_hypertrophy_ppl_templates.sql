-- Overlay Feature 79 split templates after the admin-generated PGC seed.
-- Keep this repeatable after R__seed_program_generation_config.sql alphabetically.
WITH ppl_templates AS (
  SELECT jsonb_build_array(
    jsonb_build_object(
      'focus', 'push',
      'day_key', 'push_day',
      'ordered_slots', jsonb_build_array(
        jsonb_build_object('slot', 'A:push_horizontal', 'mp', 'push_horizontal', 'sw2', 'push_horizontal_compound', 'requirePref', 'hypertrophy_main', 'preferLoadable', true),
        jsonb_build_object('slot', 'B:push_vertical', 'mp', 'push_vertical', 'sw2', 'push_vertical_compound', 'requirePref', 'hypertrophy_secondary', 'preferLoadable', true),
        jsonb_build_object('slot', 'C:chest_accessory', 'sw', 'push_horizontal_db', 'sw2', 'push_horizontal_compound', 'requirePref', 'hypertrophy_accessory', 'fill_fallback_slot', 'A:push_horizontal'),
        jsonb_build_object('slot', 'C:lateral_raise', 'sw', 'shoulder_iso', 'sw2', 'shoulder_accessory', 'requirePref', 'hypertrophy_accessory', 'fill_fallback_slot', 'B:push_vertical'),
        jsonb_build_object('slot', 'D:triceps', 'mp', 'push_vertical', 'sw', 'arms', 'requirePref', 'hypertrophy_accessory', 'fill_fallback_slot', 'A:push_horizontal')
      ),
      'inherit_sets_budget_from_day_1', true,
      'inherit_segmentation_from_day_1', true
    ),
    jsonb_build_object(
      'focus', 'pull',
      'day_key', 'pull_day',
      'ordered_slots', jsonb_build_array(
        jsonb_build_object('slot', 'A:pull_horizontal', 'mp', 'pull_horizontal', 'sw2', 'pull_horizontal_compound', 'requirePref', 'hypertrophy_main', 'preferLoadable', true),
        jsonb_build_object('slot', 'B:pull_vertical', 'mp', 'pull_vertical', 'sw2', 'pull_vertical_compound', 'requirePref', 'hypertrophy_secondary', 'preferLoadable', true),
        jsonb_build_object('slot', 'C:rear_delt', 'sw', 'shoulder_iso', 'sw2', 'rear_delt_accessory', 'requirePref', 'hypertrophy_accessory', 'fill_fallback_slot', 'A:pull_horizontal'),
        jsonb_build_object('slot', 'C:bicep_curl', 'mp', 'pull_horizontal', 'sw', 'arms', 'requirePref', 'hypertrophy_accessory', 'fill_fallback_slot', 'A:pull_horizontal'),
        jsonb_build_object('slot', 'D:biceps', 'mp', 'pull_horizontal', 'sw', 'arms', 'requirePref', 'hypertrophy_accessory', 'fill_fallback_slot', 'B:pull_vertical')
      ),
      'inherit_sets_budget_from_day_1', true,
      'inherit_segmentation_from_day_1', true
    ),
    jsonb_build_object(
      'focus', 'legs',
      'day_key', 'legs_day',
      'ordered_slots', jsonb_build_array(
        jsonb_build_object('slot', 'A:squat', 'mp', 'squat', 'sw2', 'squat_compound', 'requirePref', 'hypertrophy_main', 'preferLoadable', true),
        jsonb_build_object('slot', 'B:hinge', 'mp', 'hinge', 'sw2', 'hinge_compound', 'requirePref', 'hypertrophy_secondary', 'preferLoadable', true),
        jsonb_build_object('slot', 'C:hamstring_iso', 'sw', 'hamstring_iso', 'requirePref', 'hypertrophy_accessory', 'fill_fallback_slot', 'B:hinge'),
        jsonb_build_object('slot', 'C:quad_iso', 'mp', 'squat', 'swAny', jsonb_build_array('quad_iso_unilateral', 'quad_iso_squat'), 'requirePref', 'hypertrophy_accessory', 'fill_fallback_slot', 'A:squat'),
        jsonb_build_object('slot', 'D:calves', 'sw', 'calf_iso', 'requirePref', 'hypertrophy_accessory', 'preferLoadable', true, 'fill_fallback_slot', 'A:squat')
      ),
      'inherit_sets_budget_from_day_1', true,
      'inherit_segmentation_from_day_1', true
    )
  ) AS templates
)
UPDATE public.program_generation_config pgc
SET program_generation_config_json = jsonb_set(
  jsonb_set(
    pgc.program_generation_config_json,
    '{builder,day_templates}',
    (
      SELECT jsonb_agg(template)
      FROM (
        SELECT template
        FROM jsonb_array_elements(pgc.program_generation_config_json #> '{builder,day_templates}') AS existing(template)
        WHERE template->>'day_key' NOT IN ('push_day', 'pull_day', 'legs_day')
        UNION ALL
        SELECT template
        FROM ppl_templates, jsonb_array_elements(ppl_templates.templates) AS added(template)
      ) merged
    ),
    true
  ),
  '{builder,day_templates_by_dpw}',
  COALESCE(pgc.program_generation_config_json #> '{builder,day_templates_by_dpw}', '{}'::jsonb) || jsonb_build_object(
    '5', jsonb_build_array('push_day', 'pull_day', 'legs_day', 'day2', 'day1'),
    '6', jsonb_build_array('push_day', 'pull_day', 'legs_day', 'push_day', 'pull_day', 'legs_day'),
    '7', jsonb_build_array('push_day', 'pull_day', 'legs_day', 'push_day', 'pull_day', 'legs_day', 'day4')
  ),
  true
)
FROM ppl_templates
WHERE pgc.config_key = 'hypertrophy_default_v1';
