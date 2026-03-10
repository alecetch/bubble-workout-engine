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
