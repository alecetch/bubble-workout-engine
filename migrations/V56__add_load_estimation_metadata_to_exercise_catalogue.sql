ALTER TABLE exercise_catalogue
  ADD COLUMN IF NOT EXISTS load_estimation_metadata jsonb;
