-- Add exercise-level coaching content to persisted program_exercise rows.
-- Populated at generation time from exercise_catalogue via the backfill step.

alter table program_exercise
  add column if not exists coaching_cues_json jsonb not null default '[]'::jsonb,
  add column if not exists load_hint text not null default '',
  add column if not exists log_prompt text not null default '';
