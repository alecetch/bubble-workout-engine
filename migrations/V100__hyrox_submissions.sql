CREATE TABLE IF NOT EXISTS hyrox_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email TEXT NOT NULL,
  display_name TEXT,
  sex TEXT NOT NULL,
  age_on_race_day INTEGER,
  age_group TEXT,
  division TEXT NOT NULL,
  finish_time_seconds INTEGER NOT NULL,
  race_name TEXT,
  race_date DATE,
  source TEXT NOT NULL DEFAULT 'manual',
  splits_json JSONB NOT NULL,
  roxzone_mode TEXT NOT NULL,
  athlete_context_json JSONB,
  performance_context_json JSONB,
  marketing_consent BOOLEAN NOT NULL DEFAULT false,
  allow_partial BOOLEAN NOT NULL DEFAULT false,
  height_cm INTEGER,
  weight_kg NUMERIC(5,2),
  five_km_pb_seconds INTEGER,
  ten_km_pb_seconds INTEGER,
  half_marathon_pb_seconds INTEGER,
  back_squat_kg NUMERIC(6,2),
  deadlift_kg NUMERIC(6,2),
  front_squat_kg NUMERIC(6,2),
  max_unbroken_wall_balls INTEGER,
  injury_constraints JSONB,
  equipment_access JSONB
);

CREATE INDEX IF NOT EXISTS idx_hyrox_submissions_email_created
  ON hyrox_submissions (email, created_at DESC);
