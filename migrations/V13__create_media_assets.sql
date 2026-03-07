create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  usage_scope text not null,
  day_type text null,
  focus_type text null,
  label text null,
  sort_order int null,
  is_active boolean not null default true,
  image_key text not null,
  image_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_media_assets_scope_active_sort
  on public.media_assets (usage_scope, is_active, sort_order);

create index if not exists idx_media_assets_day_focus
  on public.media_assets (day_type, focus_type);
