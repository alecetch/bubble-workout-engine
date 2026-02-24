create table if not exists exercise_catalogue (
  exercise_id text primary key,
  name text not null,
  movement_class text not null,
  movement_pattern_primary text not null,
  min_fitness_rank int not null default 0 check (min_fitness_rank >= 0),
  is_archived boolean not null default false,
  is_loadable boolean not null default false,

  complexity_rank int,
  contraindications_json jsonb not null default '[]'::jsonb,
  contraindications_slugs text[] not null default '{}'::text[],
  density_rating int,
  engine_anchor boolean not null default false,
  engine_role text,
  equipment_items_slugs text[] not null default '{}'::text[],
  equipment_json jsonb not null default '[]'::jsonb,
  form_cues text,
  impact_level int,
  lift_class text,
  preferred_in_json jsonb not null default '[]'::jsonb,
  swap_group_id_1 text,
  swap_group_id_2 text,
  target_regions_json jsonb not null default '[]'::jsonb,
  warmup_hooks jsonb not null default '[]'::jsonb,
  bubble_creation_date timestamptz null,
  bubble_modified_date timestamptz null,
  slug text,
  creator text,
  bubble_unique_id text unique,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ex_cat_movement on exercise_catalogue(movement_pattern_primary, movement_class);
create index if not exists idx_ex_cat_rank on exercise_catalogue(min_fitness_rank);
create index if not exists idx_ex_cat_swap1 on exercise_catalogue(swap_group_id_1);
create index if not exists idx_ex_cat_swap2 on exercise_catalogue(swap_group_id_2);

create index if not exists idx_ex_cat_equipment_items_gin on exercise_catalogue using gin (equipment_items_slugs);
create index if not exists idx_ex_cat_contraindications_gin on exercise_catalogue using gin (contraindications_slugs);