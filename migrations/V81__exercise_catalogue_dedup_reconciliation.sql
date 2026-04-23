-- Exercise catalogue dedup reconciliation.
-- Informational audit query before/after rollout:
-- SELECT table_name, column_name
-- FROM information_schema.columns
-- WHERE column_name = 'exercise_id'
--   AND table_schema = 'public';

WITH mappings(alias_id, canonical_id) AS (
  VALUES
    ('barbell_back_squat', 'bb_back_squat'),
    ('barbell_front_squat', 'bb_front_squat'),
    ('barbell_bench_press', 'bb_bench_press'),
    ('barbell_row', 'bb_bentover_row'),
    ('barbell_deadlift', 'bb_deadlift'),
    ('barbell_good_morning', 'bb_good_morning'),
    ('ohp', 'bb_overhead_press'),
    ('push_press', 'bb_push_press'),
    ('barbell_rdl', 'bb_romanian_deadlift'),
    ('barbell_standing_calf_raise', 'bb_standing_calf_raise'),
    ('chest_supported_row', 'chestsupported_row_machine'),
    ('cyclist_squat', 'cyclist_squat_heels_elevated'),
    ('incline_db_curl', 'db_incline_curl'),
    ('lateral_raise', 'db_lateral_raise'),
    ('feet_elevated_inverted_row', 'feetelevated_inverted_row'),
    ('feet_elevated_pushup', 'feetelevated_pushup'),
    ('hack_squat', 'hack_squat_machine'),
    ('incline_bench_press', 'incline_bb_bench_press'),
    ('pull_up', 'pullup'),
    ('cable_row', 'seated_cable_row'),
    ('shuttle_run', 'shuttle_runs'),
    ('db_row', 'singlearm_db_row'),
    ('weighted_step_up', 'stepup_weighted'),
    ('straight_arm_pd', 'straightarm_pulldown'),
    ('toes_to_bar', 'toestobar')
)
UPDATE exercise_catalogue canonical
SET
  coaching_cues_json = CASE
    WHEN canonical.coaching_cues_json IS NULL OR canonical.coaching_cues_json = '[]'::jsonb
      THEN alias.coaching_cues_json
    ELSE canonical.coaching_cues_json
  END,
  load_guidance = COALESCE(canonical.load_guidance, alias.load_guidance),
  logging_guidance = COALESCE(canonical.logging_guidance, alias.logging_guidance),
  updated_at = now()
FROM mappings
JOIN exercise_catalogue alias
  ON alias.exercise_id = mappings.alias_id
WHERE canonical.exercise_id = mappings.canonical_id;

UPDATE program_exercise
SET exercise_id = CASE exercise_id
  WHEN 'barbell_back_squat'          THEN 'bb_back_squat'
  WHEN 'barbell_front_squat'         THEN 'bb_front_squat'
  WHEN 'barbell_bench_press'         THEN 'bb_bench_press'
  WHEN 'barbell_row'                 THEN 'bb_bentover_row'
  WHEN 'barbell_deadlift'            THEN 'bb_deadlift'
  WHEN 'barbell_good_morning'        THEN 'bb_good_morning'
  WHEN 'ohp'                         THEN 'bb_overhead_press'
  WHEN 'push_press'                  THEN 'bb_push_press'
  WHEN 'barbell_rdl'                 THEN 'bb_romanian_deadlift'
  WHEN 'barbell_standing_calf_raise' THEN 'bb_standing_calf_raise'
  WHEN 'chest_supported_row'         THEN 'chestsupported_row_machine'
  WHEN 'cyclist_squat'               THEN 'cyclist_squat_heels_elevated'
  WHEN 'incline_db_curl'             THEN 'db_incline_curl'
  WHEN 'lateral_raise'               THEN 'db_lateral_raise'
  WHEN 'feet_elevated_inverted_row'  THEN 'feetelevated_inverted_row'
  WHEN 'feet_elevated_pushup'        THEN 'feetelevated_pushup'
  WHEN 'hack_squat'                  THEN 'hack_squat_machine'
  WHEN 'incline_bench_press'         THEN 'incline_bb_bench_press'
  WHEN 'pull_up'                     THEN 'pullup'
  WHEN 'cable_row'                   THEN 'seated_cable_row'
  WHEN 'shuttle_run'                 THEN 'shuttle_runs'
  WHEN 'db_row'                      THEN 'singlearm_db_row'
  WHEN 'weighted_step_up'            THEN 'stepup_weighted'
  WHEN 'straight_arm_pd'             THEN 'straightarm_pulldown'
  WHEN 'toes_to_bar'                 THEN 'toestobar'
  ELSE exercise_id
END
WHERE exercise_id IN (
  'barbell_back_squat','barbell_front_squat','barbell_bench_press',
  'barbell_row','barbell_deadlift','barbell_good_morning','ohp',
  'push_press','barbell_rdl','barbell_standing_calf_raise',
  'chest_supported_row','cyclist_squat','incline_db_curl',
  'lateral_raise','feet_elevated_inverted_row','feet_elevated_pushup',
  'hack_squat','incline_bench_press','pull_up','cable_row',
  'shuttle_run','db_row','weighted_step_up','straight_arm_pd','toes_to_bar'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'exercise_progression_state'
  ) THEN
    UPDATE exercise_progression_state
    SET exercise_id = CASE exercise_id
      WHEN 'barbell_back_squat'          THEN 'bb_back_squat'
      WHEN 'barbell_front_squat'         THEN 'bb_front_squat'
      WHEN 'barbell_bench_press'         THEN 'bb_bench_press'
      WHEN 'barbell_row'                 THEN 'bb_bentover_row'
      WHEN 'barbell_deadlift'            THEN 'bb_deadlift'
      WHEN 'barbell_good_morning'        THEN 'bb_good_morning'
      WHEN 'ohp'                         THEN 'bb_overhead_press'
      WHEN 'push_press'                  THEN 'bb_push_press'
      WHEN 'barbell_rdl'                 THEN 'bb_romanian_deadlift'
      WHEN 'barbell_standing_calf_raise' THEN 'bb_standing_calf_raise'
      WHEN 'chest_supported_row'         THEN 'chestsupported_row_machine'
      WHEN 'cyclist_squat'               THEN 'cyclist_squat_heels_elevated'
      WHEN 'incline_db_curl'             THEN 'db_incline_curl'
      WHEN 'lateral_raise'               THEN 'db_lateral_raise'
      WHEN 'feet_elevated_inverted_row'  THEN 'feetelevated_inverted_row'
      WHEN 'feet_elevated_pushup'        THEN 'feetelevated_pushup'
      WHEN 'hack_squat'                  THEN 'hack_squat_machine'
      WHEN 'incline_bench_press'         THEN 'incline_bb_bench_press'
      WHEN 'pull_up'                     THEN 'pullup'
      WHEN 'cable_row'                   THEN 'seated_cable_row'
      WHEN 'shuttle_run'                 THEN 'shuttle_runs'
      WHEN 'db_row'                      THEN 'singlearm_db_row'
      WHEN 'weighted_step_up'            THEN 'stepup_weighted'
      WHEN 'straight_arm_pd'             THEN 'straightarm_pulldown'
      WHEN 'toes_to_bar'                 THEN 'toestobar'
      ELSE exercise_id
    END
    WHERE exercise_id IN (
      'barbell_back_squat','barbell_front_squat','barbell_bench_press',
      'barbell_row','barbell_deadlift','barbell_good_morning','ohp',
      'push_press','barbell_rdl','barbell_standing_calf_raise',
      'chest_supported_row','cyclist_squat','incline_db_curl',
      'lateral_raise','feet_elevated_inverted_row','feet_elevated_pushup',
      'hack_squat','incline_bench_press','pull_up','cable_row',
      'shuttle_run','db_row','weighted_step_up','straight_arm_pd','toes_to_bar'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'exercise_progression_decision'
  ) THEN
    UPDATE exercise_progression_decision
    SET exercise_id = CASE exercise_id
      WHEN 'barbell_back_squat'          THEN 'bb_back_squat'
      WHEN 'barbell_front_squat'         THEN 'bb_front_squat'
      WHEN 'barbell_bench_press'         THEN 'bb_bench_press'
      WHEN 'barbell_row'                 THEN 'bb_bentover_row'
      WHEN 'barbell_deadlift'            THEN 'bb_deadlift'
      WHEN 'barbell_good_morning'        THEN 'bb_good_morning'
      WHEN 'ohp'                         THEN 'bb_overhead_press'
      WHEN 'push_press'                  THEN 'bb_push_press'
      WHEN 'barbell_rdl'                 THEN 'bb_romanian_deadlift'
      WHEN 'barbell_standing_calf_raise' THEN 'bb_standing_calf_raise'
      WHEN 'chest_supported_row'         THEN 'chestsupported_row_machine'
      WHEN 'cyclist_squat'               THEN 'cyclist_squat_heels_elevated'
      WHEN 'incline_db_curl'             THEN 'db_incline_curl'
      WHEN 'lateral_raise'               THEN 'db_lateral_raise'
      WHEN 'feet_elevated_inverted_row'  THEN 'feetelevated_inverted_row'
      WHEN 'feet_elevated_pushup'        THEN 'feetelevated_pushup'
      WHEN 'hack_squat'                  THEN 'hack_squat_machine'
      WHEN 'incline_bench_press'         THEN 'incline_bb_bench_press'
      WHEN 'pull_up'                     THEN 'pullup'
      WHEN 'cable_row'                   THEN 'seated_cable_row'
      WHEN 'shuttle_run'                 THEN 'shuttle_runs'
      WHEN 'db_row'                      THEN 'singlearm_db_row'
      WHEN 'weighted_step_up'            THEN 'stepup_weighted'
      WHEN 'straight_arm_pd'             THEN 'straightarm_pulldown'
      WHEN 'toes_to_bar'                 THEN 'toestobar'
      ELSE exercise_id
    END
    WHERE exercise_id IN (
      'barbell_back_squat','barbell_front_squat','barbell_bench_press',
      'barbell_row','barbell_deadlift','barbell_good_morning','ohp',
      'push_press','barbell_rdl','barbell_standing_calf_raise',
      'chest_supported_row','cyclist_squat','incline_db_curl',
      'lateral_raise','feet_elevated_inverted_row','feet_elevated_pushup',
      'hack_squat','incline_bench_press','pull_up','cable_row',
      'shuttle_run','db_row','weighted_step_up','straight_arm_pd','toes_to_bar'
    );
  END IF;
END $$;

DELETE FROM exercise_catalogue
WHERE exercise_id IN (
  'barbell_back_squat','barbell_front_squat','barbell_bench_press',
  'barbell_row','barbell_deadlift','barbell_good_morning','ohp',
  'push_press','barbell_rdl','barbell_standing_calf_raise',
  'chest_supported_row','cyclist_squat','incline_db_curl',
  'lateral_raise','feet_elevated_inverted_row','feet_elevated_pushup',
  'hack_squat','incline_bench_press','pull_up','cable_row',
  'shuttle_run','db_row','weighted_step_up','straight_arm_pd','toes_to_bar'
);
