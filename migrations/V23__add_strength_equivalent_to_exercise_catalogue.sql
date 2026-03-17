ALTER TABLE public.exercise_catalogue
  ADD COLUMN IF NOT EXISTS strength_equivalent BOOLEAN NOT NULL DEFAULT FALSE;
