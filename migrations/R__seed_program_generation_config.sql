-- Seed: baseline active hypertrophy program_generation_config row.
-- Idempotent via ON CONFLICT (config_key) DO UPDATE.

WITH seed_rows AS (
  SELECT
    'hypertrophy_default_v1'::text AS config_key,
    true AS is_active,
    'Baseline deterministic hypertrophy progression config.'::text AS notes,
    'hypertrophy'::text AS program_type,
    1::int AS schema_version,
    4::int AS total_weeks_default,
    jsonb_build_object(
      'beginner', jsonb_build_object('weekly_set_step', 0, 'max_extra_sets', 0),
      'intermediate', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 2),
      'advanced', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 3),
      'elite', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 4)
    ) AS progression_by_rank_json,
    jsonb_build_object(
      'default_phase_sequence', jsonb_build_array('BASELINE', 'BUILD', 'BUILD', 'CONSOLIDATE'),
      'last_week_mode', 'consolidate',
      'phase_labels', jsonb_build_object(
        'BASELINE', 'Baseline',
        'BUILD', 'Build',
        'CONSOLIDATE', 'Consolidate'
      ),
      'copy', jsonb_build_object(
        'BASELINE', jsonb_build_object('focus', 'Establish quality and repeatable loads.', 'notes', 'Keep 1-2 reps in reserve on most work.'),
        'BUILD', jsonb_build_object('focus', 'Add small volume where prescribed.', 'notes', 'Progress load only if form stays crisp.'),
        'CONSOLIDATE', jsonb_build_object('focus', 'Reduce fatigue and keep movement quality high.', 'notes', 'Slightly reduce volume in final week.')
      )
    ) AS week_phase_config_json
)
INSERT INTO public.program_generation_config (
  config_key,
  is_active,
  notes,
  program_generation_config_json,
  program_type,
  progression_by_rank_json,
  schema_version,
  total_weeks_default,
  week_phase_config_json,
  updated_at
)
SELECT
  s.config_key,
  s.is_active,
  s.notes,
  jsonb_build_object(
    'config_key', s.config_key,
    'program_type', s.program_type,
    'schema_version', s.schema_version,
    'is_active', s.is_active,
    'total_weeks_default', s.total_weeks_default,
    'progression_by_rank_json', s.progression_by_rank_json,
    'week_phase_config_json', s.week_phase_config_json,
    'builder', jsonb_build_object(
      'day_templates', jsonb_build_array(
        jsonb_build_object(
          'day_key', 'day1',
          'focus', 'lower',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object(
              'slot', 'A:squat',
              'preferLoadable', true,
              'variants', jsonb_build_array(
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'full'), 'sw2', 'squat_compound', 'requirePref', 'strength_main', 'pref_mode', 'strict'),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'minimal'), 'swAny', jsonb_build_array('squat_pattern'), 'requirePref', 'strength_main', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'bodyweight'), 'swAny', jsonb_build_array('squat_pattern'), 'mp', 'squat', 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true)
              )
            ),
            jsonb_build_object('slot', 'B:lunge', 'mp', 'lunge', 'sw', 'quad_iso_unilateral'),
            jsonb_build_object('slot', 'C:quad', 'swAny', jsonb_build_array('quad_iso_unilateral', 'quad_iso_squat'), 'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'A:squat'),
            jsonb_build_object('slot', 'C:calves', 'sw', 'calf_iso', 'requirePref', 'hypertrophy_secondary', 'preferLoadable', true, 'fill_fallback_slot', 'B:lunge'),
            jsonb_build_object('slot', 'D:core', 'mp', 'anti_extension', 'sw', 'core', 'fill_fallback_slot', 'B:lunge'),
            jsonb_build_object('slot', 'C:hinge_accessory', 'sw', 'hamstring_iso', 'sw2', 'hinge_compound', 'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'A:squat')
          )
        ),
        jsonb_build_object(
          'day_key', 'day2',
          'focus', 'upper',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object(
              'slot', 'A:push_horizontal',
              'variants', jsonb_build_array(
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'full'), 'sw2', 'push_horizontal_compound', 'requirePref', 'strength_main', 'pref_mode', 'strict'),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'minimal'), 'swAny', jsonb_build_array('push_horizontal_pattern'), 'requirePref', 'strength_main', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'bodyweight'), 'swAny', jsonb_build_array('push_horizontal_pattern'), 'mp', 'push_horizontal', 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true)
              )
            ),
            jsonb_build_object(
              'slot', 'B:pull_horizontal',
              'variants', jsonb_build_array(
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'full'), 'sw2', 'pull_horizontal_compound', 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'strict'),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'minimal'), 'swAny', jsonb_build_array('pull_horizontal_pattern'), 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'bodyweight'), 'swAny', jsonb_build_array('pull_horizontal_pattern'), 'mp', 'pull_horizontal', 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true)
              )
            ),
            jsonb_build_object('slot', 'B:secondary_press', 'sw', 'push_horizontal_db', 'sw2', 'push_horizontal_compound', 'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'B:pull_horizontal'),
            jsonb_build_object('slot', 'C:arms', 'sw', 'arms', 'sw2', 'push_horizontal_compound', 'pref_mode', 'soft', 'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'B:secondary_press'),
            jsonb_build_object('slot', 'C:rear_delt', 'sw', 'shoulder_iso', 'sw2', 'push_vertical_compound', 'mp', 'push_vertical', 'pref_mode', 'soft', 'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'B:pull_horizontal'),
            jsonb_build_object('slot', 'C:arms2', 'sw', 'arms', 'sw2', 'push_horizontal_compound', 'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'C:arms')
          )
        ),
        jsonb_build_object(
          'day_key', 'day3',
          'focus', 'posterior',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object(
              'slot', 'A:hinge',
              'preferLoadable', true,
              'variants', jsonb_build_array(
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'full'), 'sw2', 'hinge_compound', 'requirePref', 'strength_main', 'pref_mode', 'strict'),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'minimal'), 'swAny', jsonb_build_array('hinge_pattern'), 'requirePref', 'strength_main', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'bodyweight'), 'swAny', jsonb_build_array('hinge_pattern'), 'mp', 'hinge', 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true)
              )
            ),
            jsonb_build_object(
              'slot', 'B:secondary_lower',
              'variants', jsonb_build_array(
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'full'), 'sw2', 'squat_compound', 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'strict'),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'minimal'), 'swAny', jsonb_build_array('squat_pattern'), 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'soft', 'pref_bonus', 4),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'bodyweight'), 'swAny', jsonb_build_array('squat_pattern'), 'mp', 'squat', 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true)
              )
            ),
            jsonb_build_object('slot', 'C:hamstring_iso', 'sw', 'hamstring_iso', 'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'A:hinge'),
            jsonb_build_object('slot', 'C:glute', 'sw', 'glute_iso', 'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'A:hinge'),
            jsonb_build_object('slot', 'D:core', 'mp', 'anti_extension', 'sw', 'core', 'fill_fallback_slot', 'B:secondary_lower'),
            jsonb_build_object('slot', 'C:calves', 'sw', 'calf_iso', 'requirePref', 'hypertrophy_secondary', 'preferLoadable', true, 'fill_fallback_slot', 'B:secondary_lower')
          )
        )
      ),
      'sets_by_duration', jsonb_build_object(
        '40', jsonb_build_object('A', 3, 'B', 3, 'C', 2, 'D', 2),
        '50', jsonb_build_object('A', 4, 'B', 3, 'C', 3, 'D', 2),
        '60', jsonb_build_object('A', 5, 'B', 4, 'C', 3, 'D', 3)
      ),
      'block_budget', jsonb_build_object('40', 4, '50', 5, '60', 6),
      'slot_defaults', jsonb_build_object(
        'C', jsonb_build_object('requirePref', 'hypertrophy_secondary'),
        'D', jsonb_build_object('requirePref', 'hypertrophy_secondary')
      ),
      'exclude_movement_classes', jsonb_build_array('cardio', 'conditioning', 'locomotion')
    ),
    'segmentation', jsonb_build_object(
      'block_semantics', jsonb_build_object(
        'A', jsonb_build_object('preferred_segment_type', 'single', 'purpose', 'main'),
        'B', jsonb_build_object('preferred_segment_type', 'superset', 'purpose', 'secondary'),
        'C', jsonb_build_object('preferred_segment_type', 'giant_set', 'purpose', 'accessory'),
        'D', jsonb_build_object('preferred_segment_type', 'single', 'purpose', 'accessory')
      )
    ),
    'progression', jsonb_build_object(
      'apply_to_purposes', jsonb_build_array('main', 'secondary', 'accessory')
    )
  ) AS program_generation_config_json,
  s.program_type,
  s.progression_by_rank_json,
  s.schema_version,
  s.total_weeks_default,
  s.week_phase_config_json,
  now()
FROM seed_rows s
ON CONFLICT (config_key)
DO UPDATE SET
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  program_generation_config_json = EXCLUDED.program_generation_config_json,
  program_type = EXCLUDED.program_type,
  progression_by_rank_json = EXCLUDED.progression_by_rank_json,
  schema_version = EXCLUDED.schema_version,
  total_weeks_default = EXCLUDED.total_weeks_default,
  week_phase_config_json = EXCLUDED.week_phase_config_json,
  updated_at = now();

WITH seed_rows AS (
  SELECT
    'strength_default_v1'::text AS config_key,
    true AS is_active,
    'Baseline deterministic strength progression config.'::text AS notes,
    'strength'::text AS program_type,
    1::int AS schema_version,
    4::int AS total_weeks_default,
    jsonb_build_object(
      'beginner', jsonb_build_object('weekly_set_step', 0, 'max_extra_sets', 0),
      'intermediate', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 1),
      'advanced', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 2),
      'elite', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 3)
    ) AS progression_by_rank_json,
    jsonb_build_object(
      'default_phase_sequence', jsonb_build_array('BASELINE', 'BUILD', 'BUILD', 'CONSOLIDATE'),
      'last_week_mode', 'consolidate',
      'phase_labels', jsonb_build_object(
        'BASELINE', 'Baseline',
        'BUILD', 'Build',
        'CONSOLIDATE', 'Consolidate'
      ),
      'copy', jsonb_build_object(
        'BASELINE', jsonb_build_object('focus', 'Build technical consistency at moderate intensity.', 'notes', 'Leave ~2 reps in reserve on main sets.'),
        'BUILD', jsonb_build_object('focus', 'Progress load gradually while preserving bar speed.', 'notes', 'Prioritize quality reps over maximal effort.'),
        'CONSOLIDATE', jsonb_build_object('focus', 'Reduce fatigue and sharpen execution.', 'notes', 'Trim volume slightly in the final week.')
      )
    ) AS week_phase_config_json
)
INSERT INTO public.program_generation_config (
  config_key,
  is_active,
  notes,
  program_generation_config_json,
  program_type,
  progression_by_rank_json,
  schema_version,
  total_weeks_default,
  week_phase_config_json,
  updated_at
)
SELECT
  s.config_key,
  s.is_active,
  s.notes,
  jsonb_build_object(
    'config_key', s.config_key,
    'program_type', s.program_type,
    'schema_version', s.schema_version,
    'is_active', s.is_active,
    'total_weeks_default', s.total_weeks_default,
    'progression_by_rank_json', s.progression_by_rank_json,
    'week_phase_config_json', s.week_phase_config_json,
    'builder', jsonb_build_object(
      'day_templates', jsonb_build_array(
        jsonb_build_object(
          'day_key', 'day1',
          'focus', 'lower_strength',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object(
              'slot', 'A:squat_strength',
              'preferLoadable', true,
              'variants', jsonb_build_array(
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'full'), 'sw2', 'squat_compound', 'requirePref', 'strength_main', 'pref_mode', 'strict'),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'minimal'), 'swAny', jsonb_build_array('squat_pattern'), 'requirePref', 'strength_main', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'bodyweight'), 'swAny', jsonb_build_array('squat_pattern'), 'mp', 'squat', 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true)
              )
            ),
            jsonb_build_object(
              'slot', 'B:hinge_strength',
              'preferLoadable', true,
              'variants', jsonb_build_array(
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'full'), 'sw2', 'hinge_compound', 'requirePref', 'strength_main', 'pref_mode', 'strict'),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'minimal'), 'swAny', jsonb_build_array('hinge_pattern'), 'requirePref', 'strength_main', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'bodyweight'), 'swAny', jsonb_build_array('hinge_pattern'), 'mp', 'hinge', 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true)
              )
            ),
            jsonb_build_object('slot', 'C:lunge_strength', 'mp', 'lunge', 'sw', 'quad_iso_unilateral'),
            jsonb_build_object('slot', 'C:hamstring_iso_strength', 'sw', 'hamstring_iso'),
            jsonb_build_object('slot', 'D:core_strength', 'mp', 'anti_extension', 'sw', 'core')
          )
        ),
        jsonb_build_object(
          'day_key', 'day2',
          'focus', 'upper_strength',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object(
              'slot', 'A:push_horizontal_strength',
              'variants', jsonb_build_array(
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'full'), 'sw2', 'push_horizontal_compound', 'requirePref', 'strength_main', 'pref_mode', 'strict'),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'minimal'), 'swAny', jsonb_build_array('push_horizontal_pattern'), 'requirePref', 'strength_main', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'bodyweight'), 'swAny', jsonb_build_array('push_horizontal_pattern'), 'mp', 'push_horizontal', 'requirePref', 'strength_main', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true)
              )
            ),
            jsonb_build_object(
              'slot', 'B:pull_horizontal_strength',
              'variants', jsonb_build_array(
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'full'), 'sw2', 'pull_horizontal_compound', 'requirePref', 'strength_main', 'pref_mode', 'strict'),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'minimal'), 'swAny', jsonb_build_array('pull_horizontal_pattern'), 'requirePref', 'strength_main', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'bodyweight'), 'swAny', jsonb_build_array('pull_horizontal_pattern'), 'mp', 'pull_horizontal', 'requirePref', 'strength_main', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true)
              )
            ),
            jsonb_build_object('slot', 'C:push_vertical_strength', 'mp', 'push_vertical', 'sw', 'push_vertical', 'requirePref', 'strength_main'),
            jsonb_build_object('slot', 'C:pull_vertical_strength', 'mp', 'pull_vertical', 'sw', 'pull_vertical'),
            jsonb_build_object('slot', 'D:core_upper_strength', 'mp', 'anti_extension', 'sw', 'core')
          )
        ),
        jsonb_build_object(
          'day_key', 'day3',
          'focus', 'posterior_strength',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object(
              'slot', 'A:hinge_posterior_strength',
              'preferLoadable', true,
              'variants', jsonb_build_array(
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'full'), 'sw2', 'hinge_compound', 'requirePref', 'strength_main', 'pref_mode', 'strict'),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'minimal'), 'swAny', jsonb_build_array('hinge_pattern'), 'requirePref', 'strength_main', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'bodyweight'), 'swAny', jsonb_build_array('hinge_pattern'), 'mp', 'hinge', 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true)
              )
            ),
            jsonb_build_object(
              'slot', 'B:squat_posterior_strength',
              'preferLoadable', true,
              'variants', jsonb_build_array(
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'full'), 'sw2', 'squat_compound', 'requirePref', 'strength_main', 'pref_mode', 'strict'),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'minimal'), 'swAny', jsonb_build_array('squat_pattern'), 'requirePref', 'strength_main', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true),
                jsonb_build_object('when', jsonb_build_object('equipment_profile', 'bodyweight'), 'swAny', jsonb_build_array('squat_pattern'), 'mp', 'squat', 'requirePref', 'hypertrophy_secondary', 'pref_mode', 'soft', 'pref_bonus', 4, 'strength_equivalent_bonus', true)
              )
            ),
            jsonb_build_object('slot', 'C:glute_strength', 'sw', 'glute_iso'),
            jsonb_build_object('slot', 'C:calves_strength', 'sw', 'calf_iso', 'preferLoadable', true),
            jsonb_build_object('slot', 'D:core_posterior_strength', 'mp', 'anti_extension', 'sw', 'core')
          )
        )
      ),
      'sets_by_duration', jsonb_build_object(
        '40', jsonb_build_object('A', 4, 'B', 3, 'C', 2, 'D', 2),
        '50', jsonb_build_object('A', 5, 'B', 3, 'C', 2, 'D', 2),
        '60', jsonb_build_object('A', 5, 'B', 4, 'C', 3, 'D', 2)
      ),
      'block_budget', jsonb_build_object('40', 4, '50', 5, '60', 5),
      'slot_defaults', jsonb_build_object(
        'C', jsonb_build_object(),
        'D', jsonb_build_object()
      ),
      'exclude_movement_classes', jsonb_build_array('cardio', 'conditioning', 'locomotion')
    ),
    'segmentation', jsonb_build_object(
      'block_semantics', jsonb_build_object(
        'A', jsonb_build_object('preferred_segment_type', 'single', 'purpose', 'main'),
        'B', jsonb_build_object('preferred_segment_type', 'single', 'purpose', 'secondary'),
        'C', jsonb_build_object('preferred_segment_type', 'single', 'purpose', 'accessory'),
        'D', jsonb_build_object('preferred_segment_type', 'single', 'purpose', 'accessory')
      )
    ),
    'progression', jsonb_build_object(
      'apply_to_purposes', jsonb_build_array('main', 'secondary', 'accessory')
    )
  ) AS program_generation_config_json,
  s.program_type,
  s.progression_by_rank_json,
  s.schema_version,
  s.total_weeks_default,
  s.week_phase_config_json,
  now()
FROM seed_rows s
ON CONFLICT (config_key)
DO UPDATE SET
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  program_generation_config_json = EXCLUDED.program_generation_config_json,
  program_type = EXCLUDED.program_type,
  progression_by_rank_json = EXCLUDED.progression_by_rank_json,
  schema_version = EXCLUDED.schema_version,
  total_weeks_default = EXCLUDED.total_weeks_default,
  week_phase_config_json = EXCLUDED.week_phase_config_json,
  updated_at = now();

-- ── Conditioning ─────────────────────────────────────────────────────────────
WITH seed_rows AS (
  SELECT
    'conditioning_default_v1'::text AS config_key,
    true AS is_active,
    'Baseline conditioning / cardio-focused program config.'::text AS notes,
    'conditioning'::text AS program_type,
    1::int AS schema_version,
    4::int AS total_weeks_default,
    jsonb_build_object(
      'beginner', jsonb_build_object('weekly_set_step', 0, 'max_extra_sets', 0),
      'intermediate', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 1),
      'advanced', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 2),
      'elite', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 3)
    ) AS progression_by_rank_json,
    jsonb_build_object(
      'default_phase_sequence', jsonb_build_array('BASELINE', 'BUILD', 'BUILD', 'CONSOLIDATE'),
      'last_week_mode', 'consolidate',
      'phase_labels', jsonb_build_object(
        'BASELINE', 'Baseline',
        'BUILD', 'Build',
        'CONSOLIDATE', 'Consolidate'
      ),
      'copy', jsonb_build_object(
        'BASELINE', jsonb_build_object('focus', 'Establish effort and pacing.', 'notes', 'Keep effort manageable — build the aerobic base.'),
        'BUILD', jsonb_build_object('focus', 'Increase intensity or volume progressively.', 'notes', 'Push a little harder each session.'),
        'CONSOLIDATE', jsonb_build_object('focus', 'Back off and lock in your gains.', 'notes', 'Reduce volume slightly, maintain quality.')
      )
    ) AS week_phase_config_json
)
INSERT INTO public.program_generation_config (
  config_key,
  is_active,
  notes,
  program_generation_config_json,
  program_type,
  progression_by_rank_json,
  schema_version,
  total_weeks_default,
  week_phase_config_json,
  updated_at
)
SELECT
  s.config_key,
  s.is_active,
  s.notes,
  jsonb_build_object(
    'config_key', s.config_key,
    'builder', jsonb_build_object(
      'day_templates', jsonb_build_array(
        jsonb_build_object(
          'day_key', 'day1',
          'focus', 'engine_power',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object('slot', 'A:engine', 'mp', 'cyclical_engine', 'requirePref', 'conditioning_main'),
            jsonb_build_object('slot', 'B:locomotion', 'mp', 'locomotion', 'requirePref', 'conditioning_main'),
            jsonb_build_object('slot', 'C:carry', 'mp', 'carry', 'fill_fallback_slot', 'A:engine'),
            jsonb_build_object('slot', 'D:finisher', 'mp', 'locomotion', 'requirePref', 'finisher', 'fill_fallback_slot', 'B:locomotion')
          )
        ),
        jsonb_build_object(
          'day_key', 'day2',
          'focus', 'mixed_modal',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object('slot', 'A:locomotion', 'mp', 'locomotion', 'requirePref', 'conditioning_main'),
            jsonb_build_object('slot', 'B:engine', 'mp', 'cyclical_engine', 'requirePref', 'conditioning_main'),
            jsonb_build_object('slot', 'C:carry', 'mp', 'carry', 'fill_fallback_slot', 'A:locomotion'),
            jsonb_build_object('slot', 'D:finisher', 'mp', 'locomotion', 'requirePref', 'finisher', 'fill_fallback_slot', 'B:engine')
          )
        ),
        jsonb_build_object(
          'day_key', 'day3',
          'focus', 'aerobic_base',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object('slot', 'A:engine', 'mp', 'cyclical_engine', 'requirePref', 'conditioning_main'),
            jsonb_build_object('slot', 'B:carry', 'mp', 'carry', 'fill_fallback_slot', 'A:engine'),
            jsonb_build_object('slot', 'C:locomotion', 'mp', 'locomotion', 'requirePref', 'conditioning_main', 'fill_fallback_slot', 'A:engine'),
            jsonb_build_object('slot', 'D:finisher', 'mp', 'locomotion', 'requirePref', 'finisher', 'fill_fallback_slot', 'C:locomotion')
          )
        )
      ),
      'sets_by_duration', jsonb_build_object(
        '40', jsonb_build_object('A', 3, 'B', 3, 'C', 2, 'D', 2),
        '50', jsonb_build_object('A', 3, 'B', 3, 'C', 2, 'D', 2),
        '60', jsonb_build_object('A', 4, 'B', 3, 'C', 3, 'D', 2)
      ),
      'block_budget', jsonb_build_object('40', 4, '50', 5, '60', 5),
      'slot_defaults', jsonb_build_object(
        'C', jsonb_build_object(),
        'D', jsonb_build_object()
      ),
      'conditioning_thresholds', jsonb_build_object(
        'high_impact_threshold', 2,
        'high_density_threshold', 2,
        'high_complexity_threshold', 2,
        'impact_adjacency_penalty', jsonb_build_array(-3.0, -2.0, -1.0, -0.5),
        'density_adjacency_penalty', jsonb_build_array(-2.0, -1.5, -0.5, 0.0),
        'density_complexity_penalty', jsonb_build_array(-2.0, -1.5, -0.5, 0.0),
        'impact_daily_cap', jsonb_build_array(2, 3, 4, 5),
        'impact_over_cap_penalty', jsonb_build_array(-3.0, -2.0, -1.0, -0.5),
        'density_daily_cap', jsonb_build_array(3, 4, 5, 6),
        'density_over_cap_penalty', jsonb_build_array(-2.0, -1.5, -0.5, -0.2),
        'complexity_daily_cap', jsonb_build_array(2, 3, 4, 5),
        'complexity_over_cap_penalty', jsonb_build_array(-2.0, -1.5, -0.5, -0.2),
        'density_bonus_multiplier', jsonb_build_array(0.5, 0.8, 1.2, 1.5)
      ),
      'exclude_movement_classes', jsonb_build_array()
    ),
    'segmentation', jsonb_build_object(
      'block_semantics', jsonb_build_object(
        'A', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'main'),
        'B', jsonb_build_object('preferred_segment_type', 'emom', 'purpose', 'secondary'),
        'C', jsonb_build_object('preferred_segment_type', 'giant_set', 'purpose', 'accessory'),
        'D', jsonb_build_object('preferred_segment_type', 'single', 'purpose', 'accessory')
      )
    ),
    'progression', jsonb_build_object(
      'apply_to_purposes', jsonb_build_array('main', 'secondary', 'accessory')
    )
  ) AS program_generation_config_json,
  s.program_type,
  s.progression_by_rank_json,
  s.schema_version,
  s.total_weeks_default,
  s.week_phase_config_json,
  now()
FROM seed_rows s
ON CONFLICT (config_key)
DO UPDATE SET
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  program_generation_config_json = EXCLUDED.program_generation_config_json,
  program_type = EXCLUDED.program_type,
  progression_by_rank_json = EXCLUDED.progression_by_rank_json,
  schema_version = EXCLUDED.schema_version,
  total_weeks_default = EXCLUDED.total_weeks_default,
  week_phase_config_json = EXCLUDED.week_phase_config_json,
  updated_at = now();


-- Hyrox
WITH seed_rows AS (
  SELECT
    'hyrox_default_v1'::text AS config_key,
    true AS is_active,
    'Baseline Hyrox race-prep program config (engine, power, endurance days).'::text AS notes,
    'hyrox'::text AS program_type,
    1::int AS schema_version,
    8::int AS total_weeks_default,
    jsonb_build_object(
      'beginner', jsonb_build_object('weekly_set_step', 0, 'max_extra_sets', 0),
      'intermediate', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 2),
      'advanced', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 3),
      'elite', jsonb_build_object('weekly_set_step', 1, 'max_extra_sets', 4)
    ) AS progression_by_rank_json,
    jsonb_build_object(
      'default_phase_sequence', jsonb_build_array('BASELINE', 'BASELINE', 'BUILD', 'BUILD', 'BUILD', 'PEAK', 'PEAK', 'CONSOLIDATE'),
      'last_week_mode', 'consolidate',
      'phase_labels', jsonb_build_object(
        'BASELINE', 'Baseline',
        'BUILD', 'Build',
        'PEAK', 'Peak',
        'CONSOLIDATE', 'Consolidate'
      ),
      'copy', jsonb_build_object(
        'BASELINE', jsonb_build_object('focus', 'Learn race rhythm, sub-maximal effort.', 'notes', 'Keep pace sustainable. Focus on buy-in execution.'),
        'BUILD', jsonb_build_object('focus', 'Add round targets, increase station intensity.', 'notes', 'Push harder through stations while maintaining run pacing.'),
        'PEAK', jsonb_build_object('focus', 'Near race-intensity across all blocks.', 'notes', 'Aim for race-realistic effort. Simulate the fatigue curve.'),
        'CONSOLIDATE', jsonb_build_object('focus', 'Reduce volume, sharpen transitions.', 'notes', 'Arrive race day fresh and confident.')
      )
    ) AS week_phase_config_json
)
INSERT INTO public.program_generation_config (
  config_key,
  is_active,
  notes,
  program_generation_config_json,
  program_type,
  progression_by_rank_json,
  schema_version,
  total_weeks_default,
  week_phase_config_json,
  updated_at
)
SELECT
  s.config_key,
  s.is_active,
  s.notes,
  jsonb_build_object(
    'config_key', s.config_key,
    'program_type', s.program_type,
    'schema_version', s.schema_version,
    'is_active', s.is_active,
    'total_weeks_default', s.total_weeks_default,
    'progression_by_rank_json', s.progression_by_rank_json,
    'week_phase_config_json', s.week_phase_config_json,
    'builder', jsonb_build_object(
      'day_templates', jsonb_build_array(
        jsonb_build_object(
          'day_key', 'engine_day',
          'focus', 'engine',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object('slot', 'A:run_buy_in', 'block', 'A', 'mp', 'locomotion', 'sw', 'run_interval', 'requirePref', 'hyrox_buy_in', 'is_buy_in', true),
            jsonb_build_object('slot', 'A:station_wall', 'block', 'A', 'sw', 'wallball', 'requirePref', 'hyrox_station', 'fill_fallback_slot', 'A:run_buy_in'),
            jsonb_build_object('slot', 'B:run_buy_in', 'block', 'B', 'mp', 'locomotion', 'sw', 'run_interval', 'requirePref', 'hyrox_buy_in', 'is_buy_in', true),
            jsonb_build_object('slot', 'B:station_erg', 'block', 'B', 'sw', 'ski_erg', 'mp', 'cyclical_engine', 'requirePref', 'ski_erg', 'pref_mode', 'soft', 'fill_fallback_slot', 'B:run_buy_in'),
            jsonb_build_object('slot', 'C:station_carry', 'block', 'C', 'mp', 'carry', 'requirePref', 'hyrox_station'),
            jsonb_build_object('slot', 'C:station_lunge', 'block', 'C', 'sw', 'sandbag_lunge', 'requirePref', 'hyrox_station', 'fill_fallback_slot', 'C:station_carry'),
            jsonb_build_object('slot', 'D:run_buy_in', 'block', 'D', 'mp', 'locomotion', 'sw', 'run_interval', 'requirePref', 'hyrox_buy_in', 'is_buy_in', true),
            jsonb_build_object('slot', 'D:station_burst', 'block', 'D', 'requirePref', 'hyrox_station', 'fill_fallback_slot', 'A:station_wall')
          )
        ),
        jsonb_build_object(
          'day_key', 'power_day',
          'focus', 'power',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object('slot', 'A:strength_lower', 'block', 'A', 'mp', 'squat', 'sw2', 'squat_compound', 'requirePref', 'hyrox_power'),
            jsonb_build_object('slot', 'A:strength_press', 'block', 'A', 'mp', 'push_vertical', 'requirePref', 'hyrox_power'),
            jsonb_build_object('slot', 'B:sled_push', 'block', 'B', 'sw', 'sled_push', 'sw2', 'sled_compound', 'requirePref', 'hyrox_station'),
            jsonb_build_object('slot', 'B:sled_pull', 'block', 'B', 'sw', 'sled_pull', 'sw2', 'sled_compound', 'requirePref', 'hyrox_station', 'fill_fallback_slot', 'B:sled_push'),
            jsonb_build_object('slot', 'B:wallball', 'block', 'B', 'sw', 'wallball', 'requirePref', 'hyrox_station', 'fill_fallback_slot', 'B:sled_push'),
            jsonb_build_object('slot', 'C:run_buy_in', 'block', 'C', 'mp', 'locomotion', 'sw', 'run_interval', 'requirePref', 'hyrox_buy_in', 'is_buy_in', true),
            jsonb_build_object('slot', 'C:carry', 'block', 'C', 'mp', 'carry', 'requirePref', 'hyrox_station'),
            jsonb_build_object('slot', 'D:station_erg', 'block', 'D', 'sw', 'ski_erg', 'mp', 'cyclical_engine', 'requirePref', 'ski_erg', 'pref_mode', 'soft')
          )
        ),
        jsonb_build_object(
          'day_key', 'endurance_day',
          'focus', 'endurance',
          'ordered_slots', jsonb_build_array(
            jsonb_build_object('slot', 'A:run_buy_in', 'block', 'A', 'mp', 'locomotion', 'sw', 'run_interval', 'requirePref', 'hyrox_buy_in', 'is_buy_in', true),
            jsonb_build_object('slot', 'A:station_erg', 'block', 'A', 'sw', 'ski_erg', 'mp', 'cyclical_engine', 'requirePref', 'ski_erg', 'pref_mode', 'soft', 'fill_fallback_slot', 'A:run_buy_in'),
            jsonb_build_object('slot', 'B:run_buy_in', 'block', 'B', 'mp', 'locomotion', 'sw', 'run_interval', 'requirePref', 'hyrox_buy_in', 'is_buy_in', true),
            jsonb_build_object('slot', 'B:station_wall', 'block', 'B', 'sw', 'wallball', 'requirePref', 'hyrox_station', 'fill_fallback_slot', 'B:run_buy_in'),
            jsonb_build_object('slot', 'C:run_buy_in', 'block', 'C', 'mp', 'locomotion', 'sw', 'run_interval', 'requirePref', 'hyrox_buy_in', 'is_buy_in', true),
            jsonb_build_object('slot', 'C:carry', 'block', 'C', 'mp', 'carry', 'requirePref', 'hyrox_station'),
            jsonb_build_object('slot', 'D:run_buy_in', 'block', 'D', 'mp', 'locomotion', 'sw', 'run_interval', 'requirePref', 'hyrox_buy_in', 'is_buy_in', true),
            jsonb_build_object('slot', 'D:station_lunge', 'block', 'D', 'sw', 'sandbag_lunge', 'requirePref', 'hyrox_station', 'fill_fallback_slot', 'D:run_buy_in')
          )
        )
      ),
      'sets_by_duration', jsonb_build_object(
        '40', jsonb_build_object('A', 3, 'B', 3, 'C', 3, 'D', 3),
        '50', jsonb_build_object('A', 4, 'B', 3, 'C', 3, 'D', 3),
        '60', jsonb_build_object('A', 4, 'B', 4, 'C', 3, 'D', 3)
      ),
      'block_budget', jsonb_build_object('40', 8, '50', 8, '60', 8),
      'slot_defaults', jsonb_build_object(),
      'exclude_movement_classes', jsonb_build_array()
    ),
    'segmentation', jsonb_build_object(
      'block_semantics', jsonb_build_object(
        'A', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'main', 'time_cap_sec', 480, 'post_segment_rest_sec', 60),
        'B', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'secondary', 'time_cap_sec', 480, 'post_segment_rest_sec', 60),
        'C', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'accessory', 'time_cap_sec', 480, 'post_segment_rest_sec', 60),
        'D', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'accessory', 'time_cap_sec', 480, 'post_segment_rest_sec', 0)
      ),
      'block_semantics_by_focus', jsonb_build_object(
        'power', jsonb_build_object(
          'A', jsonb_build_object('preferred_segment_type', 'single', 'purpose', 'main', 'post_segment_rest_sec', 120),
          'B', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'secondary', 'time_cap_sec', 480, 'post_segment_rest_sec', 60),
          'C', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'accessory', 'time_cap_sec', 480, 'post_segment_rest_sec', 60),
          'D', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'accessory', 'time_cap_sec', 480, 'post_segment_rest_sec', 0)
        ),
        'endurance', jsonb_build_object(
          'A', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'main', 'time_cap_sec', 600, 'post_segment_rest_sec', 90),
          'B', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'secondary', 'time_cap_sec', 600, 'post_segment_rest_sec', 90),
          'C', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'accessory', 'time_cap_sec', 600, 'post_segment_rest_sec', 90),
          'D', jsonb_build_object('preferred_segment_type', 'amrap', 'purpose', 'accessory', 'time_cap_sec', 600, 'post_segment_rest_sec', 0)
        )
      )
    ),
    'progression', jsonb_build_object(
      'apply_to_purposes', jsonb_build_array('main', 'secondary', 'accessory')
    )
  ) AS program_generation_config_json,
  s.program_type,
  s.progression_by_rank_json,
  s.schema_version,
  s.total_weeks_default,
  s.week_phase_config_json,
  now()
FROM seed_rows s
ON CONFLICT (config_key)
DO UPDATE SET
  is_active = EXCLUDED.is_active,
  notes = EXCLUDED.notes,
  program_generation_config_json = EXCLUDED.program_generation_config_json,
  program_type = EXCLUDED.program_type,
  progression_by_rank_json = EXCLUDED.progression_by_rank_json,
  schema_version = EXCLUDED.schema_version,
  total_weeks_default = EXCLUDED.total_weeks_default,
  week_phase_config_json = EXCLUDED.week_phase_config_json,
  updated_at = now();
