-- Seed: baseline narration_template rows for deterministic program/day/segment/exercise copy.
-- Idempotent via ON CONFLICT (template_id) DO UPDATE.

WITH seed_rows AS (
  SELECT *
  FROM (
    VALUES
      ('prog_title_1', 'program', 'PROGRAM_TITLE', NULL, NULL, 1, true,
       '["{DAYS_PER_WEEK}-Day Hypertrophy ({DURATION_MINS} min)", "Hypertrophy Builder - {DAYS_PER_WEEK} Days / Week"]'::jsonb),
      ('prog_summary_1', 'program', 'PROGRAM_SUMMARY', NULL, NULL, 1, true,
       '["Three focused sessions per week with a main lift, secondary volume, and accessories.", "Progressive hypertrophy plan with repeatable structure and clear loading intent."]'::jsonb),
      ('prog_progression_1', 'program', 'PROGRESSION_BLURB', NULL, NULL, 1, true,
       '["Progress by adding small load or reps week-to-week while keeping 1-2 reps in reserve.", "Build through weeks 2-3, then reduce volume in week 4 to consolidate."]'::jsonb),
      ('prog_safety_1', 'program', 'SAFETY_BLURB', NULL, NULL, 1, true,
       '["Stop if pain is sharp and swap to a safer variation.", "Prioritise clean reps over load jumps."]'::jsonb),

      ('day_title_1', 'day', 'DAY_TITLE', NULL, NULL, 1, true,
       '["Day {DAY_INDEX}: {DAY_FOCUS} Hypertrophy", "Day {DAY_INDEX}: {DAY_FOCUS} Session"]'::jsonb),
      ('day_goal_1', 'day', 'DAY_GOAL', NULL, NULL, 1, true,
       '["Main focus: {MAIN_LIFT_NAME}. Then accumulate quality volume with {SECONDARY_LIFT_NAME}.", "Drive quality sets on {MAIN_LIFT_NAME}, then finish with efficient accessory work."]'::jsonb),
      ('warmup_title_1', 'day', 'WARMUP_TITLE', NULL, NULL, 1, true,
       '["Warm-up (8-12 min)", "Warm-up: mobilise, activate, ramp"]'::jsonb),
      ('warmup_heat_1', 'day', 'WARMUP_GENERAL_HEAT', NULL, NULL, 1, true,
       '["2-4 minutes easy engine work to raise core temperature.", "Start with a short pulse-raiser before ramp sets."]'::jsonb),
      ('warmup_ramp_1', 'day', 'RAMP_SETS_TEXT', NULL, NULL, 1, true,
       '["Ramp: empty bar x8, then 2-3 progressive jumps into your first work set.", "Build gradually to your first working set with crisp reps only."]'::jsonb),

      ('seg_title_main', 'segment', 'SEGMENT_TITLE', 'main', 'single', 1, true,
       '["Main Lift", "Primary Strength Work"]'::jsonb),
      ('seg_title_secondary', 'segment', 'SEGMENT_TITLE', 'secondary', NULL, 1, true,
       '["Secondary Volume", "Build Sets"]'::jsonb),
      ('seg_title_accessory', 'segment', 'SEGMENT_TITLE', 'accessory', NULL, 1, true,
       '["Accessories", "Finishing Work"]'::jsonb),
      ('seg_exec_single', 'segment', 'SEGMENT_EXECUTION', NULL, 'single', 1, true,
       '["Complete {ROUNDS} round(s). Rest {REST_SEC}s between sets.", "Work through {ROUNDS} round(s) with {REST_SEC}s rest."]'::jsonb),
      ('seg_exec_superset', 'segment', 'SEGMENT_EXECUTION', NULL, 'superset', 1, true,
       '["Alternate the pair with minimal transition, then rest {REST_SEC}s.", "Run A then B back-to-back; rest {REST_SEC}s after both."]'::jsonb),
      ('seg_exec_giant', 'segment', 'SEGMENT_EXECUTION', NULL, 'giant_set', 1, true,
       '["Flow through all movements, then rest {REST_SEC}s.", "Complete the full circuit, then recover {REST_SEC}s before next round."]'::jsonb),

      ('exercise_line_1', 'exercise', 'EXERCISE_LINE', NULL, NULL, 1, true,
       '["{EX_NAME}: {SETS} sets x {REP_RANGE} @ {RIR} RIR, tempo {TEMPO_SHORT}.", "{EX_NAME}: {SETS} sets, reps {REP_RANGE}, rest {REST_SEC}s."]'::jsonb),
      ('exercise_cue_1', 'exercise', 'CUE_LINE', NULL, NULL, 1, true,
       '["Stay braced and control the eccentric.", "Keep reps smooth and positions honest."]'::jsonb),
      ('exercise_log_1', 'exercise', 'LOGGING_PROMPT', NULL, NULL, 1, true,
       '["Log load and reps for each set.", "Track completed reps and working weight."]'::jsonb)
  ) AS t(
    template_id,
    scope,
    field,
    purpose,
    segment_type,
    priority,
    is_active,
    text_pool_json
  )
)
INSERT INTO public.narration_template (
  template_id,
  scope,
  field,
  purpose,
  segment_type,
  priority,
  is_active,
  text_pool_json,
  applies_json,
  updated_at
)
SELECT
  s.template_id,
  s.scope,
  s.field,
  s.purpose,
  s.segment_type,
  s.priority,
  s.is_active,
  s.text_pool_json,
  NULL::jsonb,
  now()
FROM seed_rows s
ON CONFLICT (template_id)
DO UPDATE SET
  scope = EXCLUDED.scope,
  field = EXCLUDED.field,
  purpose = EXCLUDED.purpose,
  segment_type = EXCLUDED.segment_type,
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  text_pool_json = EXCLUDED.text_pool_json,
  applies_json = EXCLUDED.applies_json,
  updated_at = now();
