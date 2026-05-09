CREATE TABLE IF NOT EXISTS exercise_load_estimation_family_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_family text NOT NULL,
  target_family text NOT NULL,
  cross_family_factor numeric(5,3) NOT NULL CHECK (cross_family_factor > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_family, target_family)
);

CREATE INDEX IF NOT EXISTS idx_ex_load_family_cfg_source_target
  ON exercise_load_estimation_family_config(source_family, target_family);
