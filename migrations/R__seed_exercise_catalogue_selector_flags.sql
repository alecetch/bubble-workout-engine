-- This seed owns both selector flags. The catalogue admin exposes them read-only;
-- snapshot upserts deliberately omit them. Reset first so removed ids lose their flags.
UPDATE exercise_catalogue SET max_fitness_rank = NULL, is_substitute = false
WHERE max_fitness_rank IS NOT NULL OR is_substitute;

UPDATE exercise_catalogue SET max_fitness_rank = 0
WHERE exercise_id IN ('kneeling_pushup');

UPDATE exercise_catalogue SET max_fitness_rank = 1
WHERE exercise_id IN (
  'incline_pushup',
  'assisted_pistol_squat',
  'shrimp_squat_assisted',
  'band_assisted_pullup',
  'negative_pullup'
);

UPDATE exercise_catalogue SET is_substitute = true
WHERE exercise_id IN (
  'towel_push',
  'dead_tread',
  'backward_bear_crawl',
  'sandbag_backward_drag',
  'bodyweight_ski_hinge',
  'resistance_band_ski_erg',
  'medball_slam',
  'squat_thrust',
  'table_row',
  'rdl_and_bent_over_row',
  'band_rowing_stroke',
  'squat_to_overhead_reach',
  'step_back_burpee',
  'farmer_carry_weighted'
);
