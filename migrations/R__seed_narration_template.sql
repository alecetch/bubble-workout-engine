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
  NULL,
  'SEGMENT_EXECUTION',
  8, NULL, 'segment', 'amrap',
  'seg_exec_amrap_v1',
  '["Complete as many rounds as possible in the time cap. Log total rounds completed.", "Start conservatively — the goal is consistent pace through the full time cap."]'::jsonb,
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

-- Hyrox narration templates
INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox'),
  'PROGRAM_TITLE',
  10,
  NULL,
  'program',
  NULL,
  'hyrx_program_title',
  jsonb_build_array('Hyrox Prep - {DAYS_PER_WEEK}-Day ({DURATION_MINS} min)'),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_program_title');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox'),
  'PROGRAM_SUMMARY',
  10,
  NULL,
  'program',
  NULL,
  'hyrx_program_summary',
  jsonb_build_array(
    'Three day types, one goal: the run-station rhythm of a Hyrox race. Engine days build aerobic capacity through 8-minute blocks that open with a run every time. Power days put strength first - squat, press, sled - then drive it through AMRAP circuits. Endurance days deliver 10-minute blocks, all four starting with a run, at a threshold pace you can hold. Every session is race prep.',
    'Hyrox is a pacing problem, not a fitness problem. This program uses three session types to teach you to run, arrive at a station under control, work efficiently, and leave. Engine day: run-station rhythm. Power day: force production and station durability. Endurance day: sustained aerobic output.',
    'Eight weeks of run-station training. Engine sessions pair runs with wallballs, sleds, carries, and ergs - just like a race. Power sessions anchor on squat and press, then build to sled and carry AMRAPs. Endurance sessions use longer 10-minute blocks for threshold engine work. Train to pace. Race to perform.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_program_summary');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox'),
  'PROGRESSION_BLURB',
  10,
  NULL,
  'program',
  NULL,
  'hyrx_progression_blurb',
  jsonb_build_array(
    'Each week raises the target round count by one. Chase the numbers - but hold your pace. A slower round completed is better than a fast round abandoned.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_progression_blurb');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox', 'phase', 'BASELINE'),
  'WEEK_FOCUS',
  10,
  NULL,
  'week',
  NULL,
  'hyrx_week_baseline',
  jsonb_build_array(
    'Learn the movements. Build pacing discipline before you chase rounds.',
    'Baseline week: sub-maximal effort. Get comfortable with the block format and each station.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_week_baseline');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox', 'phase', 'BUILD'),
  'WEEK_FOCUS',
  10,
  NULL,
  'week',
  NULL,
  'hyrx_week_build',
  jsonb_build_array(
    'Push the blocks. Add a round where you can sustain form and pace.',
    'Build phase: increase effort gradually. A negative split - getting stronger through the block - is the target.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_week_build');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox', 'phase', 'CONSOLIDATE'),
  'WEEK_FOCUS',
  10,
  NULL,
  'week',
  NULL,
  'hyrx_week_consolidate',
  jsonb_build_array(
    'Hold quality. Reduce volume. Arrive fresh.',
    'Consolidate phase: do not add rounds. Sharpen movement efficiency and transitions.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_week_consolidate');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox', 'phase', 'PEAK'),
  'WEEK_FOCUS',
  10,
  NULL,
  'week',
  NULL,
  'hyrx_week_peak',
  jsonb_build_array(
    'Race-intensity effort. Treat every block like a race station. Arrive at each run ready to push.',
    'Peak week: near-maximal output. Minimal rest transitions. Simulate the conditions of race day.',
    'This is what you have been building toward. Race-effort blocks, race-pace runs, race-level discipline.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_week_peak');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'engine'),
  'DAY_TITLE',
  10,
  NULL,
  'day',
  NULL,
  'hyrx_day_engine_title',
  jsonb_build_array('Engine Day'),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_day_engine_title');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'power'),
  'DAY_TITLE',
  10,
  NULL,
  'day',
  NULL,
  'hyrx_day_power_title',
  jsonb_build_array('Power Day'),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_day_power_title');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'engine'),
  'DAY_GOAL',
  10,
  NULL,
  'day',
  NULL,
  'hyrx_day_engine_goal',
  jsonb_build_array(
    'Four 8-minute blocks. Start each run at a pace you can hold through the station. Do not sprint the buy-in.',
    'Focus on the run-station rhythm today. Consistent pacing across all four blocks beats a fast first block followed by collapse.',
    'Engine work. Your aerobic system is the engine that keeps your stations clean in a race. Train it today.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_day_engine_goal');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'power'),
  'DAY_GOAL',
  10,
  NULL,
  'day',
  NULL,
  'hyrx_day_power_goal',
  jsonb_build_array(
    'Strength foundation first, then three AMRAP blocks. The squat and press sets build the capacity to hold sled and carry form when you are deeply fatigued.',
    'Power day: heavy work, then hard blocks. Block A is real strength - use it. Block B is sled and carry - the stations that decide race splits. Block C is the run-wallball transfer. Treat it like race day.',
    'Build the engine chassis today. Squat, press, sled, carry, wallball. Every exercise earns its place by making you more durable in a Hyrox race.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_day_power_goal');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'endurance'),
  'DAY_TITLE',
  10,
  NULL,
  'day',
  NULL,
  'hyrx_day_endurance_title',
  jsonb_build_array('Endurance Day'),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_day_endurance_title');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'endurance'),
  'DAY_GOAL',
  10,
  NULL,
  'day',
  NULL,
  'hyrx_day_endurance_goal',
  jsonb_build_array(
    'Four 10-minute blocks. Every block starts with a run. Your only job today is to arrive at each station under control and hold your pace through all four blocks.',
    'Threshold work. Every block opens with a run buy-in - just like the race. If your pace in block 4 is significantly faster than block 1, you went out too easy. If it is slower, you went out too hard. Find the line.',
    'Aerobic engine day. Longer blocks, all four starting with a run, station pairs that match the race. The goal is sustained output - not max effort, not easy effort. Find race pace and hold it.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_day_endurance_goal');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox'),
  'SEGMENT_TITLE',
  10,
  NULL,
  'segment',
  'amrap',
  'hyrx_seg_amrap_title',
  jsonb_build_array('Block {SEGMENT_INDEX} - AMRAP'),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_amrap_title');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox'),
  'SEGMENT_EXECUTION',
  10,
  NULL,
  'segment',
  'amrap',
  'hyrx_seg_amrap_execution',
  jsonb_build_array(
    '8-minute AMRAP. Complete as many rounds as possible. Rest 60 seconds before the next block.',
    'As Many Rounds As Possible in 8 minutes. Keep a consistent pace - do not go out too hot. Rest 60 seconds after the clock stops.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_amrap_execution');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox'),
  'SEGMENT_INTENT',
  10,
  NULL,
  'segment',
  'amrap',
  'hyrx_seg_amrap_intent',
  jsonb_build_array(
    'Target: {ROUNDS} rounds. Start conservative - your pace in round 1 should be the same in round {ROUNDS}.',
    'Settle into a rhythm you can hold for all 8 minutes. Negative split is the goal.',
    'Race discipline: pick a pace from the first rep and hold it. Do not accelerate until the last 90 seconds.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_amrap_intent');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'endurance'),
  'SEGMENT_EXECUTION',
  5,
  NULL,
  'segment',
  'amrap',
  'hyrx_seg_amrap_endurance_execution',
  jsonb_build_array(
    '10-minute AMRAP. This is a threshold block - find a pace you can sustain for the full 10 minutes. Rest 90 seconds before the next block.',
    'As Many Rounds As Possible in 10 minutes. Negative split is the goal: aim to be moving as well in minute 9 as in minute 1. Rest 90 seconds after the clock stops.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_amrap_endurance_execution');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox', 'day_focus', 'endurance'),
  'SEGMENT_INTENT',
  5,
  NULL,
  'segment',
  'amrap',
  'hyrx_seg_amrap_endurance_intent',
  jsonb_build_array(
    'Threshold pace. Not a sprint, not a jog. The pace you could hold for 20 minutes if you had to.',
    'Target: {ROUNDS} rounds at a pace that feels controlled. If you need to stop within a round, you are going too hard.',
    'Race discipline: pick an effort level from the first rep and commit to it. Consistency across 10 minutes is the training adaptation you are after.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_amrap_endurance_intent');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox'),
  'SEGMENT_TITLE',
  10,
  'main',
  'segment',
  'single',
  'hyrx_seg_strength_title',
  jsonb_build_array('Strength Foundation'),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_strength_title');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
SELECT
  jsonb_build_object('program_type', 'hyrox'),
  'SEGMENT_EXECUTION',
  10,
  'main',
  'segment',
  'single',
  'hyrx_seg_strength_execution',
  jsonb_build_array(
    '{SETS} sets x {REP_RANGE}. Rest {REST_SEC}s between sets. This is your only strength block - execute it with precision.'
  ),
  now(),
  now(),
  true
WHERE NOT EXISTS (SELECT 1 FROM public.narration_template WHERE template_id = 'hyrx_seg_strength_execution');

INSERT INTO public.narration_template (
  applies_json, field, priority, purpose, scope, segment_type,
  template_id, text_pool_json, created_at, updated_at, is_active
)
VALUES (
  NULL,
  'SEGMENT_TITLE',
  8, NULL, 'segment', 'amrap',
  'seg_title_amrap_v1',
  '["AMRAP", "As Many Rounds As Possible", "Max Effort Block"]'::jsonb,
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
  NULL,
  'SEGMENT_EXECUTION',
  8, NULL, 'segment', 'emom',
  'seg_exec_emom_v1',
  '["Every minute on the minute: complete your reps, then rest for the remainder of the minute.", "Start each minute on the clock. Rest is whatever time remains after your reps."]'::jsonb,
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
  NULL,
  'SEGMENT_TITLE',
  8, NULL, 'segment', 'emom',
  'seg_title_emom_v1',
  '["EMOM", "Every Minute On the Minute", "Interval Block"]'::jsonb,
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
  '{"program_type":"conditioning"}'::jsonb,
  'PROGRAM_TITLE',
  10, NULL, 'program', NULL,
  'cond_prog_title_v1',
  '["Conditioning Programme", "Engine & Capacity", "Conditioning & Fitness"]'::jsonb,
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
  '{"program_type":"conditioning"}'::jsonb,
  'PROGRAM_SUMMARY',
  10, NULL, 'program', NULL,
  'cond_prog_summary_v1',
  '["A structured conditioning programme built around engine work, carries, and mixed modal efforts. Each session targets a different energy system."]'::jsonb,
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
  '{"program_type":"conditioning"}'::jsonb,
  'PROGRESSION_BLURB',
  10, NULL, 'program', NULL,
  'cond_prog_progression_v1',
  '["Progress by increasing effort or output each week — not by adding weight. The goal is to handle more work at the same or higher intensity."]'::jsonb,
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
  '{"program_type":"conditioning","day_focus":"engine_power"}'::jsonb,
  'DAY_TITLE',
  10, NULL, 'day', NULL,
  'cond_day_title_engine_v1',
  '["Engine Day", "Power & Conditioning", "High-Output Session"]'::jsonb,
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
  '{"program_type":"conditioning","day_focus":"mixed_modal"}'::jsonb,
  'DAY_TITLE',
  10, NULL, 'day', NULL,
  'cond_day_title_modal_v1',
  '["Mixed Modal Day", "Capacity & Ballistics", "Mixed Conditioning"]'::jsonb,
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
  '{"program_type":"conditioning","day_focus":"aerobic_base"}'::jsonb,
  'DAY_TITLE',
  10, NULL, 'day', NULL,
  'cond_day_title_aerobic_v1',
  '["Aerobic Base Day", "Steady State & Chassis", "Endurance Session"]'::jsonb,
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
  '{"program_type":"conditioning"}'::jsonb,
  'DAY_GOAL',
  10, NULL, 'day', NULL,
  'cond_day_goal_v1',
  '["Focus on consistent output — not maximum effort on every set.", "Move well, breathe, and maintain pace across the session.", "Quality of effort matters more than speed today."]'::jsonb,
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
  '{"program_type":"conditioning"}'::jsonb,
  'SEGMENT_EXECUTION',
  10, NULL, 'segment', 'superset',
  'cond_seg_exec_superset_v1',
  '["Move directly from exercise to exercise. Rest fully between rounds.", "Minimise transition time. The rest comes after the round, not between exercises."]'::jsonb,
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
  '{"program_type":"conditioning"}'::jsonb,
  'SEGMENT_EXECUTION',
  10, NULL, 'segment', 'giant_set',
  'cond_seg_exec_giant_v1',
  '["Move continuously through all exercises. Rest only after completing the full circuit.", "Keep transitions short. Your rest is earned — take it between rounds only."]'::jsonb,
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
  '{"program_type":"conditioning"}'::jsonb,
  'SEGMENT_TITLE',
  10, 'main', 'segment', NULL,
  'cond_seg_title_main_v1',
  '["Primary Effort", "Main Engine Work", "Primary Block"]'::jsonb,
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
  '{"program_type":"conditioning"}'::jsonb,
  'SEGMENT_TITLE',
  10, 'secondary', 'segment', NULL,
  'cond_seg_title_secondary_v1',
  '["Capacity Block", "Circuit Work", "Secondary Effort"]'::jsonb,
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
  '{"program_type":"conditioning"}'::jsonb,
  'SEGMENT_TITLE',
  10, 'accessory', 'segment', NULL,
  'cond_seg_title_accessory_v1',
  '["Metabolic Finisher", "Accessory Circuit", "Conditioning Accessory"]'::jsonb,
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
  '{"program_type":"conditioning"}'::jsonb,
  'CUE_LINE',
  10, NULL, 'exercise', NULL,
  'cond_ex_cue_v1',
  '["Control your breathing. Steady output beats one big burst.", "Pace yourself — the goal is consistent effort, not going all-out.", "Focus on mechanics under fatigue."]'::jsonb,
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
