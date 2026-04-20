UPDATE exercise_estimation_family_rank_defaults
SET estimation_family = 'horizontal_press'
WHERE estimation_family = 'horizontal_push';

UPDATE exercise_estimation_family_rank_defaults
SET estimation_family = 'vertical_press'
WHERE estimation_family = 'vertical_push';

UPDATE exercise_import_alias
SET estimation_family = 'horizontal_press'
WHERE estimation_family = 'horizontal_push';

UPDATE exercise_import_alias
SET estimation_family = 'vertical_press'
WHERE estimation_family = 'vertical_push';
