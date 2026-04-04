-- Exercises that genuinely accept a distance (metres) prescription.
-- All other exercises will have any distance rule converted to seconds.
UPDATE exercise_catalogue
SET accepts_distance_unit = true
WHERE exercise_id IN (
  -- carry
  'db_farmer_carry',
  'farmer_carry_dumbbells',
  'farmer_carry_handles',
  'farmer_carry_kettlebells',
  'farmer_carry_weighted',
  'farmers_carry',
  'front_rack_carry',
  'kb_farmer_carry',
  'sandbag_carry',
  -- cyclical engines
  'air_bike_sprint',
  'assault_bike',
  'bike_erg',
  'row_erg',
  'ski_erg',
  -- locomotion
  'bear_crawl',
  'burpee_broad_jump',
  'run_interval_outdoor_or_treadmill',
  -- lunge (distance-based variants)
  'db_walking_lunges',
  'kb_walking_lunges',
  'sandbag_front_rack_lunge',
  'sandbag_lunge',
  'walking_lunges',
  'weighted_walking_lunge',
  -- sled pull
  'sled_pull',
  'sled_pull_rope',
  'wheelbarrow_pull',
  -- sled push
  'sled_push',
  'sled_push_low_handle',
  'towel_push'
);
