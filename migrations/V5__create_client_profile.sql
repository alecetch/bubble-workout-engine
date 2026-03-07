create table if not exists client_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete cascade,
  bubble_client_profile_id text not null unique,

  display_name text not null default '',

  fitness_level_slug text not null default '',
  fitness_rank int not null default 0 check (fitness_rank >= 0),

  equipment_items_slugs text[] not null default '{}'::text[],
  injury_flags text[] not null default '{}'::text[],
  preferred_days text[] not null default '{}'::text[],
  main_goals_slugs text[] not null default '{}'::text[],

  minutes_per_session int not null default 0 check (minutes_per_session >= 0),
  height_cm int,
  weight_kg numeric,

  body_type_preference_slug text,
  equipment_items_text text,
  equipment_notes text,
  equipment_preset_slug text,
  goal_notes text,
  ok_with_gymless_backup boolean not null default false,
  program_intensity_preference_slug text,
  schedule_constraints text,
  theme_slug text,

  bubble_creation_date timestamptz null,
  bubble_modified_date timestamptz null,
  slug text,
  creator text,
  bubble_user_raw text,

  is_archived boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_client_profile_user_id on client_profile(user_id);
create index if not exists idx_client_profile_user_archived on client_profile(user_id, is_archived);

create index if not exists idx_client_profile_equipment_items_gin on client_profile using gin (equipment_items_slugs);
create index if not exists idx_client_profile_injury_flags_gin on client_profile using gin (injury_flags);
create index if not exists idx_client_profile_preferred_days_gin on client_profile using gin (preferred_days);