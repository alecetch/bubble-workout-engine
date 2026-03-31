-- Seed: hypertrophy rep rules (program_type = 'hypertrophy')
-- Source: CatalogBuild rep_rules_json (hypertrophy program type)
-- Idempotent: each row guarded by WHERE NOT EXISTS on rule_id (unique constraint)
-- Pattern: add new program_type blocks below as they are introduced.
-- Verification:
-- docker compose exec db psql -U app -d app -c "select rule_id, purpose, segment_type, movement_pattern, rep_low, rep_high, rest_after_set_sec from public.program_rep_rule order by priority desc, rule_id;"

-- ── Global fallback (matches any exercise in hypertrophy program) ────────────
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_global_fallback_v1', true, 'hypertrophy', 1, 1,
  NULL, NULL, NULL, NULL,
  8, 12, 2,
  2, 0, 2, 0,
  75
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_global_fallback_v1'
);

-- ── Main / single defaults ──────────────────────────────────────────────────
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_main_default_v1', true, 'hypertrophy', 1, 5,
  'main', 'single', NULL, NULL,
  6, 10, 2,
  2, 0, 2, 0,
  90
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_main_default_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_main_squat_v1', true, 'hypertrophy', 1, 10,
  'main', 'single', 'squat', 'squat_compound',
  6, 10, 2,
  3, 0, 1, 0,
  120
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_main_squat_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_main_hinge_v1', true, 'hypertrophy', 1, 10,
  'main', 'single', 'hinge', 'hinge_compound',
  5, 8, 2,
  2, 0, 1, 0,
  120
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_main_hinge_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_main_push_horizontal_v1', true, 'hypertrophy', 1, 10,
  'main', 'single', 'push_horizontal', NULL,
  6, 10, 2,
  2, 0, 2, 0,
  90
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_main_push_horizontal_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_superset_main_v1', true, 'hypertrophy', 1, 6,
  'main', 'superset', NULL, NULL,
  6, 10, 2,
  2, 0, 2, 0,
  75
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_superset_main_v1'
);

-- ── Secondary / single defaults ─────────────────────────────────────────────
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_secondary_default_v1', true, 'hypertrophy', 1, 5,
  'secondary', 'single', NULL, NULL,
  8, 12, 2,
  2, 0, 2, 0,
  75
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_secondary_default_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_secondary_pull_horizontal_v1', true, 'hypertrophy', 1, 8,
  'secondary', 'single', 'pull_horizontal', NULL,
  8, 12, 2,
  2, 0, 2, 0,
  75
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_secondary_pull_horizontal_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_secondary_lunge_v1', true, 'hypertrophy', 1, 8,
  'secondary', 'single', 'lunge', NULL,
  8, 12, 2,
  2, 0, 2, 0,
  75
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_secondary_lunge_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_push_vertical_secondary_v1', true, 'hypertrophy', 1, 8,
  'secondary', 'single', 'push_vertical', NULL,
  8, 12, 2,
  2, 0, 2, 0,
  75
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_push_vertical_secondary_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_pull_vertical_secondary_v1', true, 'hypertrophy', 1, 8,
  'secondary', 'single', 'pull_vertical', NULL,
  8, 12, 2,
  2, 0, 2, 0,
  75
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_pull_vertical_secondary_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_superset_secondary_v1', true, 'hypertrophy', 1, 7,
  'secondary', 'superset', NULL, NULL,
  8, 12, 2,
  2, 0, 2, 0,
  60
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_superset_secondary_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_giant_secondary_v1', true, 'hypertrophy', 1, 6,
  'secondary', 'giant_set', NULL, NULL,
  8, 12, 2,
  2, 0, 2, 0,
  60
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_giant_secondary_v1'
);

-- ── Accessory defaults ───────────────────────────────────────────────────────
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_accessory_default_v1', true, 'hypertrophy', 1, 5,
  'accessory', 'single', NULL, NULL,
  10, 15, 2,
  2, 0, 2, 0,
  60
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_accessory_default_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_accessory_arms_v1', true, 'hypertrophy', 1, 9,
  'accessory', 'single', 'arms', NULL,
  10, 15, 2,
  2, 0, 2, 0,
  60
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_accessory_arms_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_accessory_calves_v1', true, 'hypertrophy', 1, 9,
  'accessory', 'single', 'calves', NULL,
  12, 20, 1,
  2, 1, 2, 1,
  45
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_accessory_calves_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_isolation_general_v1', true, 'hypertrophy', 1, 4,
  'accessory', 'single', 'isolation', NULL,
  12, 15, 2,
  2, 0, 2, 0,
  60
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_isolation_general_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'hyp_giant_accessory_v1', true, 'hypertrophy', 1, 7,
  'accessory', 'giant_set', NULL, NULL,
  10, 15, 2,
  2, 0, 2, 0,
  60
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyp_giant_accessory_v1'
);

-- ── Strength defaults (program_type = 'strength') ───────────────────────────
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'str_main_single_v1', true, 'strength', 1, 10,
  'main', 'single', NULL, NULL,
  3, 5, 2,
  2, 0, 1, 0,
  180
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'str_main_single_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'str_secondary_single_v1', true, 'strength', 1, 9,
  'secondary', 'single', NULL, NULL,
  4, 6, 2,
  2, 0, 1, 0,
  150
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'str_secondary_single_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'str_accessory_single_v1', true, 'strength', 1, 8,
  'accessory', 'single', NULL, NULL,
  8, 12, 3,
  2, 0, 2, 0,
  90
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'str_accessory_single_v1'
);

-- ── Conditioning defaults (program_type = 'conditioning') ────────────────────
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'cond_main_single_v1', true, 'conditioning', 1, 10,
  'main', 'single', NULL, NULL,
  1, 1, 0,
  0, 0, 0, 0,
  60
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_main_single_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'cond_secondary_single_v1', true, 'conditioning', 1, 9,
  'secondary', 'single', NULL, NULL,
  1, 1, 0,
  0, 0, 0, 0,
  60
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_secondary_single_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  purpose, segment_type, movement_pattern, swap_group_id_2,
  rep_low, rep_high, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec
)
SELECT
  'cond_accessory_single_v1', true, 'conditioning', 1, 8,
  'accessory', 'single', NULL, NULL,
  10, 15, 2,
  2, 0, 2, 0,
  60
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_accessory_single_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'cond_global_fallback_v1', true, 'conditioning', 1, 1,
  NULL, NULL, NULL, NULL, NULL, NULL,
  10, 15, 'reps',
  NULL, NULL, NULL,
  NULL, NULL, NULL, NULL,
  60, NULL,
  NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_global_fallback_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'cond_main_engine_sustained_v1', true, 'conditioning', 1, 12,
  NULL, 'main', 'single', 'cyclical_engine', NULL, NULL,
  600, NULL, 'seconds',
  NULL, NULL, NULL,
  NULL, NULL, NULL, NULL,
  0, NULL,
  NULL, 'time_based'
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_main_engine_sustained_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'cond_main_locomotion_v1', true, 'conditioning', 1, 12,
  NULL, 'main', 'single', 'locomotion', NULL, NULL,
  6, 10, 'reps',
  NULL, NULL, 0,
  NULL, NULL, NULL, NULL,
  90, NULL,
  NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_main_locomotion_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'cond_main_hinge_ballistic_v1', true, 'conditioning', 1, 12,
  NULL, 'main', 'single', 'hinge', NULL, NULL,
  10, 15, 'reps',
  NULL, NULL, 1,
  NULL, NULL, NULL, NULL,
  75, NULL,
  NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_main_hinge_ballistic_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'cond_carry_v1', true, 'conditioning', 1, 11,
  NULL, NULL, NULL, 'carry', NULL, NULL,
  20, 40, 'seconds',
  NULL, NULL, NULL,
  NULL, NULL, NULL, NULL,
  45, NULL,
  NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_carry_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'cond_secondary_superset_v1', true, 'conditioning', 1, 10,
  NULL, 'secondary', 'superset', NULL, NULL, NULL,
  8, 12, 'reps',
  NULL, NULL, 1,
  NULL, NULL, NULL, NULL,
  0, 60,
  NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_secondary_superset_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'cond_accessory_giant_set_v1', true, 'conditioning', 1, 10,
  NULL, 'accessory', 'giant_set', NULL, NULL, NULL,
  10, 15, 'reps',
  NULL, NULL, 0,
  NULL, NULL, NULL, NULL,
  0, 45,
  NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_accessory_giant_set_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'cond_accessory_core_v1', true, 'conditioning', 1, 10,
  NULL, 'accessory', 'single', 'anti_extension', NULL, NULL,
  20, 30, 'seconds',
  NULL, NULL, NULL,
  NULL, NULL, NULL, NULL,
  30, NULL,
  NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_accessory_core_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'cond_finisher_single_v1', true, 'conditioning', 1, 9,
  NULL, 'accessory', 'single', 'locomotion', NULL, NULL,
  10, 20, 'reps',
  NULL, NULL, 0,
  NULL, NULL, NULL, NULL,
  30, NULL,
  NULL, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_finisher_single_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'cond_main_amrap_v1', true, 'conditioning', 1, 15,
  NULL, 'main', 'amrap', NULL, NULL, NULL,
  5, 8, 'reps',
  NULL, NULL, NULL,
  NULL, NULL, NULL, NULL,
  0, 0,
  NULL, 'rounds_based'
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_main_amrap_v1'
);

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'cond_secondary_emom_v1', true, 'conditioning', 1, 15,
  NULL, 'secondary', 'emom', NULL, NULL, NULL,
  5, 8, 'reps',
  NULL, NULL, NULL,
  NULL, NULL, NULL, NULL,
  0, 0,
  NULL, 'emom_based'
WHERE NOT EXISTS (
  SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'cond_secondary_emom_v1'
);

-- Hyrox rep rules
-- AMRAP item rules: no rest, no tempo, no RIR - pure distance or rep prescriptions.
-- Single (power) rules: tempo + rest + RIR for strength quality.

-- Global fallback (matches any hyrox exercise not matched by a specific rule)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_global_fallback', true, 'hyrox', 1, 1,
  NULL, NULL, NULL, NULL, NULL, NULL,
  10, 15, 'reps',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_global_fallback');

-- Run buy-in (adjusted to use equipment_slug=treadmill so it does not collide with burpee broad jump)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_run_buy_in', true, 'hyrox', 1, 50,
  NULL, NULL, 'amrap', 'locomotion', 'locomotion_compound', 'treadmill',
  400, 400, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_run_buy_in');
-- Deactivated: shadowed by hyrx_amrap_run_any_v2 (sw2=run_interval, priority 55) which is more principled.
UPDATE public.program_rep_rule
SET is_active = false, updated_at = now()
WHERE rule_id = 'hyrx_amrap_run_buy_in' AND is_active = true;

-- Run buy-in: any run exercise (no equipment constraint) — catches outdoor run, treadmill, etc.
-- Matches on sw2=run_interval (the dedicated run/row/ski family group).
-- Priority 55: above locomotion generic (30) and treadmill-specific rule (50).
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_run_any_v2', true, 'hyrox', 1, 55,
  NULL, NULL, 'amrap', 'locomotion', 'run_interval', NULL,
  400, 400, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_run_any_v2');

-- Wallball station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_wallball', true, 'hyrox', 1, 50,
  NULL, NULL, 'amrap', 'push_ballistic', 'push_ballistic_compound', NULL,
  15, 20, 'reps',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_wallball');

-- Ski erg station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_ski_erg', true, 'hyrox', 1, 55,
  NULL, NULL, 'amrap', 'cyclical_engine', 'cyclical_compound', 'ski_erg',
  250, 300, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_ski_erg');
-- Deactivated: shadowed by hyrx_amrap_ski_erg_v2 (sw2=ski_interval, priority 60).
-- v1 matches sw2=cyclical_compound which is too broad and can misprescribe non-ski-erg exercises.
UPDATE public.program_rep_rule
SET is_active = false, updated_at = now()
WHERE rule_id = 'hyrx_amrap_ski_erg' AND is_active = true;

-- Ski erg: matches new sw2=ski_interval group (replaces cyclical_compound constraint above)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_ski_erg_v2', true, 'hyrox', 1, 60,
  NULL, NULL, 'amrap', 'cyclical_engine', 'ski_interval', 'ski_erg',
  250, 300, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_ski_erg_v2');

-- Row erg station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_row_erg', true, 'hyrox', 1, 55,
  NULL, NULL, 'amrap', 'cyclical_engine', 'cyclical_compound', 'row_erg',
  250, 300, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_row_erg');
-- Deactivated: shadowed by hyrx_amrap_row_erg_v2 (sw2=row_interval, priority 60).
UPDATE public.program_rep_rule
SET is_active = false, updated_at = now()
WHERE rule_id = 'hyrx_amrap_row_erg' AND is_active = true;

-- Row erg: matches new sw2=row_interval group (replaces cyclical_compound constraint above)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_row_erg_v2', true, 'hyrox', 1, 60,
  NULL, NULL, 'amrap', 'cyclical_engine', 'row_interval', 'row_erg',
  250, 300, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_row_erg_v2');

-- Sled push station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_sled_push', true, 'hyrox', 1, 55,
  NULL, NULL, 'amrap', 'sled_push', 'sled_compound', NULL,
  20, 20, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_sled_push');

-- Sled pull station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_sled_pull', true, 'hyrox', 1, 55,
  NULL, NULL, 'amrap', 'sled_pull', 'sled_compound', NULL,
  20, 20, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_sled_pull');

-- Farmer carry station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_farmer_carry', true, 'hyrox', 1, 55,
  NULL, NULL, 'amrap', 'carry', 'carry_compound', NULL,
  50, 50, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_farmer_carry');

-- Sandbag lunge station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_sandbag_lunge', true, 'hyrox', 1, 55,
  NULL, NULL, 'amrap', 'lunge', 'lunge_compound', NULL,
  20, 24, 'reps',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_sandbag_lunge');

-- Burpee broad jump station
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_burpee', true, 'hyrox', 1, 50,
  NULL, NULL, 'amrap', 'locomotion', 'locomotion_compound', NULL,
  8, 10, 'reps',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_burpee');

-- Generic carry fallback (any carry not matched above)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_carry_generic', true, 'hyrox', 1, 30,
  NULL, NULL, 'amrap', 'carry', NULL, NULL,
  40, 50, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_carry_generic');

-- Generic cyclical engine fallback
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_cyclical_generic', true, 'hyrox', 1, 30,
  NULL, NULL, 'amrap', 'cyclical_engine', NULL, NULL,
  200, 300, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_cyclical_generic');

-- Generic locomotion fallback
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_amrap_locomotion_generic', true, 'hyrox', 1, 30,
  NULL, NULL, 'amrap', 'locomotion', NULL, NULL,
  300, 400, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_amrap_locomotion_generic');

-- Power day - strength main (squat, purpose=main, segment=single)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_power_main_squat', true, 'hyrox', 1, 80,
  NULL, 'main', 'single', 'squat', 'squat_compound', NULL,
  3, 5, 'reps',
  1, 3, 2,
  3, 0, 1, 0,
  180, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_power_main_squat');

-- Power day - strength main (hinge, purpose=main, segment=single)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_power_main_hinge', true, 'hyrox', 1, 80,
  NULL, 'main', 'single', 'hinge', 'hinge_compound', NULL,
  3, 5, 'reps',
  1, 3, 2,
  3, 1, 1, 0,
  180, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_power_main_hinge');

-- Power day - pull strength
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_power_pull', true, 'hyrox', 1, 70,
  NULL, 'main', 'single', 'pull_horizontal', 'pull_horizontal_compound', NULL,
  5, 8, 'reps',
  1, 3, 2,
  2, 0, 1, 0,
  120, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_power_pull');

-- Power day - push vertical
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_power_push_vertical', true, 'hyrox', 1, 60,
  NULL, NULL, 'single', 'push_vertical', NULL, NULL,
  5, 8, 'reps',
  1, 3, 2,
  2, 0, 1, 0,
  90, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_power_push_vertical');

-- Single segment fallback (power day any single not matched above)
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_power_single_fallback', true, 'hyrox', 1, 10,
  NULL, NULL, 'single', NULL, NULL, NULL,
  6, 10, 'reps',
  1, 3, 2,
  2, 0, 1, 0,
  90, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_power_single_fallback');

-- ── HYROX simulation-day rules (day_type = 'simulation') ────────────────────────────────────────
-- These rules fire only when day.day_type = 'simulation' (ordered simulation days).
-- They prescribe full race / simulation distances rather than scaled training volumes.
-- Priority 100 ensures they beat all base HYROX rules (max base priority is ~80).
-- Prescription values are intentional defaults — edit via the Rep Rules admin UI after seeding.

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_sim_run', true, 'hyrox', 1, 100,
  'simulation', NULL, 'amrap', 'locomotion', 'run_interval', NULL,
  1000, 1000, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_sim_run');

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_sim_ski_erg', true, 'hyrox', 1, 100,
  'simulation', NULL, 'amrap', 'cyclical_engine', 'ski_interval', 'ski_erg',
  1000, 1000, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_sim_ski_erg');

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_sim_row_erg', true, 'hyrox', 1, 100,
  'simulation', NULL, 'amrap', 'cyclical_engine', 'row_interval', 'row_erg',
  1000, 1000, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_sim_row_erg');

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_sim_sled_push', true, 'hyrox', 1, 100,
  'simulation', NULL, 'amrap', 'sled_push', 'sled_compound', NULL,
  25, 25, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_sim_sled_push');

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_sim_sled_pull', true, 'hyrox', 1, 100,
  'simulation', NULL, 'amrap', 'sled_pull', 'sled_compound', NULL,
  25, 25, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_sim_sled_pull');

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_sim_farmer_carry', true, 'hyrox', 1, 100,
  'simulation', NULL, 'amrap', 'carry', 'carry_compound', NULL,
  80, 80, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_sim_farmer_carry');

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_sim_sandbag_lunge', true, 'hyrox', 1, 100,
  'simulation', NULL, 'amrap', NULL, NULL, 'sandbag',
  100, 100, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_sim_sandbag_lunge');

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_sim_wallball', true, 'hyrox', 1, 100,
  'simulation', NULL, 'amrap', 'push_ballistic', 'push_ballistic_compound', NULL,
  100, 100, 'reps',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_sim_wallball');

INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_sim_burpee', true, 'hyrox', 1, 100,
  'simulation', NULL, 'amrap', 'locomotion', NULL, NULL,
  80, 80, 'm',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_sim_burpee');

-- Simulation global fallback: catches any simulation-day exercise not matched by a specific rule above.
-- Priority 1 (lowest) so it only fires when nothing else matches.
INSERT INTO public.program_rep_rule (
  rule_id, is_active, program_type, schema_version, priority,
  day_type, purpose, segment_type, movement_pattern, swap_group_id_2, equipment_slug,
  rep_low, rep_high, reps_unit,
  rir_min, rir_max, rir_target,
  tempo_eccentric, tempo_pause_bottom, tempo_concentric, tempo_pause_top,
  rest_after_set_sec, rest_after_round_sec,
  logging_prompt_mode, notes_style
)
SELECT
  'hyrx_sim_global_fallback', true, 'hyrox', 1, 1,
  'simulation', NULL, NULL, NULL, NULL, NULL,
  10, 15, 'reps',
  0, 0, 0,
  0, 0, 0, 0,
  0, 0,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM public.program_rep_rule WHERE rule_id = 'hyrx_sim_global_fallback');
