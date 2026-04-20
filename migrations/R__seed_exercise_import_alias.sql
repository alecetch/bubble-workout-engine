-- Seed default exercise import aliases for supported source apps.
-- Runs after R__exercise_catalogue_edits.sql (alphabetically 's' > 'e'),
-- so exercise_catalogue rows are guaranteed to exist.
-- exercise_id is NULL for any alias whose canonical exercise is not yet
-- in the catalogue; estimation_family is still set so mapping still works.

INSERT INTO exercise_import_alias (source_app, source_name_normalized, exercise_id, estimation_family)
VALUES
  ('hevy', 'barbell back squat',        'bb_back_squat',            'squat'),
  ('hevy', 'barbell squat',             'bb_back_squat',            'squat'),
  ('hevy', 'squat (barbell)',           'bb_back_squat',            'squat'),
  ('hevy', 'barbell deadlift',          NULL,                       'hinge'),
  ('hevy', 'deadlift (barbell)',        NULL,                       'hinge'),
  ('hevy', 'romanian deadlift',         NULL,                       'hinge'),
  ('hevy', 'barbell bench press',       NULL,                       'horizontal_press'),
  ('hevy', 'bench press (barbell)',     NULL,                       'horizontal_press'),
  ('hevy', 'incline bench press',       NULL,                       'horizontal_press'),
  ('hevy', 'overhead press (barbell)', NULL,                       'vertical_press'),
  ('hevy', 'barbell overhead press',   NULL,                       'vertical_press'),
  ('hevy', 'ohp',                       NULL,                       'vertical_press'),
  ('hevy', 'barbell row',               NULL,                       'horizontal_pull'),
  ('hevy', 'bent over row (barbell)',   NULL,                       'horizontal_pull'),
  ('hevy', 'pull up',                   NULL,                       'vertical_pull'),
  ('hevy', 'pull-up',                   NULL,                       'vertical_pull'),
  ('hevy', 'lat pulldown',              NULL,                       'vertical_pull')
ON CONFLICT (source_app, source_name_normalized) DO NOTHING;
