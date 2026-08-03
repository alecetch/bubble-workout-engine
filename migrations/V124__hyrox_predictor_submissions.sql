CREATE TABLE IF NOT EXISTS hyrox_predictor_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email TEXT NOT NULL,
  display_name TEXT,
  sex TEXT NOT NULL,
  age_group TEXT,
  division TEXT NOT NULL,
  run_5k_seconds INTEGER NOT NULL,
  run_10k_seconds INTEGER,
  back_squat_kg NUMERIC(6,2) NOT NULL,
  back_squat_reps INTEGER NOT NULL DEFAULT 3,
  deadlift_kg NUMERIC(6,2) NOT NULL,
  deadlift_reps INTEGER NOT NULL DEFAULT 3,
  bodyweight_kg NUMERIC(5,2) NOT NULL,
  height_cm INTEGER,
  row_erg_2k_seconds INTEGER,
  ski_erg_1k_seconds INTEGER,
  wall_ball_reps_in_2min INTEGER,
  farmer_carry_seconds INTEGER,
  previous_hyrox_seconds INTEGER,
  training_frequency TEXT,
  primary_background TEXT,
  weekly_running_km NUMERIC(5,2),
  target_finish_time_seconds INTEGER,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  research_consent BOOLEAN NOT NULL DEFAULT false,
  client_session_id TEXT,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_hyrox_predictor_submissions_email_created
  ON hyrox_predictor_submissions (email, created_at DESC);
