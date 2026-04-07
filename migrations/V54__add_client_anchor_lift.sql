CREATE TABLE IF NOT EXISTS client_anchor_lift (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES client_profile(id) ON DELETE CASCADE,
  estimation_family text NOT NULL,
  exercise_id text NULL REFERENCES exercise_catalogue(exercise_id) ON DELETE SET NULL,
  load_kg numeric(6,2) NULL,
  reps int NULL CHECK (reps IS NULL OR (reps >= 1 AND reps <= 30)),
  rir numeric(3,1) NULL CHECK (rir IS NULL OR (rir >= 0 AND rir <= 10)),
  skipped boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'onboarding',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_profile_id, estimation_family)
);

CREATE INDEX IF NOT EXISTS idx_client_anchor_lift_client_profile
  ON client_anchor_lift(client_profile_id);

CREATE INDEX IF NOT EXISTS idx_client_anchor_lift_exercise
  ON client_anchor_lift(exercise_id);
