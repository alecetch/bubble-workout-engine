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
