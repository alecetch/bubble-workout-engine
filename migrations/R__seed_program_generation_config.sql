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
    'week_phase_config_json', s.week_phase_config_json
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
