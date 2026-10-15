ALTER TABLE exercise_catalogue
  ADD COLUMN IF NOT EXISTS max_fitness_rank integer NULL,
  ADD COLUMN IF NOT EXISTS is_substitute boolean NOT NULL DEFAULT false;

ALTER TABLE exercise_catalogue
  ADD CONSTRAINT exercise_catalogue_max_fitness_rank_check
  CHECK (max_fitness_rank IS NULL OR (max_fitness_rank BETWEEN 0 AND 3 AND max_fitness_rank >= min_fitness_rank));
