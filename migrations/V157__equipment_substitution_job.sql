CREATE TABLE equipment_substitution_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES program(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running','complete','partial','failed')),
  swapped_count int NOT NULL DEFAULT 0,
  warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX equipment_substitution_job_program_idx ON equipment_substitution_job (program_id, created_at DESC);
