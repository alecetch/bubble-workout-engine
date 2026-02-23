-- Program schema migration (Postgres 14+)
-- Source: docs/program-db-spec.md

create extension if not exists pgcrypto;

create table if not exists program (
  id uuid primary key default gen_random_uuid(),

  -- ownership
  user_id uuid not null,
  client_profile_id uuid null,

  -- core metadata (from PRG row)
  program_title text not null,
  program_summary text not null,
  weeks_count int not null check (weeks_count >= 1),
  days_per_week int not null check (days_per_week >= 1 and days_per_week <= 7),

  -- outline JSON (full program json from step5 output)
  program_outline_json jsonb not null,

  -- scheduling
  start_date date not null,
  start_offset_days int not null default 0,
  start_weekday text not null,
  preferred_days_sorted_json jsonb not null,

  -- lifecycle
  status text not null default 'active',
  revision int not null default 1,
  parent_program_id uuid null references program(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_program_user on program(user_id, created_at desc);
create index if not exists idx_program_client_profile on program(client_profile_id, created_at desc);

create table if not exists program_week (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references program(id) on delete cascade,

  week_number int not null check (week_number >= 1),
  focus text not null default '',
  notes text not null default '',

  -- optional (from program.narration.weeks)
  phase text null,
  phase_label text null,
  title text null,

  created_at timestamptz not null default now(),

  unique(program_id, week_number)
);

create index if not exists idx_program_week_program on program_week(program_id, week_number);

create table if not exists program_day (
  id uuid primary key default gen_random_uuid(),

  program_id uuid not null references program(id) on delete cascade,
  program_week_id uuid not null references program_week(id) on delete cascade,

  -- from DAY row
  week_number int not null check (week_number >= 1),
  day_number int not null check (day_number >= 1 and day_number <= 7),
  global_day_index int not null check (global_day_index >= 1),

  program_day_key text not null,

  day_label text not null default '',
  day_type text not null default 'hypertrophy',
  session_duration_mins int not null check (session_duration_mins >= 0),

  day_format_text text not null default '',
  block_format_main_text text not null default '',
  block_format_secondary_text text not null default '',
  block_format_finisher_text text not null default '',

  -- scheduling
  scheduled_offset_days int not null default 0,
  scheduled_weekday text not null default '',
  scheduled_date date not null,

  -- generation state (mirrors Bubble flags)
  day_inputs_status text not null default 'not_started',
  day_inputs_ready boolean not null default false,
  build_status text not null default 'not_started',
  generation_error text null,
  day_generation_call_log jsonb null,

  -- activity state
  has_activity boolean not null default false,
  is_completed boolean not null default false,

  -- media hooks
  hero_media_id uuid null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(program_id, program_day_key),
  unique(program_id, week_number, day_number)
);

create index if not exists idx_program_day_program_date on program_day(program_id, scheduled_date);
create index if not exists idx_program_day_program_week on program_day(program_id, week_number, day_number);
create index if not exists idx_program_day_key on program_day(program_day_key);

create table if not exists program_calendar_day (
  id uuid primary key default gen_random_uuid(),

  program_id uuid not null references program(id) on delete cascade,
  program_week_id uuid not null references program_week(id) on delete cascade,
  program_day_id uuid not null references program_day(id) on delete cascade,

  week_number int not null,
  scheduled_offset_days int not null,
  scheduled_weekday text not null,
  scheduled_date date not null,
  global_day_index int not null,

  is_training_day boolean not null default true,
  program_day_key text not null,

  created_at timestamptz not null default now(),

  unique(program_id, scheduled_date),
  unique(program_id, program_day_key)
);

create index if not exists idx_calendar_program_date on program_calendar_day(program_id, scheduled_date);

create table if not exists workout_segment (
  id uuid primary key default gen_random_uuid(),

  program_id uuid not null references program(id) on delete cascade,
  program_day_id uuid not null references program_day(id) on delete cascade,

  program_day_key text not null,

  segment_key text not null,
  block_key text not null,
  block_order int not null check (block_order >= 1),
  segment_order_in_block int not null check (segment_order_in_block >= 1),

  segment_type text not null,
  purpose text not null,
  purpose_label text not null default '',

  segment_title text not null default '',
  segment_notes text not null default '',

  rounds int not null default 1 check (rounds >= 1),

  score_type text not null default 'none',
  primary_score_label text not null default '',
  secondary_score_label text not null default '',

  segment_scheme_json jsonb not null default '{}'::jsonb,

  segment_duration_seconds int not null default 0 check (segment_duration_seconds >= 0),
  segment_duration_mmss text not null default '',

  created_at timestamptz not null default now(),

  unique(program_day_id, segment_key),
  unique(program_day_id, block_order, segment_order_in_block)
);

create index if not exists idx_segment_day on workout_segment(program_day_id, block_order, segment_order_in_block);
create index if not exists idx_segment_day_key on workout_segment(program_day_key);

create table if not exists program_exercise (
  id uuid primary key default gen_random_uuid(),

  program_id uuid not null references program(id) on delete cascade,
  program_day_id uuid not null references program_day(id) on delete cascade,
  workout_segment_id uuid null references workout_segment(id) on delete set null,

  program_day_key text not null,

  segment_key text not null,
  segment_type text not null,

  exercise_id text not null,
  exercise_name text not null default '',
  is_loadable boolean not null default false,

  equipment_items_slugs_csv text not null default '',

  -- ordering
  order_in_day int not null check (order_in_day >= 1),
  block_order int not null check (block_order >= 1),
  order_in_block int not null check (order_in_block >= 1),

  purpose text not null,
  purpose_label text not null default '',

  -- prescription
  sets_prescribed int not null default 0 check (sets_prescribed >= 0),
  reps_prescribed text not null default '',
  reps_unit text not null default 'reps',
  intensity_prescription text not null default '',
  tempo text not null default '',
  rest_seconds int not null default 0 check (rest_seconds >= 0),

  notes text not null default '',

  created_at timestamptz not null default now(),

  unique(program_day_id, order_in_day),
  unique(program_day_id, segment_key, order_in_block, exercise_id)
);

create index if not exists idx_ex_day on program_exercise(program_day_id, order_in_day);
create index if not exists idx_ex_segment on program_exercise(program_day_id, segment_key, order_in_block);
create index if not exists idx_ex_exercise_id on program_exercise(exercise_id);

-- Optional: logging moved to Postgres
create table if not exists segment_exercise_log (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null,
  program_id uuid not null references program(id) on delete cascade,
  program_day_id uuid not null references program_day(id) on delete cascade,
  workout_segment_id uuid null references workout_segment(id) on delete set null,
  program_exercise_id uuid null references program_exercise(id) on delete set null,

  -- ordering from UI
  order_index int not null default 1 check (order_index >= 1),

  is_draft boolean not null default true,

  -- captured performance
  weight_kg numeric(6,2) null,
  reps_completed int null,
  rir_actual numeric(3,1) null,
  notes text null,

  -- raw log payload (optional)
  segment_log jsonb null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_log_day on segment_exercise_log(user_id, program_day_id);
create index if not exists idx_log_ex on segment_exercise_log(user_id, program_exercise_id);