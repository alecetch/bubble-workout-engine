create table if not exists public.program_generation_config (
  id uuid primary key default gen_random_uuid(),
  config_key text not null,
  is_active boolean not null default true,
  notes text null,
  program_generation_config_json jsonb null,
  program_type text not null,
  progression_by_rank_json jsonb null,
  schema_version int null,
  total_weeks_default int null,
  week_phase_config_json jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (config_key)
);

create index if not exists idx_program_generation_config_active
  on public.program_generation_config (program_type, is_active, schema_version);

create table if not exists public.program_rep_rule (
  id uuid primary key default gen_random_uuid(),
  day_type text null,
  equipment_slug text null,
  is_active boolean not null default true,
  logging_prompt_mode text null,
  movement_pattern text null,
  notes_style text null,
  priority int null,
  program_type text not null,
  purpose text null,
  rep_high int null,
  rep_low int null,
  reps_unit text null,
  rest_after_round_sec int null,
  rest_after_set_sec int null,
  rir_max int null,
  rir_min int null,
  rir_target int null,
  rule_id text not null,
  schema_version int null,
  segment_type text null,
  swap_group_id_2 text null,
  tempo_concentric int null,
  tempo_eccentric int null,
  tempo_pause_bottom int null,
  tempo_pause_top int null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rule_id)
);

create index if not exists idx_program_rep_rule_lookup
  on public.program_rep_rule (program_type, is_active, purpose, segment_type, movement_pattern, priority);

create table if not exists public.narration_template (
  id uuid primary key default gen_random_uuid(),
  applies_json jsonb null,
  field text not null,
  priority int null,
  purpose text null,
  scope text not null,
  segment_type text null,
  template_id text not null,
  text_pool_json jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id)
);

create index if not exists idx_narration_template_lookup
  on public.narration_template (scope, field, purpose, segment_type, priority);
