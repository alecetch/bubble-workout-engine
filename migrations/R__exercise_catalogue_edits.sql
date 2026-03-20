-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-17 21:47:14 UTC
-- Changes: 1-- [1] clone: db_thruster
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'db_thruster',
  'Dumbbell Thruster',
  'engine',
  'push_ballistic',
  1,
  false,
  false,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['wall_ball']::text[],
  '[]'::jsonb,
  NULL,
  2,
  NULL,
  '["hyrox_station"]'::jsonb,
  'wallball',
  'push_ballistic_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  NULL,
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-17 21:49:16 UTC
-- Changes: 1-- [1] edit: db_thruster
UPDATE exercise_catalogue
  SET exercise_id = 'db_thruster',
      name = 'Dumbbell Thruster',
      movement_class = 'engine',
      movement_pattern_primary = 'push_ballistic',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'thruster',
      swap_group_id_2 = 'push_ballistic_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['wall_ball']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '[]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'db_thruster';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-17 22:01:45 UTC
-- Changes: 1-- [1] edit: db_thruster
UPDATE exercise_catalogue
  SET exercise_id = 'db_thruster',
      name = 'Dumbbell Thruster',
      movement_class = 'engine',
      movement_pattern_primary = 'push_ballistic',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'wallball',
      swap_group_id_2 = 'push_ballistic_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '[]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'db_thruster';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-17 22:12:33 UTC
-- Changes: 1-- [1] edit: db_thruster
UPDATE exercise_catalogue
  SET exercise_id = 'db_thruster',
      name = 'Dumbbell Thruster',
      movement_class = 'engine',
      movement_pattern_primary = 'push_ballistic',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'wallball',
      swap_group_id_2 = 'push_ballistic_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '[]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'db_thruster';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-17 22:18:01 UTC
-- Changes: 1-- [1] edit: db_thruster
UPDATE exercise_catalogue
  SET exercise_id = 'db_thruster',
      name = 'Dumbbell Thruster',
      movement_class = 'engine',
      movement_pattern_primary = 'push_ballistic',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'wallball',
      swap_group_id_2 = 'push_ballistic_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hyrox_station"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'db_thruster';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-17 22:22:10 UTC
-- Changes: 1-- [1] edit: medball_slam
UPDATE exercise_catalogue
  SET exercise_id = 'medball_slam',
      name = 'Med Ball Slam',
      movement_class = 'engine',
      movement_pattern_primary = 'locomotion',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 3,
      engine_role = 'high_power',
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'ski_erg',
      swap_group_id_2 = 'locomotion_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['med_ball']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["conditioning_main","hyrox_station"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'medball_slam';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-17 22:48:44 UTC
-- Changes: 1-- [1] edit: outdoor_run_interval
UPDATE exercise_catalogue
  SET exercise_id = 'outdoor_run_interval',
      name = 'Outdoor Run Intervals',
      movement_class = 'engine',
      movement_pattern_primary = 'cyclical_engine',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = true,
      complexity_rank = 0,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'run_interval',
      swap_group_id_2 = 'locomotion_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["conditioning_main","finisher","hyrox_buy_in"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'outdoor_run_interval';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-17 22:49:44 UTC
-- Changes: 1-- [1] edit: bodyweight_reverse_lunge
UPDATE exercise_catalogue
  SET exercise_id = 'bodyweight_reverse_lunge',
      name = 'Reverse Lunge (Bodyweight)',
      movement_class = 'isolation',
      movement_pattern_primary = 'cyclical_engine',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 0,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'lunge_pattern',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary","conditioning_main"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'bodyweight_reverse_lunge';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-17 22:51:35 UTC
-- Changes: 1-- [1] edit: farmer_carry_handles
UPDATE exercise_catalogue
  SET exercise_id = 'farmer_carry_handles',
      name = 'Farmer Carry (handles)',
      movement_class = 'engine',
      movement_pattern_primary = 'carry',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'farmer_carry',
      swap_group_id_2 = 'carry_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["conditioning_main","finisher","hyrox_station","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'farmer_carry_handles';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 18:56:19 UTC
-- Changes: 1-- [1] edit: outdoor_run_interval
UPDATE exercise_catalogue
  SET exercise_id = 'outdoor_run_interval',
      name = 'Outdoor Run Intervals',
      movement_class = 'engine',
      movement_pattern_primary = 'cyclical_engine',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = true,
      complexity_rank = 0,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'run_interval',
      swap_group_id_2 = 'locomotion_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["conditioning_main","finisher","hyrox_buy_in","ski_erg"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'outdoor_run_interval';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 19:14:15 UTC
-- Changes: 1-- [1] edit: sandbag_front_rack_lunge
UPDATE exercise_catalogue
  SET exercise_id = 'sandbag_front_rack_lunge',
      name = 'Sandbag Front-Rack Lunge',
      movement_class = 'engine',
      movement_pattern_primary = 'lunge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'sandbag_lunge',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['sandbag']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["sandbag"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hyrox_station"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'sandbag_front_rack_lunge';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 19:19:45 UTC
-- Changes: 1-- [1] edit: sandbag_front_rack_lunge
UPDATE exercise_catalogue
  SET exercise_id = 'sandbag_front_rack_lunge',
      name = 'Sandbag Front-Rack Lunge',
      movement_class = 'engine',
      movement_pattern_primary = 'lunge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'sandbag_lunge',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['sandbag']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["sandbag"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hyrox_station"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'sandbag_front_rack_lunge';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 19:25:23 UTC
-- Changes: 1-- [1] edit: bodyweight_reverse_lunge
UPDATE exercise_catalogue
  SET exercise_id = 'bodyweight_reverse_lunge',
      name = 'Reverse Lunge (Bodyweight)',
      movement_class = 'isolation',
      movement_pattern_primary = 'lunge',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 0,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'lunge_pattern',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary","conditioning_main"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'bodyweight_reverse_lunge';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 19:26:57 UTC
-- Changes: 1-- [1] edit: bodyweight_reverse_lunge
UPDATE exercise_catalogue
  SET exercise_id = 'bodyweight_reverse_lunge',
      name = 'Reverse Lunge (Bodyweight)',
      movement_class = 'isolation',
      movement_pattern_primary = 'lunge',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 0,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'lunge_pattern',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary","conditioning_main"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'bodyweight_reverse_lunge';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 19:39:39 UTC
-- Changes: 1-- [1] edit: bodyweight_reverse_lunge
UPDATE exercise_catalogue
  SET exercise_id = 'bodyweight_reverse_lunge',
      name = 'Reverse Lunge (Bodyweight)',
      movement_class = 'isolation',
      movement_pattern_primary = 'lunge',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 0,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'lunge_pattern',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary","conditioning_main"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'bodyweight_reverse_lunge';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 19:41:44 UTC
-- Changes: 1-- [1] edit: sandbag_front_rack_lunge
UPDATE exercise_catalogue
  SET exercise_id = 'sandbag_front_rack_lunge',
      name = 'Sandbag Front-Rack Lunge',
      movement_class = 'engine',
      movement_pattern_primary = 'lunge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = true,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'sandbag_lunge',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['sandbag']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["sandbag"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hyrox_station"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'sandbag_front_rack_lunge';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 19:42:15 UTC
-- Changes: 1-- [1] edit: outdoor_run
UPDATE exercise_catalogue
  SET exercise_id = 'outdoor_run',
      name = 'Outdoor Run',
      movement_class = 'engine',
      movement_pattern_primary = 'locomotion',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 3,
      engine_role = 'sustainable',
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'run_interval',
      swap_group_id_2 = 'locomotion_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["conditioning_main","finisher","hyrox_buy_in"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'outdoor_run';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:08:02 UTC
-- Changes: 1-- [1] clone: kb_thruster
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'kb_thruster',
  'Kettlebell Thruster',
  'engine',
  'push_ballistic',
  1,
  false,
  false,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['dumbbells']::text[],
  '[]'::jsonb,
  NULL,
  2,
  NULL,
  '["hyrox_station"]'::jsonb,
  'wallball',
  'push_ballistic_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  NULL,
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:08:27 UTC
-- Changes: 1-- [1] edit: kb_thruster
UPDATE exercise_catalogue
  SET exercise_id = 'kb_thruster',
      name = 'Kettlebell Thruster',
      movement_class = 'engine',
      movement_pattern_primary = 'push_ballistic',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'wallball',
      swap_group_id_2 = 'push_ballistic_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['kettlebells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["kettlebells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hyrox_station"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'kb_thruster';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:09:24 UTC
-- Changes: 1-- [1] clone: sandbag_thruster
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'sandbag_thruster',
  'Sandbag Thruster',
  'engine',
  'push_ballistic',
  1,
  false,
  false,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['dumbbells']::text[],
  '[]'::jsonb,
  NULL,
  2,
  NULL,
  '["hyrox_station"]'::jsonb,
  'wallball',
  'push_ballistic_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  NULL,
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:09:39 UTC
-- Changes: 1-- [1] edit: sandbag_thruster
UPDATE exercise_catalogue
  SET exercise_id = 'sandbag_thruster',
      name = 'Sandbag Thruster',
      movement_class = 'engine',
      movement_pattern_primary = 'push_ballistic',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'wallball',
      swap_group_id_2 = 'push_ballistic_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['sandbag']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["sandbag"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hyrox_station"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'sandbag_thruster';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:11:25 UTC
-- Changes: 1-- [1] clone: squat_jump
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'squat_jump',
  'Squat Jump',
  'engine',
  'push_ballistic',
  1,
  false,
  false,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['dumbbells']::text[],
  '[]'::jsonb,
  NULL,
  2,
  NULL,
  '["hyrox_station"]'::jsonb,
  'wallball',
  'push_ballistic_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  NULL,
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:12:01 UTC
-- Changes: 1-- [1] edit: squat_jump
UPDATE exercise_catalogue
  SET exercise_id = 'squat_jump',
      name = 'Squat Jump',
      movement_class = 'engine',
      movement_pattern_primary = 'push_ballistic',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'wallball',
      swap_group_id_2 = 'push_ballistic_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hyrox_station"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'squat_jump';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:12:33 UTC
-- Changes: 1-- [1] edit: squat_jump
UPDATE exercise_catalogue
  SET exercise_id = 'squat_jump',
      name = 'Squat Jump',
      movement_class = 'engine',
      movement_pattern_primary = 'push_ballistic',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'wallball',
      swap_group_id_2 = 'push_ballistic_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hyrox_station"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'squat_jump';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:17:24 UTC
-- Changes: 1-- [1] edit: db_shoulder_press
UPDATE exercise_catalogue
  SET exercise_id = 'db_shoulder_press',
      name = 'Dumbbell Shoulder Press',
      movement_class = 'compound',
      movement_pattern_primary = 'push_vertical',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_vertical_pattern',
      swap_group_id_2 = 'push_vertical_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["dumbbells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'db_shoulder_press';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:17:50 UTC
-- Changes: 1-- [1] clone: kb_shoulder_press
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'kb_shoulder_press',
  'Kettlebell Shoulder Press',
  'compound',
  'push_vertical',
  0,
  false,
  true,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['dumbbells']::text[],
  '["dumbbells"]'::jsonb,
  NULL,
  0,
  NULL,
  '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
  'push_vertical_pattern',
  'push_vertical_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  'upper',
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:18:10 UTC
-- Changes: 1-- [1] edit: kb_shoulder_press
UPDATE exercise_catalogue
  SET exercise_id = 'kb_shoulder_press',
      name = 'Kettlebell Shoulder Press',
      movement_class = 'compound',
      movement_pattern_primary = 'push_vertical',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_vertical_pattern',
      swap_group_id_2 = 'push_vertical_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['kettlebells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["kettlebells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'kb_shoulder_press';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:20:57 UTC
-- Changes: 1-- [1] clone: pike_push_up
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'pike_push_up',
  'Pike Push Up',
  'compound',
  'push_vertical',
  0,
  false,
  true,
  1,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['dumbbells']::text[],
  '["dumbbells"]'::jsonb,
  NULL,
  0,
  NULL,
  '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
  'push_vertical_pattern',
  'push_vertical_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  'upper',
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:22:22 UTC
-- Changes: 1-- [1] edit: pike_push_up
UPDATE exercise_catalogue
  SET exercise_id = 'pike_push_up',
      name = 'Pike Push Up',
      movement_class = 'compound',
      movement_pattern_primary = 'push_vertical',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_vertical_pattern',
      swap_group_id_2 = 'push_vertical_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'pike_push_up';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:29:27 UTC
-- Changes: 1-- [1] edit: bear_crawl
UPDATE exercise_catalogue
  SET exercise_id = 'bear_crawl',
      name = 'Bear Crawl',
      movement_class = 'engine',
      movement_pattern_primary = 'locomotion',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 3,
      engine_role = 'mixed_modal',
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'locomotion',
      swap_group_id_2 = 'locomotion_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["conditioning_main","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'bear_crawl';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:34:44 UTC
-- Changes: 1-- [1] edit: bear_crawl
UPDATE exercise_catalogue
  SET exercise_id = 'bear_crawl',
      name = 'Bear Crawl',
      movement_class = 'engine',
      movement_pattern_primary = 'locomotion',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 3,
      engine_role = 'mixed_modal',
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'locomotion',
      swap_group_id_2 = 'sled_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["conditioning_main","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'bear_crawl';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-18 21:36:39 UTC
-- Changes: 1-- [1] edit: burpee_broad_jump
UPDATE exercise_catalogue
  SET exercise_id = 'burpee_broad_jump',
      name = 'Burpee Broad Jump',
      movement_class = 'engine',
      movement_pattern_primary = 'locomotion',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'sled_push',
      swap_group_id_2 = 'locomotion_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hyrox_station"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'burpee_broad_jump';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:21:48 UTC
-- Changes: 1-- [1] clone: db_bulgarian_split_squat
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'db_bulgarian_split_squat',
  'Dumbbell Bulgarian Split Squat',
  'isolation',
  'lunge',
  2,
  false,
  true,
  2,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['dumbbells', 'bench']::text[],
  '["dumbbells","bench"]'::jsonb,
  NULL,
  1,
  NULL,
  '["hypertrophy_secondary","conditioning_main"]'::jsonb,
  'quad_iso_unilateral',
  'lunge_compound',
  '["quads","glutes"]'::jsonb,
  '["general_heat","hips","ankles","lunge_pattern"]'::jsonb,
  NULL,
  '(App admin)',
  'lower',
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:22:21 UTC
-- Changes: 1-- [1] clone: kb_bulgarian_split_squat_copy
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'kb_bulgarian_split_squat_copy',
  'Kettlebell Bulgarian Split Squat (Copy)',
  'isolation',
  'lunge',
  2,
  false,
  true,
  2,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['dumbbells', 'bench']::text[],
  '["dumbbells","bench"]'::jsonb,
  NULL,
  1,
  NULL,
  '["hypertrophy_secondary","conditioning_main"]'::jsonb,
  'quad_iso_unilateral',
  'lunge_compound',
  '["quads","glutes"]'::jsonb,
  '["general_heat","hips","ankles","lunge_pattern"]'::jsonb,
  NULL,
  '(App admin)',
  'lower',
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:22:38 UTC
-- Changes: 1-- [1] edit: kb_bulgarian_split_squat_copy
UPDATE exercise_catalogue
  SET exercise_id = 'kb_bulgarian_split_squat_copy',
      name = 'Kettlebell Bulgarian Split Squat (Copy)',
      movement_class = 'isolation',
      movement_pattern_primary = 'lunge',
      min_fitness_rank = 2,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'quad_iso_unilateral',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['bench', 'kettlebells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["bench","kettlebells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary","conditioning_main"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'kb_bulgarian_split_squat_copy';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:22:59 UTC
-- Changes: 1-- [1] edit: bulgarian_split_squat
UPDATE exercise_catalogue
  SET exercise_id = 'bulgarian_split_squat',
      name = 'Bulgarian Split Squat',
      movement_class = 'isolation',
      movement_pattern_primary = 'lunge',
      min_fitness_rank = 2,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'quad_iso_unilateral',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary","conditioning_main"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'bulgarian_split_squat';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:23:15 UTC
-- Changes: 1-- [1] edit: bulgarian_split_squat
UPDATE exercise_catalogue
  SET exercise_id = 'bulgarian_split_squat',
      name = 'Bulgarian Split Squat',
      movement_class = 'isolation',
      movement_pattern_primary = 'lunge',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'quad_iso_unilateral',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary","conditioning_main"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'bulgarian_split_squat';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:23:33 UTC
-- Changes: 1-- [1] edit: db_bulgarian_split_squat
UPDATE exercise_catalogue
  SET exercise_id = 'db_bulgarian_split_squat',
      name = 'Dumbbell Bulgarian Split Squat',
      movement_class = 'isolation',
      movement_pattern_primary = 'lunge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'quad_iso_unilateral',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells', 'bench']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["dumbbells","bench"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary","conditioning_main"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'db_bulgarian_split_squat';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:23:42 UTC
-- Changes: 1-- [1] edit: kb_bulgarian_split_squat_copy
UPDATE exercise_catalogue
  SET exercise_id = 'kb_bulgarian_split_squat_copy',
      name = 'Kettlebell Bulgarian Split Squat (Copy)',
      movement_class = 'isolation',
      movement_pattern_primary = 'lunge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'quad_iso_unilateral',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['bench', 'kettlebells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["bench","kettlebells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary","conditioning_main"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'kb_bulgarian_split_squat_copy';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:28:56 UTC
-- Changes: 1-- [1] clone: singleleg_kb_romanian_deadlift
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'singleleg_kb_romanian_deadlift',
  'Single-Leg Kettlebell Romanian Deadlift',
  'isolation',
  'hinge',
  1,
  false,
  true,
  2,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['dumbbells', 'kettlebells']::text[],
  '["dumbbells","kettlebells"]'::jsonb,
  NULL,
  0,
  NULL,
  '["hypertrophy_secondary"]'::jsonb,
  'hinge_pattern',
  'hinge_pattern_compound',
  '["hamstrings"]'::jsonb,
  '["general_heat","hips","hamstrings","brace","hinge_pattern"]'::jsonb,
  NULL,
  '(App admin)',
  'lower',
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:29:21 UTC
-- Changes: 1-- [1] clone: singleleg_db_romanian_deadlift_copy
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'singleleg_db_romanian_deadlift_copy',
  'Single-Leg Dumbbell Romanian Deadlift (Copy)',
  'isolation',
  'hinge',
  1,
  false,
  true,
  2,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['dumbbells', 'kettlebells']::text[],
  '["dumbbells","kettlebells"]'::jsonb,
  NULL,
  0,
  NULL,
  '["hypertrophy_secondary"]'::jsonb,
  'hinge_pattern',
  'hinge_pattern_compound',
  '["hamstrings"]'::jsonb,
  '["general_heat","hips","hamstrings","brace","hinge_pattern"]'::jsonb,
  NULL,
  '(App admin)',
  'lower',
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:29:45 UTC
-- Changes: 1-- [1] edit: singleleg_db_romanian_deadlift_copy
UPDATE exercise_catalogue
  SET exercise_id = 'singleleg_db_romanian_deadlift_copy',
      name = 'Single-Leg Dumbbell Romanian Deadlift (Copy)',
      movement_class = 'isolation',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_pattern',
      swap_group_id_2 = 'hinge_pattern_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["dumbbells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'singleleg_db_romanian_deadlift_copy';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:29:56 UTC
-- Changes: 1-- [1] edit: singleleg_kb_romanian_deadlift
UPDATE exercise_catalogue
  SET exercise_id = 'singleleg_kb_romanian_deadlift',
      name = 'Single-Leg Kettlebell Romanian Deadlift',
      movement_class = 'isolation',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_pattern',
      swap_group_id_2 = 'hinge_pattern_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['kettlebells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["kettlebells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'singleleg_kb_romanian_deadlift';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:31:27 UTC
-- Changes: 1-- [1] clone: singleleg_romanian_deadlift
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'singleleg_romanian_deadlift',
  'Single-Leg Romanian Deadlift',
  'isolation',
  'hinge',
  1,
  false,
  true,
  2,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['dumbbells']::text[],
  '["dumbbells"]'::jsonb,
  NULL,
  0,
  NULL,
  '["hypertrophy_secondary"]'::jsonb,
  'hinge_pattern',
  'hinge_pattern_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  'lower',
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:31:41 UTC
-- Changes: 1-- [1] edit: singleleg_romanian_deadlift
UPDATE exercise_catalogue
  SET exercise_id = 'singleleg_romanian_deadlift',
      name = 'Single-Leg Romanian Deadlift',
      movement_class = 'isolation',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_pattern',
      swap_group_id_2 = 'hinge_pattern_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'singleleg_romanian_deadlift';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:32:26 UTC
-- Changes: 1-- [1] edit: singleleg_db_romanian_deadlift_copy
UPDATE exercise_catalogue
  SET exercise_id = 'singleleg_db_romanian_deadlift_copy',
      name = 'Single-Leg Dumbbell Romanian Deadlift',
      movement_class = 'isolation',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_pattern',
      swap_group_id_2 = 'hinge_pattern_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["dumbbells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'singleleg_db_romanian_deadlift_copy';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:35:59 UTC
-- Changes: 1-- [1] edit: singleleg_romanian_deadlift
UPDATE exercise_catalogue
  SET exercise_id = 'singleleg_romanian_deadlift',
      name = 'Single-Leg Romanian Deadlift',
      movement_class = 'isolation',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_pattern',
      swap_group_id_2 = 'hinge_pattern_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'singleleg_romanian_deadlift';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:39:31 UTC
-- Changes: 1-- [1] edit: barbell_rdl
UPDATE exercise_catalogue
  SET exercise_id = 'barbell_rdl',
      name = 'Barbell Romanian Deadlift',
      movement_class = 'compound',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 2,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_barbell',
      swap_group_id_2 = 'hinge_pattern_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['barbell']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["barbell"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'barbell_rdl';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:40:30 UTC
-- Changes: 1-- [1] edit: standing_calf_raise_bw
UPDATE exercise_catalogue
  SET exercise_id = 'standing_calf_raise_bw',
      name = 'Standing Calf Raise (Bodyweight)',
      movement_class = 'isolation',
      movement_pattern_primary = 'calf',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'calf_iso',
      swap_group_id_2 = 'calf_accessory',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['bodyweight']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["bodyweight"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'standing_calf_raise_bw';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:40:47 UTC
-- Changes: 1-- [1] edit: standing_calf_raise
UPDATE exercise_catalogue
  SET exercise_id = 'standing_calf_raise',
      name = 'Standing Calf Raise',
      movement_class = 'isolation',
      movement_pattern_primary = 'calf',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'calf_iso',
      swap_group_id_2 = 'calf_accessory',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['calf_machine']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["calf_machine"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'standing_calf_raise';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:40:57 UTC
-- Changes: 1-- [1] edit: single_leg_standing_calf_raise
UPDATE exercise_catalogue
  SET exercise_id = 'single_leg_standing_calf_raise',
      name = 'Single-Leg Standing Calf Raise (Loaded Optional)',
      movement_class = 'isolation',
      movement_pattern_primary = 'calf',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'calf_iso',
      swap_group_id_2 = 'calf_accessory',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['bodyweight', 'dumbbells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["bodyweight","dumbbells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'single_leg_standing_calf_raise';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:41:14 UTC
-- Changes: 1-- [1] edit: barbell_standing_calf_raise
UPDATE exercise_catalogue
  SET exercise_id = 'barbell_standing_calf_raise',
      name = 'Barbell Standing Calf Raise',
      movement_class = 'isolation',
      movement_pattern_primary = 'calf',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'calf_iso',
      swap_group_id_2 = 'calf_accessory',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['barbell']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["barbell"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'barbell_standing_calf_raise';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:42:52 UTC
-- Changes: 1-- [1] clone: db_bench_press
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'db_bench_press',
  'Dumbbell Bench Press',
  'compound',
  'push_horizontal',
  2,
  false,
  true,
  2,
  '[]'::jsonb,
  '{}'::text[],
  1,
  false,
  NULL,
  ARRAY['barbell', 'bench']::text[],
  '["barbell","bench"]'::jsonb,
  NULL,
  0,
  NULL,
  '["strength_main","hypertrophy_secondary"]'::jsonb,
  'push_horizontal_barbell',
  'push_horizontal_compound',
  '["chest","triceps","shoulders"]'::jsonb,
  '["general_heat","t_spine","shoulders","scap_push"]'::jsonb,
  NULL,
  '(App admin)',
  'upper',
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:43:07 UTC
-- Changes: 1-- [1] edit: db_bench_press
UPDATE exercise_catalogue
  SET exercise_id = 'db_bench_press',
      name = 'Dumbbell Bench Press',
      movement_class = 'compound',
      movement_pattern_primary = 'push_horizontal',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_horizontal_barbell',
      swap_group_id_2 = 'push_horizontal_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['barbell', 'bench']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["barbell","bench"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'db_bench_press';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:43:23 UTC
-- Changes: 1-- [1] edit: db_bench_press
UPDATE exercise_catalogue
  SET exercise_id = 'db_bench_press',
      name = 'Dumbbell Bench Press',
      movement_class = 'compound',
      movement_pattern_primary = 'push_horizontal',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_horizontal_barbell',
      swap_group_id_2 = 'push_horizontal_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['bench', 'dumbbells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["bench","dumbbells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'db_bench_press';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:44:00 UTC
-- Changes: 1-- [1] clone: db_floor_press
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'db_floor_press',
  'Dumbbell Floor Press',
  'compound',
  'push_horizontal',
  0,
  false,
  true,
  2,
  '[]'::jsonb,
  '{}'::text[],
  1,
  false,
  NULL,
  ARRAY['bench', 'dumbbells']::text[],
  '["bench","dumbbells"]'::jsonb,
  NULL,
  0,
  NULL,
  '["strength_main","hypertrophy_secondary"]'::jsonb,
  'push_horizontal_barbell',
  'push_horizontal_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  'upper',
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:44:26 UTC
-- Changes: 1-- [1] clone: db_floor_press
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'db_floor_press',
  'Dumbbell Floor Press',
  'compound',
  'push_horizontal',
  0,
  false,
  true,
  2,
  '[]'::jsonb,
  '{}'::text[],
  1,
  false,
  NULL,
  ARRAY['bench', 'dumbbells']::text[],
  '["bench","dumbbells"]'::jsonb,
  NULL,
  0,
  NULL,
  '["strength_main","hypertrophy_secondary"]'::jsonb,
  'push_horizontal_barbell',
  'push_horizontal_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  'upper',
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:44:53 UTC
-- Changes: 1-- [1] edit: db_floor_press
UPDATE exercise_catalogue
  SET exercise_id = 'db_floor_press',
      name = 'Dumbbell Floor Press',
      movement_class = 'compound',
      movement_pattern_primary = 'push_horizontal',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_horizontal_barbell',
      swap_group_id_2 = 'push_horizontal_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["dumbbells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'db_floor_press';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 19:56:51 UTC
-- Changes: 1-- [1] edit: singleleg_db_romanian_deadlift
UPDATE exercise_catalogue
  SET exercise_id = 'singleleg_db_romanian_deadlift',
      name = 'Single-Leg Dumbbell Romanian Deadlift',
      movement_class = 'isolation',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_pattern',
      swap_group_id_2 = 'hinge_pattern_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["dumbbells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'singleleg_db_romanian_deadlift';

DELETE FROM exercise_catalogue
  WHERE exercise_id = 'singleleg_db_romanian_deadlift_copy';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 20:41:25 UTC
-- Changes: 1-- [1] clone: pushup
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'pushup',
  'Push-Up',
  'compound',
  'push_horizontal',
  1,
  false,
  false,
  2,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['rings']::text[],
  '["rings"]'::jsonb,
  NULL,
  0,
  NULL,
  '["hypertrophy_secondary"]'::jsonb,
  'push_horizontal_pattern',
  'push_horizontal_any',
  '["chest","triceps","shoulders"]'::jsonb,
  '["general_heat","t_spine","shoulders","scap_push"]'::jsonb,
  NULL,
  '(App admin)',
  'upper',
  true
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 20:44:51 UTC
-- Changes: 1-- [1] edit: db_flat_press
UPDATE exercise_catalogue
  SET name = 'Dumbbell Flat Press',
      movement_class = 'compound',
      movement_pattern_primary = 'push_horizontal',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_horizontal_pattern',
      swap_group_id_2 = 'push_horizontal_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells', 'bench']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["dumbbells","bench"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'db_flat_press';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 20:45:05 UTC
-- Changes: 1-- [1] edit: db_incline_press
UPDATE exercise_catalogue
  SET name = 'Dumbbell Incline Press',
      movement_class = 'compound',
      movement_pattern_primary = 'push_horizontal',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_horizontal_pattern',
      swap_group_id_2 = 'push_horizontal_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells', 'bench']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["dumbbells","bench"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'db_incline_press';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 20:45:18 UTC
-- Changes: 1-- [1] edit: feet_elevated_pushup
UPDATE exercise_catalogue
  SET exercise_id = 'feetelevated_pushup',
      name = 'Feet-Elevated Push-Up',
      movement_class = 'compound',
      movement_pattern_primary = 'push_horizontal',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_horizontal_pattern',
      swap_group_id_2 = 'push_horizontal_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'feet_elevated_pushup';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 20:45:51 UTC
-- Changes: 1-- [1] edit: pushup
UPDATE exercise_catalogue
  SET name = 'Push-Up',
      movement_class = 'compound',
      movement_pattern_primary = 'push_horizontal',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_horizontal_pattern',
      swap_group_id_2 = 'push_horizontal_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['rings']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["rings"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'pushup';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 20:46:05 UTC
-- Changes: 1-- [1] edit: ring_pushup
UPDATE exercise_catalogue
  SET name = 'Ring Push-Up',
      movement_class = 'compound',
      movement_pattern_primary = 'push_horizontal',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_horizontal_pattern',
      swap_group_id_2 = 'push_horizontal_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['rings']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["rings"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'ring_pushup';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 20:46:16 UTC
-- Changes: 1-- [1] edit: weighted_pushup
UPDATE exercise_catalogue
  SET name = 'Weighted Push-Up',
      movement_class = 'compound',
      movement_pattern_primary = 'push_horizontal',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_horizontal_pattern',
      swap_group_id_2 = 'push_horizontal_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['bodyweight']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["bodyweight"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'weighted_pushup';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 20:53:34 UTC
-- Changes: 1-- [1] edit: feet_elevated_inverted_row
UPDATE exercise_catalogue
  SET exercise_id = 'feetelevated_inverted_row',
      name = 'Feet-Elevated Inverted Row',
      movement_class = 'compound',
      movement_pattern_primary = 'pull_horizontal',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'pull_horizontal_pattern',
      swap_group_id_2 = 'pull_horizontal_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'feet_elevated_inverted_row';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 20:53:47 UTC
-- Changes: 1-- [1] edit: inverted_row
UPDATE exercise_catalogue
  SET name = 'Inverted Row',
      movement_class = 'compound',
      movement_pattern_primary = 'pull_horizontal',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'pull_horizontal_pattern',
      swap_group_id_2 = 'pull_horizontal_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'inverted_row';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 20:53:56 UTC
-- Changes: 1-- [1] edit: ring_row
UPDATE exercise_catalogue
  SET name = 'Ring Row',
      movement_class = 'compound',
      movement_pattern_primary = 'pull_horizontal',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 3,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = NULL,
      swap_group_id_1 = 'pull_horizontal_pattern',
      swap_group_id_2 = 'pull_horizontal_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['rings']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["rings"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","conditioning_main"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'ring_row';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 20:54:07 UTC
-- Changes: 1-- [1] edit: db_row
UPDATE exercise_catalogue
  SET exercise_id = 'singlearm_db_row',
      name = 'Single-Arm Dumbbell Row',
      movement_class = 'compound',
      movement_pattern_primary = 'pull_horizontal',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'pull_horizontal_pattern',
      swap_group_id_2 = 'pull_horizontal_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["dumbbells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'db_row';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 20:54:15 UTC
-- Changes: 1-- [1] edit: towel_row
UPDATE exercise_catalogue
  SET name = 'Towel Row',
      movement_class = 'compound',
      movement_pattern_primary = 'pull_horizontal',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'pull_horizontal_pattern',
      swap_group_id_2 = 'pull_horizontal_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'towel_row';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 21:03:27 UTC
-- Changes: 1-- [1] edit: barbell_rdl
UPDATE exercise_catalogue
  SET exercise_id = 'bb_romanian_deadlift',
      name = 'Barbell Romanian Deadlift',
      movement_class = 'compound',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 2,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_pattern',
      swap_group_id_2 = 'hinge_pattern_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['barbell']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["barbell"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'barbell_rdl';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 21:10:42 UTC
-- Changes: 1-- [1] clone: closegrip_pushups
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'closegrip_pushups',
  'Close-Grip Push-Ups',
  'compound',
  'push_horizontal',
  1,
  false,
  false,
  2,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  '{}'::text[],
  '[]'::jsonb,
  NULL,
  0,
  NULL,
  '["hypertrophy_secondary"]'::jsonb,
  'push_horizontal_pattern',
  'push_horizontal_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  'upper',
  true
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 21:10:59 UTC
-- Changes: 1-- [1] edit: closegrip_pushups
UPDATE exercise_catalogue
  SET name = 'Close-Grip Push-Ups',
      movement_class = 'compound',
      movement_pattern_primary = 'push_horizontal',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_horizontal_pattern',
      swap_group_id_2 = 'push_horizontal_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'closegrip_pushups';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 21:11:41 UTC
-- Changes: 2-- [1] edit: pushup
UPDATE exercise_catalogue
  SET name = 'Push-Up',
      movement_class = 'compound',
      movement_pattern_primary = 'push_horizontal',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_horizontal_pattern',
      swap_group_id_2 = 'push_horizontal_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'pushup';

-- [2] clone: kneeling_pushup
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'kneeling_pushup',
  'Kneeling Push-Up',
  'compound',
  'push_horizontal',
  1,
  false,
  false,
  2,
  '[]'::jsonb,
  '{}'::text[],
  2,
  false,
  NULL,
  ARRAY['rings']::text[],
  '["rings"]'::jsonb,
  NULL,
  0,
  NULL,
  '["hypertrophy_secondary"]'::jsonb,
  'push_horizontal_pattern',
  'push_horizontal_compound',
  '[]'::jsonb,
  '[]'::jsonb,
  NULL,
  '(App admin)',
  'upper',
  true
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 21:12:13 UTC
-- Changes: 1-- [1] edit: kneeling_pushup
UPDATE exercise_catalogue
  SET name = 'Kneeling Push-Up',
      movement_class = 'compound',
      movement_pattern_primary = 'push_horizontal',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = false,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_horizontal_pattern',
      swap_group_id_2 = 'push_horizontal_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'kneeling_pushup';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 21:26:12 UTC
-- Changes: 1-- [1] clone: nordic_hamstring_curl
INSERT INTO exercise_catalogue (
  exercise_id, name, movement_class, movement_pattern_primary, min_fitness_rank, is_archived, is_loadable, complexity_rank, contraindications_json, contraindications_slugs, density_rating, engine_anchor, engine_role, equipment_items_slugs, equipment_json, form_cues, impact_level, lift_class, preferred_in_json, swap_group_id_1, swap_group_id_2, target_regions_json, warmup_hooks, slug, creator, strength_primary_region, strength_equivalent
) VALUES (
  'nordic_hamstring_curl',
  'Nordic Hamstring Curl',
  'isolation',
  'hinge',
  1,
  false,
  true,
  1,
  '[]'::jsonb,
  '{}'::text[],
  1,
  false,
  NULL,
  ARRAY['leg_curl']::text[],
  '["leg_curl"]'::jsonb,
  NULL,
  0,
  NULL,
  '["hypertrophy_secondary"]'::jsonb,
  'hamstring_iso',
  'hinge_compound',
  '["hamstrings"]'::jsonb,
  '["general_heat","hips","hamstrings","brace","hinge_pattern"]'::jsonb,
  NULL,
  '(App admin)',
  'lower',
  false
)
ON CONFLICT (exercise_id) DO UPDATE SET
  name = EXCLUDED.name,
  movement_class = EXCLUDED.movement_class,
  movement_pattern_primary = EXCLUDED.movement_pattern_primary,
  min_fitness_rank = EXCLUDED.min_fitness_rank,
  is_archived = EXCLUDED.is_archived,
  is_loadable = EXCLUDED.is_loadable,
  complexity_rank = EXCLUDED.complexity_rank,
  contraindications_json = EXCLUDED.contraindications_json,
  contraindications_slugs = EXCLUDED.contraindications_slugs,
  density_rating = EXCLUDED.density_rating,
  engine_anchor = EXCLUDED.engine_anchor,
  engine_role = EXCLUDED.engine_role,
  equipment_items_slugs = EXCLUDED.equipment_items_slugs,
  equipment_json = EXCLUDED.equipment_json,
  form_cues = EXCLUDED.form_cues,
  impact_level = EXCLUDED.impact_level,
  lift_class = EXCLUDED.lift_class,
  preferred_in_json = EXCLUDED.preferred_in_json,
  swap_group_id_1 = EXCLUDED.swap_group_id_1,
  swap_group_id_2 = EXCLUDED.swap_group_id_2,
  target_regions_json = EXCLUDED.target_regions_json,
  warmup_hooks = EXCLUDED.warmup_hooks,
  slug = EXCLUDED.slug,
  creator = EXCLUDED.creator,
  strength_primary_region = EXCLUDED.strength_primary_region,
  strength_equivalent = EXCLUDED.strength_equivalent;


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 21:47:15 UTC
-- Changes: 1-- [1] edit: nordic_hamstring_curl
UPDATE exercise_catalogue
  SET name = 'Nordic Hamstring Curl',
      movement_class = 'isolation',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hamstring_iso',
      swap_group_id_2 = 'hinge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'nordic_hamstring_curl';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 21:48:01 UTC
-- Changes: 1-- [1] edit: ohp
UPDATE exercise_catalogue
  SET exercise_id = 'bb_overhead_press',
      name = 'Barbell Overhead Press',
      movement_class = 'compound',
      movement_pattern_primary = 'push_vertical',
      min_fitness_rank = 2,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_vertical_pattern',
      swap_group_id_2 = 'push_vertical_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['barbell']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["barbell"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'ohp';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 21:48:26 UTC
-- Changes: 1-- [1] edit: machine_shoulder_press
UPDATE exercise_catalogue
  SET name = 'Machine Shoulder Press',
      movement_class = 'compound',
      movement_pattern_primary = 'push_vertical',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_vertical_pattern',
      swap_group_id_2 = 'push_vertical_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['shoulder_press']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["shoulder_press"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'machine_shoulder_press';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 21:48:57 UTC
-- Changes: 1-- [1] edit: push_press
UPDATE exercise_catalogue
  SET exercise_id = 'bb_push_press',
      name = 'Barbell Push Press',
      movement_class = 'compound',
      movement_pattern_primary = 'push_vertical',
      min_fitness_rank = 2,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'upper',
      swap_group_id_1 = 'push_vertical_pattern',
      swap_group_id_2 = 'push_vertical_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['barbell']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["barbell"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'push_press';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-19 21:51:31 UTC
-- Changes: 1-- [1] edit: weighted_walking_lunge
UPDATE exercise_catalogue
  SET exercise_id = 'walking_lunges_weighted',
      name = 'Walking Lunges (Weighted)',
      movement_class = 'isolation',
      movement_pattern_primary = 'lunge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 3,
      engine_role = 'mixed_modal',
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'lunge_pattern',
      swap_group_id_2 = 'lunge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["dumbbells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary","conditioning_main","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'weighted_walking_lunge';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-20 07:41:56 UTC
-- Changes: 1-- [1] edit: barbell_good_morning
UPDATE exercise_catalogue
  SET exercise_id = 'bb_good_morning',
      name = 'Barbell Good Morning',
      movement_class = 'compound',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_barbell',
      swap_group_id_2 = 'hinge_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['barbell']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["barbell"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'barbell_good_morning';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-20 07:42:49 UTC
-- Changes: 1-- [1] edit: barbell_deadlift
UPDATE exercise_catalogue
  SET exercise_id = 'bb_deadlift',
      name = 'Barbell Deadlift',
      movement_class = 'compound',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_barbell',
      swap_group_id_2 = 'hinge_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['barbell']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["barbell"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'barbell_deadlift';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-20 07:43:13 UTC
-- Changes: 1-- [1] edit: bb_romanian_deadlift
UPDATE exercise_catalogue
  SET name = 'Barbell Romanian Deadlift',
      movement_class = 'compound',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_pattern',
      swap_group_id_2 = 'hinge_pattern_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['barbell']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["barbell"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'bb_romanian_deadlift';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-20 07:43:48 UTC
-- Changes: 1-- [1] edit: kb_rdl
UPDATE exercise_catalogue
  SET exercise_id = 'kb_romanian_deadlift',
      name = 'Kettlebell Romanian Deadlift',
      movement_class = 'isolation',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 1,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_pattern',
      swap_group_id_2 = 'hinge_pattern_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['kettlebells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["kettlebells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'kb_rdl';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-20 07:44:16 UTC
-- Changes: 1-- [1] edit: trap_bar_deadlift
UPDATE exercise_catalogue
  SET name = 'Trap Bar Deadlift',
      movement_class = 'compound',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 1,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_trap',
      swap_group_id_2 = 'hinge_compound',
      strength_equivalent = true,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['trap_bar']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["trap_bar"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["strength_main","hypertrophy_secondary","hyrox_power"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'trap_bar_deadlift';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-20 07:45:35 UTC
-- Changes: 1-- [1] edit: singleleg_romanian_deadlift
UPDATE exercise_catalogue
  SET name = 'Single-Leg Romanian Deadlift',
      movement_class = 'isolation',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 1,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_pattern',
      swap_group_id_2 = 'hinge_pattern_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = '{}'::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '[]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'singleleg_romanian_deadlift';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-20 07:45:47 UTC
-- Changes: 1-- [1] edit: single_leg_rdl
UPDATE exercise_catalogue
  SET exercise_id = 'singleleg_romanian_deadlift',
      name = 'Single-Leg Romanian Deadlift',
      movement_class = 'isolation',
      movement_pattern_primary = 'hinge',
      min_fitness_rank = 0,
      is_archived = false,
      is_loadable = true,
      engine_anchor = false,
      complexity_rank = 2,
      density_rating = 2,
      engine_role = NULL,
      lift_class = NULL,
      slug = NULL,
      creator = '(App admin)',
      strength_primary_region = 'lower',
      swap_group_id_1 = 'hinge_pattern',
      swap_group_id_2 = 'hinge_pattern_compound',
      strength_equivalent = false,
      form_cues = NULL,
      equipment_items_slugs = ARRAY['dumbbells', 'kettlebells']::text[],
      contraindications_slugs = '{}'::text[],
      equipment_json = '["dumbbells","kettlebells"]'::jsonb,
      contraindications_json = '[]'::jsonb,
      preferred_in_json = '["hypertrophy_secondary"]'::jsonb,
      target_regions_json = '[]'::jsonb,
      warmup_hooks = '[]'::jsonb,
      updated_at = now()
  WHERE exercise_id = 'single_leg_rdl';


-- ════════════════════════════════════════
-- Exercise Catalogue Admin Changes
-- Generated: 2026-03-20 08:14:59 UTC
-- Changes: 1-- [1] delete: single_leg_rdl
DELETE FROM exercise_catalogue WHERE exercise_id = 'single_leg_rdl';
