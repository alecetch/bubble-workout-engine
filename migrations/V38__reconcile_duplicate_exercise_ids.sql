-- Reconcile duplicate exercise_catalogue rows after approving
-- R__exercise_catalogue_edits.sql as the sole authoritative repeatable source.
--
-- Strategy:
-- 1. Remap historical program_exercise.exercise_id values onto authoritative IDs.
-- 2. Copy exercise-owned content from duplicate rows onto authoritative rows when blank.
-- 3. Delete duplicate non-authoritative exercise_catalogue rows.

with id_map(old_id, new_id) as (
  values
    ('barbell_back_squat', 'bb_back_squat'),
    ('bench_press', 'bb_bench_press'),
    ('barbell_row', 'bb_bentover_row'),
    ('barbell_deadlift', 'bb_deadlift'),
    ('barbell_front_squat', 'bb_front_squat'),
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
    ('kb_rdl', 'kb_romanian_deadlift'),
    ('oh_triceps', 'overhead_cable_extension'),
    ('pec_deck', 'pec_deck_fly'),
    ('pull_up', 'pullup'),
    ('rear_delt_fly', 'rear_delt_fly_machine_or_db'),
    ('cable_row', 'seated_cable_row'),
    ('shuttle_run', 'shuttle_runs'),
    ('db_row', 'singlearm_db_row'),
    ('bw_rdl', 'singleleg_bodyweight_rdl'),
    ('single_leg_rdl', 'singleleg_romanian_deadlift'),
    ('weighted_step_up', 'stepup_weighted'),
    ('straight_arm_pd', 'straightarm_pulldown'),
    ('toes_to_bar', 'toestobar')
)
update program_exercise pe
set exercise_id = m.new_id
from id_map m
where pe.exercise_id = m.old_id;

with id_map(old_id, new_id) as (
  values
    ('barbell_back_squat', 'bb_back_squat'),
    ('bench_press', 'bb_bench_press'),
    ('barbell_row', 'bb_bentover_row'),
    ('barbell_deadlift', 'bb_deadlift'),
    ('barbell_front_squat', 'bb_front_squat'),
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
    ('kb_rdl', 'kb_romanian_deadlift'),
    ('oh_triceps', 'overhead_cable_extension'),
    ('pec_deck', 'pec_deck_fly'),
    ('pull_up', 'pullup'),
    ('rear_delt_fly', 'rear_delt_fly_machine_or_db'),
    ('cable_row', 'seated_cable_row'),
    ('shuttle_run', 'shuttle_runs'),
    ('db_row', 'singlearm_db_row'),
    ('bw_rdl', 'singleleg_bodyweight_rdl'),
    ('single_leg_rdl', 'singleleg_romanian_deadlift'),
    ('weighted_step_up', 'stepup_weighted'),
    ('straight_arm_pd', 'straightarm_pulldown'),
    ('toes_to_bar', 'toestobar')
)
update exercise_catalogue canon
set
  coaching_cues_json = case
    when jsonb_array_length(coalesce(canon.coaching_cues_json, '[]'::jsonb)) = 0
      and jsonb_array_length(coalesce(dup.coaching_cues_json, '[]'::jsonb)) > 0
    then dup.coaching_cues_json
    else canon.coaching_cues_json
  end,
  load_guidance = case
    when coalesce(nullif(trim(canon.load_guidance), ''), '') = ''
      and coalesce(nullif(trim(dup.load_guidance), ''), '') <> ''
    then dup.load_guidance
    else canon.load_guidance
  end,
  logging_guidance = case
    when coalesce(nullif(trim(canon.logging_guidance), ''), '') = ''
      and coalesce(nullif(trim(dup.logging_guidance), ''), '') <> ''
    then dup.logging_guidance
    else canon.logging_guidance
  end,
  updated_at = now()
from id_map m
join exercise_catalogue dup on dup.exercise_id = m.old_id
where canon.exercise_id = m.new_id;

delete from exercise_catalogue
where exercise_id in (
  'barbell_back_squat',
  'bench_press',
  'barbell_row',
  'barbell_deadlift',
  'barbell_front_squat',
  'barbell_good_morning',
  'ohp',
  'push_press',
  'barbell_rdl',
  'barbell_standing_calf_raise',
  'chest_supported_row',
  'cyclist_squat',
  'incline_db_curl',
  'lateral_raise',
  'feet_elevated_inverted_row',
  'feet_elevated_pushup',
  'hack_squat',
  'incline_bench_press',
  'kb_rdl',
  'oh_triceps',
  'pec_deck',
  'pull_up',
  'rear_delt_fly',
  'cable_row',
  'shuttle_run',
  'db_row',
  'bw_rdl',
  'single_leg_rdl',
  'weighted_step_up',
  'straight_arm_pd',
  'toes_to_bar'
);
