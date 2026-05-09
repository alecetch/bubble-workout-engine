CREATE TABLE IF NOT EXISTS exercise_estimation_family_rank_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimation_family TEXT NOT NULL UNIQUE,
  rank_default_loads_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_unit TEXT NOT NULL DEFAULT 'kg',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO exercise_estimation_family_rank_defaults
  (estimation_family, rank_default_loads_json, default_unit)
VALUES
  ('squat', '{"beginner": 40, "intermediate": 80, "advanced": 110, "elite": 140}'::jsonb, 'kg'),
  ('hinge', '{"beginner": 50, "intermediate": 90, "advanced": 120, "elite": 160}'::jsonb, 'kg'),
  ('horizontal_push', '{"beginner": 30, "intermediate": 60, "advanced": 90, "elite": 120}'::jsonb, 'kg'),
  ('vertical_push', '{"beginner": 25, "intermediate": 50, "advanced": 75, "elite": 100}'::jsonb, 'kg'),
  ('horizontal_pull', '{"beginner": 30, "intermediate": 55, "advanced": 80, "elite": 105}'::jsonb, 'kg'),
  ('vertical_pull', '{"beginner": 35, "intermediate": 60, "advanced": 85, "elite": 110}'::jsonb, 'kg')
ON CONFLICT (estimation_family) DO NOTHING;
