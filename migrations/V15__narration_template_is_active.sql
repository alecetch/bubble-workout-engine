alter table public.narration_template
  add column if not exists is_active boolean;

update public.narration_template
set is_active = true
where is_active is null;

alter table public.narration_template
  alter column is_active set default true;

alter table public.narration_template
  alter column is_active set not null;

create index if not exists idx_narration_template_active_priority
  on public.narration_template (is_active, priority, template_id);
