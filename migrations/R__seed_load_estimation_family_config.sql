INSERT INTO exercise_load_estimation_family_config (source_family, target_family, cross_family_factor)
VALUES
  ('squat', 'hinge', 0.920),
  ('hinge', 'squat', 0.900),
  ('horizontal_press', 'vertical_press', 0.760),
  ('vertical_press', 'horizontal_press', 1.180),
  ('horizontal_pull', 'vertical_pull', 0.860),
  ('vertical_pull', 'horizontal_pull', 0.900)
ON CONFLICT (source_family, target_family) DO UPDATE SET
  cross_family_factor = EXCLUDED.cross_family_factor,
  updated_at = now();
