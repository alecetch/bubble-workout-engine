-- Seed: initial media assets mapped from current Bubble MediaAssets
-- Verification:
-- docker compose exec db psql -U app -d app -c "select usage_scope, day_type, focus_type, image_key from public.media_assets;"

insert into public.media_assets (
  usage_scope,
  day_type,
  focus_type,
  label,
  sort_order,
  is_active,
  image_key,
  image_url
)
select
  'program_day',
  'mixed',
  'full_body',
  'Mixed Full Body',
  1,
  true,
  'program_day/mixed_full_body.png',
  ''
where not exists (
  select 1
  from public.media_assets
  where usage_scope = 'program_day'
    and day_type = 'mixed'
    and focus_type = 'full_body'
    and image_key = 'program_day/mixed_full_body.png'
);

insert into public.media_assets (
  usage_scope,
  day_type,
  focus_type,
  label,
  sort_order,
  is_active,
  image_key,
  image_url
)
select
  'program_day',
  'recovery',
  'recovery',
  'Recovery',
  2,
  true,
  'program_day/recovery_recovery.png',
  ''
where not exists (
  select 1
  from public.media_assets
  where usage_scope = 'program_day'
    and day_type = 'recovery'
    and focus_type = 'recovery'
    and image_key = 'program_day/recovery_recovery.png'
);

insert into public.media_assets (
  usage_scope,
  day_type,
  focus_type,
  label,
  sort_order,
  is_active,
  image_key,
  image_url
)
select
  'program_day',
  'conditioning',
  'conditioning',
  'Conditioning',
  3,
  true,
  'program_day/conditioning_conditioning.png',
  ''
where not exists (
  select 1
  from public.media_assets
  where usage_scope = 'program_day'
    and day_type = 'conditioning'
    and focus_type = 'conditioning'
    and image_key = 'program_day/conditioning_conditioning.png'
);

insert into public.media_assets (
  usage_scope,
  day_type,
  focus_type,
  label,
  sort_order,
  is_active,
  image_key,
  image_url
)
select
  'program',
  'mixed',
  'full_body',
  'Program Mixed Full Body',
  4,
  true,
  'program/mixed_full_body.png',
  ''
where not exists (
  select 1
  from public.media_assets
  where usage_scope = 'program'
    and day_type = 'mixed'
    and focus_type = 'full_body'
    and image_key = 'program/mixed_full_body.png'
);

insert into public.media_assets (
  usage_scope,
  day_type,
  focus_type,
  label,
  sort_order,
  is_active,
  image_key,
  image_url
)
select
  'program_day',
  'skills',
  'lower_body',
  'Skills Lower Body',
  5,
  true,
  'program_day/skills_lower_body.png',
  ''
where not exists (
  select 1
  from public.media_assets
  where usage_scope = 'program_day'
    and day_type = 'skills'
    and focus_type = 'lower_body'
    and image_key = 'program_day/skills_lower_body.png'
);

insert into public.media_assets (
  usage_scope,
  day_type,
  focus_type,
  label,
  sort_order,
  is_active,
  image_key,
  image_url
)
select
  'program_day',
  'hypertrophy',
  'upper_body',
  'Hypertrophy Upper Body',
  6,
  true,
  'program_day/hypertrophy_upper_body.png',
  ''
where not exists (
  select 1
  from public.media_assets
  where usage_scope = 'program_day'
    and day_type = 'hypertrophy'
    and focus_type = 'upper_body'
    and image_key = 'program_day/hypertrophy_upper_body.png'
);

