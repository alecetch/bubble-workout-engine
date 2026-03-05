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

-- Program-level hero for hypertrophy
-- day_type stores the program_type slug; focus_type is NULL for program-level rows
INSERT INTO public.media_assets (
  usage_scope, day_type, focus_type, label, sort_order, is_active, image_key, image_url
)
SELECT
  'program', 'hypertrophy', NULL,
  'Hypertrophy Program', 10, true,
  'program/hypertrophy.png', ''
WHERE NOT EXISTS (
  SELECT 1 FROM public.media_assets
  WHERE usage_scope = 'program'
    AND day_type = 'hypertrophy'
    AND image_key = 'program/hypertrophy.png'
);

-- Day-level hero: hypertrophy + lower_body focus
INSERT INTO public.media_assets (
  usage_scope, day_type, focus_type, label, sort_order, is_active, image_key, image_url
)
SELECT
  'program_day', 'hypertrophy', 'lower_body',
  'Hypertrophy Lower Body', 11, true,
  'program_day/hypertrophy_lower_body.png', ''
WHERE NOT EXISTS (
  SELECT 1 FROM public.media_assets
  WHERE usage_scope = 'program_day'
    AND day_type = 'hypertrophy'
    AND focus_type = 'lower_body'
);

-- Day-level hero: hypertrophy + full_body focus (fallback for ambiguous days)
INSERT INTO public.media_assets (
  usage_scope, day_type, focus_type, label, sort_order, is_active, image_key, image_url
)
SELECT
  'program_day', 'hypertrophy', 'full_body',
  'Hypertrophy Full Body', 12, true,
  'program_day/hypertrophy_full_body.png', ''
WHERE NOT EXISTS (
  SELECT 1 FROM public.media_assets
  WHERE usage_scope = 'program_day'
    AND day_type = 'hypertrophy'
    AND focus_type = 'full_body'
);

