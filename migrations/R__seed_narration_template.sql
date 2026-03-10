-- Seed: narration templates sourced from api/data/export_Narration-template_2026-03-08.csv
-- Idempotent via ON CONFLICT (template_id) DO UPDATE.

WITH seed_rows AS (
  SELECT *
  FROM (
    VALUES
      (NULL, 'PROGRAM_SUMMARY', '1', NULL, 'program', NULL, 'prog_summary_1', '["Three focused sessions per week with a main lift, a secondary pattern, and short accessories. Keep effort at ~{RIR} RIR on most work and progress steadily.", "A simple, repeatable hypertrophy week: main movement first, then secondary volume, then a tight accessory finisher. Prioritise clean reps and consistent loading.", "Built for consistency: key compounds each week, then targeted accessories. Aim to add small load or reps week-to-week while keeping form sharp."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'WARMUP_TITLE', '1', NULL, 'day', NULL, 'warmup_title_1', '["Warm-up (8?12 min)", "Warm-up: ramp + prep", "Warm-up: mobilise, activate, ramp"]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'PROGRESSION_BLURB', '1', NULL, 'program', NULL, 'prog_progression_1', '["Progression: add 1 set to key lifts in weeks 2?3 (as prescribed), then reduce volume in week 4 to consolidate.", "Progression: build volume through weeks 2?3, then deload week 4. Keep 1?2 reps in reserve on most sets.", "Progression: small weekly volume increases, then a lighter week 4. Add load only when reps stay crisp."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'DAY_TITLE', '1', NULL, 'day', NULL, 'day_title_1', '["Day {DAY_INDEX}: {DAY_FOCUS} Hypertrophy", "Day {DAY_INDEX}: {DAY_FOCUS} ? Build Volume", "Day {DAY_INDEX}: {DAY_FOCUS} Session"]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'SAFETY_BLURB', '1', NULL, 'program', NULL, 'prog_safety_1', '["Pain rule: stop if you get sharp pain. Swap to a safer variation and keep training quality high.", "Quality first: if form degrades, reduce load and finish the prescribed work cleanly.", "Stay conservative on the first week?earn the right to add load."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'PROGRAM_TITLE', '1', NULL, 'program', NULL, 'prog_title_1', '["{DAYS_PER_WEEK}-Day Hypertrophy ( {DURATION_MINS} min )", "Hypertrophy Builder ? {DAYS_PER_WEEK} Days / Week", "Strength + Size ( {DURATION_MINS}-Minute Sessions )"]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'WARMUP_GENERAL_HEAT', '1', NULL, 'day', NULL, 'warmup_heat_1', '["2?4 minutes easy pace to raise core temp (bike/row/jog).", "Start with 3 minutes of easy engine work to get warm.", "Quick pulse-raiser: 2?3 minutes steady movement."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'TIME_BUDGET_HINT', '1', NULL, 'day', NULL, 'day_time_40', '["40-minute cap: set up stations early and keep rests honest.", "Keep transitions tight to stay inside 40 minutes.", "Move with purpose?this session is short by design."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'RAMP_SETS_TEXT', '1', NULL, 'day', NULL, 'warmup_ramp_1', '["Ramp: empty bar x8, ~40% x5, ~60% x3, ~75% x1?2, then start work sets.", "Ramp sets: bar x8, light x5, moderate x3, 1?2 crisp singles, then into working sets.", "Build gradually: bar x8, 2?3 progressive jumps to your first work set."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'DAY_GOAL', '1', NULL, 'day', NULL, 'day_intro_1', '["Today?s priority is {MAIN_LIFT_NAME}. Get quality sets in early, then build volume with {SECONDARY_LIFT_NAME} and accessories.", "Main focus: {MAIN_LIFT_NAME}. Keep the clock moving?secondary work and accessories should feel efficient, not rushed.", "Hit {MAIN_LIFT_NAME} hard but controlled, then accumulate good reps on {SECONDARY_LIFT_NAME}. Finish with short accessory work."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'SEGMENT_TITLE', '1', 'secondary', 'segment', NULL, 'seg_title_secondary', '["Secondary Volume", "Secondary Block", "Build Sets"]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'SEGMENT_TITLE', '1', 'main', 'segment', 'single', 'seg_title_main', '["Main Lift", "Primary Strength Work", "Main Movement"]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'SEGMENT_EXECUTION', '1', NULL, 'segment', 'superset', 'seg_exec_superset', '["Superset: alternate the pair with minimal transition. Rest {REST_SEC}s after both. Repeat for {ROUNDS} rounds.", "Run A then B back-to-back; rest {REST_SEC}s after the second movement. {ROUNDS} total rounds.", "Keep the two stations ready. Move straight to the second exercise, then rest {REST_SEC}s. {ROUNDS} rounds."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'SEGMENT_EXECUTION', '1', NULL, 'segment', 'single', 'seg_exec_single', '["Complete {ROUNDS} round(s). Rest {REST_SEC}s between sets.", "{ROUNDS} round(s). Keep reps smooth; rest {REST_SEC}s.", "Work through {ROUNDS} round(s) with {REST_SEC}s rest between sets."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'SEGMENT_TITLE', '1', 'accessory', 'segment', NULL, 'seg_title_accessory', '["Accessories", "Finishing Work", "Accessory Builder"]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'SEGMENT_EXECUTION', '1', NULL, 'segment', 'giant_set', 'seg_exec_giant', '["Giant set: flow through all movements, then rest {REST_SEC}s. Repeat for {ROUNDS} rounds.", "Complete the circuit in order with quick transitions; rest {REST_SEC}s after the last movement. {ROUNDS} rounds.", "Move station-to-station, then take {REST_SEC}s. Repeat for {ROUNDS} rounds."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'SEGMENT_INTENT', '1', 'accessory', 'segment', NULL, 'seg_intent_accessory', '["Chase quality contractions and a strong pump.", "Keep tension where you want it?controlled reps.", "Short rests, clean reps, finish strong."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'SEGMENT_INTENT', '1', 'secondary', 'segment', NULL, 'seg_intent_secondary', '["Aim for steady volume?no grinders.", "Accumulate clean reps and keep rest disciplined.", "This block should feel challenging but repeatable."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'SETUP_NOTE', '1', NULL, 'transition', 'superset', 'trans_setup_superset', '["Set both stations up before you start.", "Have both implements ready so you don?t waste time mid-round.", "Quick set-up now saves minutes later?prep both movements."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'TRANSITION_NOTE', '1', NULL, 'transition', 'superset', 'trans_transition_superset', '["Transition quickly?rest comes after both movements.", "Move straight to the second exercise; earn the rest after.", "No hanging around between exercises?rest after the pair."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'PACE_NOTE', '1', NULL, 'transition', NULL, 'trans_pace_note', '["Stop 1 rep before form breaks.", "Keep reps crisp?quality over ego.", "If tempo slips, reduce load and keep moving."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'CUE_LINE', '1', NULL, 'exercise', NULL, 'ex_cue_line', '["Cues: {CUE_1}. {CUE_2}.", "Focus: {CUE_1}; {CUE_2}.", "Keep in mind: {CUE_1}. Then {CUE_2}."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'LOGGING_PROMPT', '1', NULL, 'exercise', NULL, 'ex_log_prompt', '["Log load + reps for your hardest set.", "Track the top set and total reps.", "Note the weight used and how many reps you had in reserve."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'EXERCISE_LINE', '1', 'main', 'exercise', NULL, 'ex_line_main', '["{EX_NAME}: {SETS} set(s) of {REP_RANGE} @ ~{RIR} RIR. Tempo {TEMPO}.", "{EX_NAME}: {SETS} x {REP_RANGE}, leave {RIR} reps in reserve. Tempo {TEMPO}.", "{EX_NAME}: {SETS} sets in the {REP_RANGE} range. Keep {RIR} RIR and controlled tempo ({TEMPO})."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'EXERCISE_LINE', '1', 'secondary', 'exercise', NULL, 'ex_line_secondary', '["{EX_NAME}: {SETS} x {REP_RANGE}. Smooth reps, {RIR} RIR.", "{EX_NAME}: {SETS} sets of {REP_RANGE} with control?no grinders.", "{EX_NAME}: {SETS} x {REP_RANGE}. Add load only if reps stay clean."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'LOAD_HINT', '1', NULL, 'exercise', NULL, 'ex_load_hint', '["If you hit the top of the rep range with clean form, add a small amount of load next time.", "Progression: add reps first, then load once you own the range.", "Add load only when every rep looks the same."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True'),
      (NULL, 'EXERCISE_LINE', '1', 'accessory', 'exercise', NULL, 'ex_line_accessory', '["{EX_NAME}: {SETS} x {REP_RANGE}. Control the eccentric.", "{EX_NAME}: {SETS} sets in {REP_RANGE}?chase tension, not momentum.", "{EX_NAME}: {SETS} x {REP_RANGE}. Keep the last reps hard but tidy."]', '2026-03-01 16:19:26.993318+00', '2026-03-01 16:19:26.993318+00', 'True')
  ) AS t(
    applies_json,
    field,
    priority,
    purpose,
    scope,
    segment_type,
    template_id,
    text_pool_json,
    created_at,
    updated_at,
    is_active
  )
)
INSERT INTO public.narration_template (
  applies_json,
  field,
  priority,
  purpose,
  scope,
  segment_type,
  template_id,
  text_pool_json,
  created_at,
  updated_at,
  is_active
)
SELECT
  applies_json::jsonb,
  field,
  priority::int,
  purpose,
  scope,
  segment_type,
  template_id,
  text_pool_json::jsonb,
  COALESCE(created_at::timestamptz, now()),
  COALESCE(updated_at::timestamptz, now()),
  COALESCE(is_active::boolean, true)
FROM seed_rows
ON CONFLICT (template_id)
DO UPDATE SET
  applies_json = EXCLUDED.applies_json,
  field = EXCLUDED.field,
  priority = EXCLUDED.priority,
  purpose = EXCLUDED.purpose,
  scope = EXCLUDED.scope,
  segment_type = EXCLUDED.segment_type,
  text_pool_json = EXCLUDED.text_pool_json,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Seed: minimal strength phase narration templates.
INSERT INTO public.narration_template (
  applies_json,
  field,
  priority,
  purpose,
  scope,
  segment_type,
  template_id,
  text_pool_json,
  created_at,
  updated_at,
  is_active
)
VALUES (
  '{"program_type":"strength","phase":"BASELINE"}'::jsonb,
  'PROGRESSION_BLURB',
  1,
  NULL,
  'program',
  NULL,
  'strength_phase_baseline_v1',
  '["Baseline phase: establish consistent setup, bar path, and repeatable working loads.", "Baseline week: prioritize clean reps and stable technique before adding load."]'::jsonb,
  now(),
  now(),
  true
)
ON CONFLICT (template_id)
DO UPDATE SET
  applies_json = EXCLUDED.applies_json,
  field = EXCLUDED.field,
  priority = EXCLUDED.priority,
  purpose = EXCLUDED.purpose,
  scope = EXCLUDED.scope,
  segment_type = EXCLUDED.segment_type,
  text_pool_json = EXCLUDED.text_pool_json,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.narration_template (
  applies_json,
  field,
  priority,
  purpose,
  scope,
  segment_type,
  template_id,
  text_pool_json,
  created_at,
  updated_at,
  is_active
)
VALUES (
  '{"program_type":"strength","phase":"BUILD"}'::jsonb,
  'PROGRESSION_BLURB',
  1,
  NULL,
  'program',
  NULL,
  'strength_phase_build_v1',
  '["Build phase: add small load increments while keeping every rep technically sound.", "Build week: progress gradually and keep 1-2 reps in reserve on your heaviest sets."]'::jsonb,
  now(),
  now(),
  true
)
ON CONFLICT (template_id)
DO UPDATE SET
  applies_json = EXCLUDED.applies_json,
  field = EXCLUDED.field,
  priority = EXCLUDED.priority,
  purpose = EXCLUDED.purpose,
  scope = EXCLUDED.scope,
  segment_type = EXCLUDED.segment_type,
  text_pool_json = EXCLUDED.text_pool_json,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.narration_template (
  applies_json,
  field,
  priority,
  purpose,
  scope,
  segment_type,
  template_id,
  text_pool_json,
  created_at,
  updated_at,
  is_active
)
VALUES (
  '{"program_type":"strength","phase":"CONSOLIDATE"}'::jsonb,
  'PROGRESSION_BLURB',
  1,
  NULL,
  'program',
  NULL,
  'strength_phase_consolidate_v1',
  '["Consolidate phase: reduce fatigue, keep bar speed crisp, and finish the block strong.", "Consolidate week: trim effort slightly and lock in movement quality under load."]'::jsonb,
  now(),
  now(),
  true
)
ON CONFLICT (template_id)
DO UPDATE SET
  applies_json = EXCLUDED.applies_json,
  field = EXCLUDED.field,
  priority = EXCLUDED.priority,
  purpose = EXCLUDED.purpose,
  scope = EXCLUDED.scope,
  segment_type = EXCLUDED.segment_type,
  text_pool_json = EXCLUDED.text_pool_json,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Seed: minimal conditioning phase narration templates.
INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
VALUES (
  '{"program_type":"conditioning","phase":"BASELINE"}'::jsonb,
  'PROGRESSION_BLURB',
  1, NULL, 'program', NULL,
  'cond_phase_baseline_v1',
  '["Baseline phase: settle into your pacing, get comfortable with the formats, and build the aerobic base.", "Baseline week: effort is moderate — prioritise consistency and movement quality over intensity."]'::jsonb,
  now(), now(), true
)
ON CONFLICT (template_id)
DO UPDATE SET
  applies_json = EXCLUDED.applies_json,
  field = EXCLUDED.field,
  priority = EXCLUDED.priority,
  purpose = EXCLUDED.purpose,
  scope = EXCLUDED.scope,
  segment_type = EXCLUDED.segment_type,
  text_pool_json = EXCLUDED.text_pool_json,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
VALUES (
  '{"program_type":"conditioning","phase":"BUILD"}'::jsonb,
  'PROGRESSION_BLURB',
  1, NULL, 'program', NULL,
  'cond_phase_build_v1',
  '["Build phase: push the pace a little harder each session and add output where prescribed.", "Build week: increase intensity or volume slightly — you should finish feeling challenged."]'::jsonb,
  now(), now(), true
)
ON CONFLICT (template_id)
DO UPDATE SET
  applies_json = EXCLUDED.applies_json,
  field = EXCLUDED.field,
  priority = EXCLUDED.priority,
  purpose = EXCLUDED.purpose,
  scope = EXCLUDED.scope,
  segment_type = EXCLUDED.segment_type,
  text_pool_json = EXCLUDED.text_pool_json,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
VALUES (
  '{"program_type":"conditioning","phase":"CONSOLIDATE"}'::jsonb,
  'PROGRESSION_BLURB',
  1, NULL, 'program', NULL,
  'cond_phase_consolidate_v1',
  '["Consolidate phase: reduce effort slightly and lock in your aerobic gains before the next block.", "Consolidate week: back off the intensity, keep the movement quality high, and finish strong."]'::jsonb,
  now(), now(), true
)
ON CONFLICT (template_id)
DO UPDATE SET
  applies_json = EXCLUDED.applies_json,
  field = EXCLUDED.field,
  priority = EXCLUDED.priority,
  purpose = EXCLUDED.purpose,
  scope = EXCLUDED.scope,
  segment_type = EXCLUDED.segment_type,
  text_pool_json = EXCLUDED.text_pool_json,
  is_active = EXCLUDED.is_active,
  updated_at = now();
