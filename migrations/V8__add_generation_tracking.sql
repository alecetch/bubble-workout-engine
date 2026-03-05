-- V8: program-first generation support
-- Adds is_ready flag to program and a generation_run lifecycle table.

ALTER TABLE program
  ADD COLUMN IF NOT EXISTS is_ready boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS generation_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES program(id) ON DELETE CASCADE,

  -- lifecycle
  status text NOT NULL DEFAULT 'started',   -- started | pipeline | importing | complete | failed
  last_stage text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  failed_at timestamptz NULL,
  error_message text NULL,

  -- inputs snapshot
  program_type text NOT NULL DEFAULT 'hypertrophy',
  days_per_week int NULL,
  anchor_date_ms bigint NULL,
  prompt_version text NOT NULL DEFAULT '1.0',
  allowed_exercise_count int NULL,

  -- outputs
  total_days_expected int NULL,
  emitter_rows_count int NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_run_program
  ON generation_run(program_id, created_at DESC);
