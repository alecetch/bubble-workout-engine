ALTER TABLE exercise_catalogue
  ADD COLUMN IF NOT EXISTS strength_primary_region TEXT
    CHECK (strength_primary_region IN ('upper', 'lower'));
