-- Replace unused form_cues with structured coaching cues and add stable exercise-owned guidance fields.

alter table exercise_catalogue drop column if exists form_cues;

alter table exercise_catalogue
  add column if not exists coaching_cues_json jsonb not null default '[]'::jsonb,
  add column if not exists load_guidance text null,
  add column if not exists logging_guidance text null;
