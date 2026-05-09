UPDATE program_generation_config
SET program_generation_config_json = jsonb_set(
  COALESCE(program_generation_config_json, '{}'::jsonb),
  '{progression}',
  COALESCE(program_generation_config_json->'progression', '{}'::jsonb) || jsonb_build_object(
    'decision_engine_version', 'v2',
    'history', jsonb_build_object(
      'lookback_exposures_exact', 3,
      'minimum_exact_exposures_for_full_confidence', 2,
      'allow_equivalent_history_fallback', false
    ),
    'outcomes', jsonb_build_object(
      'allow_multiple_levers_same_exposure', false
    ),
    'lever_profiles', jsonb_build_object(
      'hypertrophy_main', jsonb_build_object(
        'priority_order', jsonb_build_array('reps', 'load', 'hold', 'deload'),
        'load_increment_profile', 'compound_moderate',
        'rep_progression_profile', 'double_progression_main',
        'deload_profile', 'standard_local'
      ),
      'hypertrophy_secondary', jsonb_build_object(
        'priority_order', jsonb_build_array('reps', 'load', 'hold', 'deload'),
        'load_increment_profile', 'compound_moderate',
        'rep_progression_profile', 'double_progression_main',
        'deload_profile', 'standard_local'
      ),
      'hypertrophy_accessory', jsonb_build_object(
        'priority_order', jsonb_build_array('reps', 'load', 'hold', 'deload'),
        'load_increment_profile', 'small_isolation',
        'rep_progression_profile', 'double_progression_main',
        'deload_profile', 'standard_local'
      ),
      'strength_main', jsonb_build_object(
        'priority_order', jsonb_build_array('load', 'reps', 'hold', 'deload'),
        'load_increment_profile', 'barbell_strength',
        'rep_progression_profile', 'tight_strength_reps',
        'deload_profile', 'strength_local'
      ),
      'strength_secondary', jsonb_build_object(
        'priority_order', jsonb_build_array('load', 'hold', 'deload'),
        'load_increment_profile', 'compound_moderate',
        'rep_progression_profile', 'tight_strength_reps',
        'deload_profile', 'strength_local'
      ),
      'strength_accessory', jsonb_build_object(
        'priority_order', jsonb_build_array('reps', 'load', 'hold', 'deload'),
        'load_increment_profile', 'small_isolation',
        'rep_progression_profile', 'double_progression_main',
        'deload_profile', 'standard_local'
      ),
      'conditioning_main', jsonb_build_object(
        'priority_order', jsonb_build_array('rest', 'hold', 'deload'),
        'rest_progression_profile', 'conditioning_density',
        'deload_profile', 'conditioning_local'
      ),
      'conditioning_secondary', jsonb_build_object(
        'priority_order', jsonb_build_array('rest', 'hold', 'deload'),
        'rest_progression_profile', 'conditioning_density',
        'deload_profile', 'conditioning_local'
      ),
      'conditioning_accessory', jsonb_build_object(
        'priority_order', jsonb_build_array('rest', 'hold', 'deload'),
        'rest_progression_profile', 'conditioning_density',
        'deload_profile', 'conditioning_local'
      ),
      'hyrox_main', jsonb_build_object(
        'priority_order', jsonb_build_array('rest', 'load', 'hold', 'deload'),
        'rest_progression_profile', 'hyrox_density',
        'load_increment_profile', 'hyrox_station_load',
        'deload_profile', 'conditioning_local'
      ),
      'hyrox_secondary', jsonb_build_object(
        'priority_order', jsonb_build_array('rest', 'hold', 'deload'),
        'rest_progression_profile', 'hyrox_density',
        'deload_profile', 'conditioning_local'
      ),
      'hyrox_accessory', jsonb_build_object(
        'priority_order', jsonb_build_array('rest', 'hold', 'deload'),
        'rest_progression_profile', 'hyrox_density',
        'deload_profile', 'conditioning_local'
      )
    ),
    'slot_profile_map', jsonb_build_object(
      'hypertrophy', jsonb_build_object('main', 'hypertrophy_main', 'secondary', 'hypertrophy_secondary', 'accessory', 'hypertrophy_accessory'),
      'strength', jsonb_build_object('main', 'strength_main', 'secondary', 'strength_secondary', 'accessory', 'strength_accessory'),
      'conditioning', jsonb_build_object('main', 'conditioning_main', 'secondary', 'conditioning_secondary', 'accessory', 'conditioning_accessory'),
      'hyrox', jsonb_build_object('main', 'hyrox_main', 'secondary', 'hyrox_secondary', 'accessory', 'hyrox_accessory')
    ),
    'load_increment_profiles', jsonb_build_object(
      'barbell_strength', jsonb_build_object(
        'default_rounding_kg', 2.5,
        'bands', jsonb_build_array(
          jsonb_build_object('min_load_kg', 0, 'max_load_kg', 60, 'increment_kg', 2.5),
          jsonb_build_object('min_load_kg', 60, 'max_load_kg', 140, 'increment_kg', 5.0),
          jsonb_build_object('min_load_kg', 140, 'increment_kg', 2.5)
        )
      ),
      'compound_moderate', jsonb_build_object(
        'default_rounding_kg', 2.5,
        'bands', jsonb_build_array(
          jsonb_build_object('min_load_kg', 0, 'max_load_kg', 40, 'increment_kg', 2.5),
          jsonb_build_object('min_load_kg', 40, 'max_load_kg', 100, 'increment_kg', 5.0),
          jsonb_build_object('min_load_kg', 100, 'increment_kg', 2.5)
        )
      ),
      'small_isolation', jsonb_build_object(
        'default_rounding_kg', 1.0,
        'bands', jsonb_build_array(
          jsonb_build_object('min_load_kg', 0, 'max_load_kg', 15, 'increment_kg', 1.0),
          jsonb_build_object('min_load_kg', 15, 'increment_kg', 2.0)
        )
      ),
      'hyrox_station_load', jsonb_build_object(
        'bands', jsonb_build_array(
          jsonb_build_object('implement', 'sled_push', 'increment_kg', 5.0),
          jsonb_build_object('implement', 'sled_pull', 'increment_kg', 5.0),
          jsonb_build_object('implement', 'carry', 'increment_kg', 2.5),
          jsonb_build_object('implement', 'wallball', 'increment_kg', 1.0),
          jsonb_build_object('implement', 'sandbag_lunge', 'increment_kg', 2.5)
        )
      )
    ),
    'rest_progression_profiles', jsonb_build_object(
      'conditioning_density', jsonb_build_object('rest_step_sec', 10, 'minimum_rest_sec', 20, 'increase_rest_on_failure_sec', 15),
      'hyrox_density', jsonb_build_object('rest_step_sec', 15, 'minimum_rest_sec', 30, 'increase_rest_on_failure_sec', 15)
    ),
    'rep_progression_profiles', jsonb_build_object(
      'double_progression_main', jsonb_build_object('mode', 'within_range_then_load', 'rep_range_expansion_step', 1, 'require_top_of_range_exposures', 2),
      'tight_strength_reps', jsonb_build_object('mode', 'load_first_small_rep_backfill', 'rep_range_expansion_step', 0, 'allow_rep_progression_only_when_load_not_ready', true)
    ),
    'deload_rules', jsonb_build_object(
      'standard_local', jsonb_build_object(
        'underperformance_exposure_threshold', 2,
        'rir_miss_threshold', 1.5,
        'load_drop_threshold_pct', 5,
        'response', jsonb_build_object('load_drop_pct', 5, 'set_multiplier', 0.7, 'rir_bump', 2)
      ),
      'strength_local', jsonb_build_object(
        'underperformance_exposure_threshold', 2,
        'rir_miss_threshold', 1.0,
        'load_drop_threshold_pct', 5,
        'response', jsonb_build_object('load_drop_pct', 5, 'set_multiplier', 0.8, 'rir_bump', 1)
      ),
      'conditioning_local', jsonb_build_object(
        'underperformance_exposure_threshold', 2,
        'pace_drop_threshold_pct', 7,
        'response', jsonb_build_object('rest_increase_sec', 20, 'volume_multiplier', 0.8)
      )
    )
  ),
  true
)
WHERE config_key IN ('hypertrophy_default_v1', 'strength_default_v1', 'conditioning_default_v1', 'hyrox_default_v1');
