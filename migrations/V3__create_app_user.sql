create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  bubble_user_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);