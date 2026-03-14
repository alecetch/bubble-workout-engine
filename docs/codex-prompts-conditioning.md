# Codex Implementation Prompts — Conditioning Program Type

**Usage:** Execute prompts sequentially. After each completes, report the output before proceeding.
**Repository root:** `bubble-workout-engine/`
**Do not skip steps.** Later prompts may depend on earlier state.

---

## PROMPT 1 — Catalogue & Config Audit (Read-Only)

**Do not modify any files. This is an audit only.**

Read the following files in full:

1. `migrations/R__seed_exercise_catalogue.sql`
2. `migrations/R__seed_program_generation_config.sql` — specifically the `conditioning_default_v1` block (search for that string)
3. `api/engine/steps/01_buildProgramFromDefinition.js` — lines 140–220

Then produce a report with exactly these sections:

**A. Conditioning exercise inventory**
List every exercise in the catalogue where:
- `movement_class` is one of: `engine`, `carry`, `locomotion`, `cardio`, `conditioning`
- OR `movement_pattern_primary` is one of: `cyclical_engine`, `carry`, `hinge` (where `engine_role = 'hinge_ballistic'`), `locomotion`, `lunge`, `anti_extension`

For each exercise, show the exact values of: `exercise_id`, `movement_pattern_primary`, `swap_group_id_1`, `swap_group_id_2`, `engine_role`, `impact_level`, `density_rating`, `complexity_rank`, `preferred_in_json`, `equipment_items_slugs`, `min_fitness_rank`

**B. Current conditioning config slot definitions**
Extract the exact `ordered_slots` arrays from the conditioning config's `day_templates`. Show every slot field exactly as written.

**C. Slot coverage assessment**
For each slot in each day template, count how many exercises from section A match on `mp`, `sw`, or `requirePref`. Flag any slot with fewer than 3 matching exercises as a gap.

**D. isExcludedExercise behaviour for conditioning**
Show exactly what lines 140–220 of `01_buildProgramFromDefinition.js` do when `excludeMovementClasses` is an empty array and an exercise has `movement_class = 'engine'`. Confirm whether engine exercises pass through.

---

## PROMPT 2 — Fix Conditioning Config Slot Selectors

**Files to modify:** `migrations/R__seed_program_generation_config.sql`

**Context:** The conditioning config exists at `conditioning_default_v1`. Its slot selectors must use only catalogue-proven `mp` and `requirePref` values for Phase 1 — no `sw2` values that aren't confirmed in the catalogue. The `preferred_in_json` values confirmed in the catalogue are `"conditioning_main"` and `"finisher"`. The confirmed `movement_pattern_primary` values for conditioning exercises are: `cyclical_engine`, `locomotion`, `carry`, `hinge`, `lunge`, `anti_extension`.

**Exact changes to make:**

Replace the `day_templates` inside `conditioning_default_v1` with the following three day templates. Keep all other fields in the config unchanged (sets_by_duration, block_budget, segmentation, etc.).

**Day 1 — Power & Engine**
```json
{
  "day_key": "day1",
  "focus": "engine_power",
  "ordered_slots": [
    { "slot": "A:engine", "mp": "cyclical_engine", "requirePref": "conditioning_main" },
    { "slot": "B:locomotion", "mp": "locomotion", "requirePref": "conditioning_main" },
    { "slot": "C:carry", "mp": "carry", "fill_fallback_slot": "A:engine" },
    { "slot": "D:finisher", "mp": "locomotion", "requirePref": "finisher", "fill_fallback_slot": "B:locomotion" }
  ]
}
```

**Day 2 — Mixed Modal**
```json
{
  "day_key": "day2",
  "focus": "mixed_modal",
  "ordered_slots": [
    { "slot": "A:hinge", "mp": "hinge", "requirePref": "conditioning_main" },
    { "slot": "B:locomotion", "mp": "locomotion", "requirePref": "conditioning_main" },
    { "slot": "C:engine", "mp": "cyclical_engine", "fill_fallback_slot": "A:hinge" },
    { "slot": "D:carry", "mp": "carry", "fill_fallback_slot": "B:locomotion" }
  ]
}
```

**Day 3 — Aerobic Base**
```json
{
  "day_key": "day3",
  "focus": "aerobic_base",
  "ordered_slots": [
    { "slot": "A:engine", "mp": "cyclical_engine", "requirePref": "conditioning_main" },
    { "slot": "B:carry", "mp": "carry", "fill_fallback_slot": "A:engine" },
    { "slot": "C:lunge", "mp": "lunge", "fill_fallback_slot": "A:engine" },
    { "slot": "D:core", "mp": "anti_extension", "fill_fallback_slot": "B:carry" }
  ]
}
```

**Also replace the `block_semantics`** inside `conditioning_default_v1` with (Phase 1 — conservative, no amrap/emom yet):
```json
{
  "A": { "purpose": "main",      "preferred_segment_type": "single" },
  "B": { "purpose": "secondary", "preferred_segment_type": "superset" },
  "C": { "purpose": "accessory", "preferred_segment_type": "giant_set" },
  "D": { "purpose": "accessory", "preferred_segment_type": "single" }
}
```

**Also add `conditioning_thresholds`** to the conditioning config's builder JSON (used in Phase 4 — wire it now so Phase 4 can read it without another config migration):
```json
"conditioning_thresholds": {
  "high_impact_threshold":       2,
  "high_density_threshold":      2,
  "high_complexity_threshold":   2,
  "impact_adjacency_penalty":    [-3.0, -2.0, -1.0, -0.5],
  "density_adjacency_penalty":   [-2.0, -1.5, -0.5,  0.0],
  "density_complexity_penalty":  [-2.0, -1.5, -0.5,  0.0],
  "impact_daily_cap":            [2, 3, 4, 5],
  "impact_over_cap_penalty":     [-3.0, -2.0, -1.0, -0.5],
  "density_daily_cap":           [3, 4, 5, 6],
  "density_over_cap_penalty":    [-2.0, -1.5, -0.5, -0.2],
  "complexity_daily_cap":        [2, 3, 4, 5],
  "complexity_over_cap_penalty": [-2.0, -1.5, -0.5, -0.2],
  "density_bonus_multiplier":    [0.5,  0.8,  1.2,  1.5]
}
```

Arrays are indexed 0–3 = beginner to elite (maps to `fitness_rank` 0–3).

**Validation:** After editing, confirm the SQL is valid by checking the WHERE NOT EXISTS guard and that all jsonb_build_object / jsonb_build_array calls are balanced.

---

## PROMPT 3 — Make Coverage Report Config-Driven

**Files to modify:** `api/src/routes/adminCoverage.js`

**Problem:** The movement class exclusion in the coverage report SQL is hardcoded:
```sql
AND (ec.movement_class IS NULL OR ec.movement_class NOT IN ('cardio','conditioning','locomotion'))
```
This causes the coverage report to show 0 eligible exercises for all conditioning slots.

**Required change:** The exclusion must be driven by the config's `exclude_movement_classes` array — the same source that `01_buildProgramFromDefinition.js` already uses.

**Implementation:**

1. The coverage endpoint already receives `config_key` or `program_type` as a query parameter (check the existing handler to confirm exact param names).

2. Before building the slot coverage SQL, fetch the relevant config row from `program_generation_config` and extract `program_generation_config_json -> 'builder' -> 'exclude_movement_classes'` as a text array. If no config is found, fall back to `['cardio','conditioning','locomotion']`.

3. Pass the resulting array as a SQL parameter. Replace the hardcoded exclusion clause with:

```sql
AND (
  cardinality($excludedClasses::text[]) = 0
  OR ec.movement_class IS NULL
  OR ec.movement_class NOT IN (SELECT unnest($excludedClasses::text[]))
)
```

Where `$excludedClasses` is the array fetched from the config. An empty array means no classes are excluded (conditioning behaviour). The existing array `['cardio','conditioning','locomotion']` means those classes are excluded (hypertrophy/strength behaviour).

4. Do not add a special case for `program_type = 'conditioning'`. The exclusion list from the config is the only source of truth.

5. The existing `isConditioning()` override in Step 1 (`isExcludedExercise`, lines ~145–158) also excludes exercises where any of cardio/conditioning/locomotion is in the exclude set. Verify the coverage SQL aligns with this logic — the SQL should produce counts that match what the engine would actually select.

**Do not change** any other part of the coverage endpoint logic.

---

## PROMPT 4 — Conditioning Rep Rules

**Files to modify:** `migrations/R__seed_program_rep_rules.sql`

**Context:** Three basic conditioning rules already exist (`cond_main_single_v1`, `cond_secondary_single_v1`, `cond_accessory_single_v1`). These are too generic — they don't differentiate between a sustained engine effort (10-minute row) and a loaded carry (30-second effort) or a hinge ballistic (15 KB swings).

**Add the following rules** using the same INSERT ... WHERE NOT EXISTS pattern used for existing rules. Do not remove or modify existing rules.

**Rules to add:**

```sql
-- Global fallback: catches any conditioning exercise with no better match
rule_id: cond_global_fallback_v1
program_type: conditioning, priority: 1
purpose: NULL, segment_type: NULL, movement_pattern: NULL
rep_low: 10, rep_high: 15, reps_unit: 'reps'
rest_after_set_sec: 60

-- Sustained engine (LISS/aerobic): no rep count, time-based, no rest
rule_id: cond_main_engine_sustained_v1
program_type: conditioning, priority: 12
purpose: main, segment_type: single, movement_pattern: cyclical_engine
rep_low: NULL, rep_high: NULL, reps_unit: 'seconds'
rest_after_set_sec: 0
notes_style: 'time_based'

-- Locomotion main (box jumps, burpees, shuttle runs): low reps, high rest
rule_id: cond_main_locomotion_v1
program_type: conditioning, priority: 12
purpose: main, segment_type: single, movement_pattern: locomotion
rep_low: 6, rep_high: 10, reps_unit: 'reps'
rir_target: 0
rest_after_set_sec: 90

-- Hinge ballistic (KB swing, Russian KB swing): moderate-high reps, moderate rest
rule_id: cond_main_hinge_ballistic_v1
program_type: conditioning, priority: 12
purpose: main, segment_type: single, movement_pattern: hinge
rep_low: 10, rep_high: 15, reps_unit: 'reps'
rir_target: 1
rest_after_set_sec: 75

-- Carry: time-based (seconds), short rest
rule_id: cond_carry_v1
program_type: conditioning, priority: 11
purpose: NULL, segment_type: NULL, movement_pattern: carry
rep_low: 20, rep_high: 40, reps_unit: 'seconds'
rest_after_set_sec: 45

-- Secondary superset (circuit pairs): moderate reps, short rest
rule_id: cond_secondary_superset_v1
program_type: conditioning, priority: 10
purpose: secondary, segment_type: superset
rep_low: 8, rep_high: 12, reps_unit: 'reps'
rir_target: 1
rest_after_set_sec: 0
rest_after_round_sec: 60

-- Accessory giant_set (metabolic circuit): higher reps, very short rest
rule_id: cond_accessory_giant_set_v1
program_type: conditioning, priority: 10
purpose: accessory, segment_type: giant_set
rep_low: 10, rep_high: 15, reps_unit: 'reps'
rir_target: 0
rest_after_set_sec: 0
rest_after_round_sec: 45

-- Core / anti-extension accessory
rule_id: cond_accessory_core_v1
program_type: conditioning, priority: 10
purpose: accessory, segment_type: single, movement_pattern: anti_extension
rep_low: 20, rep_high: 30, reps_unit: 'seconds'
rest_after_set_sec: 30

-- Finisher: high output, very short rest
rule_id: cond_finisher_single_v1
program_type: conditioning, priority: 9
purpose: accessory, segment_type: single, movement_pattern: locomotion
rep_low: 10, rep_high: 20, reps_unit: 'reps'
rir_target: 0
rest_after_set_sec: 30
```

Use NULL for all unspecified columns (tempo, rir_min, rir_max, equipment_slug, etc.).

---

## PROMPT 5 — Conditioning Narration Templates

**Files to modify:** `migrations/R__seed_narration_template.sql`

**Context:** The narration template table already has general hypertrophy templates and some basic conditioning phase templates. We need conditioning-specific templates for program identity, day context, and segment execution. The template engine matches on (`scope`, `field`, `purpose`, `segment_type`) — more specific matches score higher.

**Add the following templates** using the same INSERT ... WHERE NOT EXISTS pattern as existing templates. Inspect the file first to confirm the exact INSERT syntax used, then match it exactly.

**Templates to add:**

**Program scope — conditioning identity**
```
template_id: cond_prog_title_v1
scope: program, field: PROGRAM_TITLE, priority: 10
applies_json: {"program_type": "conditioning"}
text_pool_json: ["Conditioning Programme", "Engine & Capacity", "Conditioning & Fitness"]
```

```
template_id: cond_prog_summary_v1
scope: program, field: PROGRAM_SUMMARY, priority: 10
applies_json: {"program_type": "conditioning"}
text_pool_json: ["A structured conditioning programme built around engine work, carries, and mixed modal efforts. Each session targets a different energy system."]
```

```
template_id: cond_prog_progression_v1
scope: program, field: PROGRESSION_BLURB, priority: 10
applies_json: {"program_type": "conditioning"}
text_pool_json: ["Progress by increasing effort or output each week — not by adding weight. The goal is to handle more work at the same or higher intensity."]
```

**Day scope — per focus type**
```
template_id: cond_day_title_engine_v1
scope: day, field: DAY_TITLE, priority: 10
applies_json: {"program_type": "conditioning", "day_focus": "engine_power"}
text_pool_json: ["Engine Day", "Power & Conditioning", "High-Output Session"]
```

```
template_id: cond_day_title_modal_v1
scope: day, field: DAY_TITLE, priority: 10
applies_json: {"program_type": "conditioning", "day_focus": "mixed_modal"}
text_pool_json: ["Mixed Modal Day", "Capacity & Ballistics", "Mixed Conditioning"]
```

```
template_id: cond_day_title_aerobic_v1
scope: day, field: DAY_TITLE, priority: 10
applies_json: {"program_type": "conditioning", "day_focus": "aerobic_base"}
text_pool_json: ["Aerobic Base Day", "Steady State & Chassis", "Endurance Session"]
```

```
template_id: cond_day_goal_v1
scope: day, field: DAY_GOAL, priority: 10
applies_json: {"program_type": "conditioning"}
text_pool_json: [
  "Focus on consistent output — not maximum effort on every set.",
  "Move well, breathe, and maintain pace across the session.",
  "Quality of effort matters more than speed today."
]
```

**Segment scope — conditioning execution**
```
template_id: cond_seg_exec_superset_v1
scope: segment, field: SEGMENT_EXECUTION, segment_type: superset, priority: 10
applies_json: {"program_type": "conditioning"}
text_pool_json: [
  "Move directly from exercise to exercise. Rest fully between rounds.",
  "Minimise transition time. The rest comes after the round, not between exercises."
]
```

```
template_id: cond_seg_exec_giant_v1
scope: segment, field: SEGMENT_EXECUTION, segment_type: giant_set, priority: 10
applies_json: {"program_type": "conditioning"}
text_pool_json: [
  "Move continuously through all exercises. Rest only after completing the full circuit.",
  "Keep transitions short. Your rest is earned — take it between rounds only."
]
```

```
template_id: cond_seg_title_main_v1
scope: segment, field: SEGMENT_TITLE, purpose: main, priority: 10
applies_json: {"program_type": "conditioning"}
text_pool_json: ["Primary Effort", "Main Engine Work", "Primary Block"]
```

```
template_id: cond_seg_title_secondary_v1
scope: segment, field: SEGMENT_TITLE, purpose: secondary, priority: 10
applies_json: {"program_type": "conditioning"}
text_pool_json: ["Capacity Block", "Circuit Work", "Secondary Effort"]
```

```
template_id: cond_seg_title_accessory_v1
scope: segment, field: SEGMENT_TITLE, purpose: accessory, priority: 10
applies_json: {"program_type": "conditioning"}
text_pool_json: ["Metabolic Finisher", "Accessory Circuit", "Conditioning Accessory"]
```

**Exercise scope**
```
template_id: cond_ex_cue_v1
scope: exercise, field: CUE_LINE, priority: 10
applies_json: {"program_type": "conditioning"}
text_pool_json: [
  "Control your breathing. Steady output beats one big burst.",
  "Pace yourself — the goal is consistent effort, not going all-out.",
  "Focus on mechanics under fatigue."
]
```

**Important:** Check how `applies_json` is actually used in the existing narration template matching code (`api/engine/steps/05_applyNarration.js`) before writing these inserts. If `applies_json` is not used in matching (i.e., templates are matched purely on scope/field/purpose/segment_type), then drop `applies_json` from the inserts and rely on the existing priority system to differentiate conditioning templates by setting a higher priority number than existing generic templates. Do not add a field or matching path that doesn't exist in the engine.

---

## PROMPT 6 — AMRAP and EMOM Segment Types (Phase 3)

**Files to modify:**
1. `api/engine/configValidation.js`
2. `api/engine/steps/02_segmentProgram.js`
3. `api/admin/index.html`

**Part A: Config validation**

Find the line in `configValidation.js` that reads:
```javascript
if (!["single","superset","giant_set"].includes(sem.preferred_segment_type))
```
Replace with:
```javascript
if (!["single","superset","giant_set","amrap","emom"].includes(sem.preferred_segment_type))
```

**Part B: Step 2 segmentation**

In `02_segmentProgram.js`, find the section that dispatches on `preferred_segment_type` (the switch/if-else over "single", "superset", "giant_set"). Add two new branches following the same pattern as the existing ones.

**`amrap` branch:**
- Group up to 4 exercises from the block (same cap logic as giant_set but cap = 4)
- If group has only 1 exercise: treat as `single`
- If 2–4 exercises: combine into one segment with `segment_type: "amrap"`
- `rounds` = `deriveRounds(items)` using the same helper as giant_set
- All items normalised to `sets: 1` (same as superset/giant_set)
- Overflow exercises (index 4+) each become individual `single` segments

**`emom` branch:**
- Group up to 4 exercises (one per minute slot in the EMOM)
- If group has only 1 exercise: treat as `single`
- If 2–4 exercises: combine into one segment with `segment_type: "emom"`
- `rounds` = `deriveRounds(items)`
- All items normalised to `sets: 1`
- Overflow to `single`

Both branches must use the exact same helper functions (`deriveRoundsAndNormalizeItems`, `mkItems`, etc.) already used by the superset and giant_set branches. Do not introduce new helper functions.

**Part C: Admin editor dropdown**

In `api/admin/index.html`, find the `preferred_segment_type` select element inside the segmentation section. It currently has options for `single`, `superset`, `giant_set`. Add `amrap` and `emom` as additional options after `giant_set`.

---

## PROMPT 7 — AMRAP and EMOM Rep Rules and Narration

**Files to modify:**
1. `migrations/R__seed_program_rep_rules.sql`
2. `migrations/R__seed_narration_template.sql`
3. `migrations/R__seed_program_generation_config.sql`

**Part A: Rep rules for amrap and emom**

Add to `R__seed_program_rep_rules.sql`:

```
rule_id: cond_main_amrap_v1
program_type: conditioning, priority: 15
purpose: main, segment_type: amrap
rep_low: 5, rep_high: 8, reps_unit: reps
rest_after_set_sec: 0      -- no rest between items in amrap
rest_after_round_sec: 0    -- amrap has no fixed round rest (session ends at time cap)
notes_style: rounds_based

rule_id: cond_secondary_emom_v1
program_type: conditioning, priority: 15
purpose: secondary, segment_type: emom
rep_low: 5, rep_high: 8, reps_unit: reps
rest_after_set_sec: 0      -- rest is remaining time in the minute (implicit)
rest_after_round_sec: 0
notes_style: emom_based
```

**Part B: Narration templates for amrap and emom**

Add to `R__seed_narration_template.sql`:

```
template_id: seg_exec_amrap_v1
scope: segment, field: SEGMENT_EXECUTION, segment_type: amrap, priority: 8
text_pool_json: [
  "Complete as many rounds as possible in the time cap. Log total rounds completed.",
  "Start conservatively — the goal is consistent pace through the full time cap."
]

template_id: seg_title_amrap_v1
scope: segment, field: SEGMENT_TITLE, segment_type: amrap, priority: 8
text_pool_json: ["AMRAP", "As Many Rounds As Possible", "Max Effort Block"]

template_id: seg_exec_emom_v1
scope: segment, field: SEGMENT_EXECUTION, segment_type: emom, priority: 8
text_pool_json: [
  "Every minute on the minute: complete your reps, then rest for the remainder of the minute.",
  "Start each minute on the clock. Rest is whatever time remains after your reps."
]

template_id: seg_title_emom_v1
scope: segment, field: SEGMENT_TITLE, segment_type: emom, priority: 8
text_pool_json: ["EMOM", "Every Minute On the Minute", "Interval Block"]
```

**Part C: Update conditioning config to use amrap and emom**

In `R__seed_program_generation_config.sql`, update the `block_semantics` inside `conditioning_default_v1` to:

```json
{
  "A": { "purpose": "main",      "preferred_segment_type": "amrap" },
  "B": { "purpose": "secondary", "preferred_segment_type": "emom" },
  "C": { "purpose": "accessory", "preferred_segment_type": "giant_set" },
  "D": { "purpose": "accessory", "preferred_segment_type": "single" }
}
```

---

## PROMPT 8 — Sequence-Aware Conditioning Scoring

**Files to create/modify:**
1. Create: `api/engine/conditioningScoring.js`
2. Modify: `api/engine/exerciseSelector.js`
3. Modify: `api/engine/selectorStrategies.js`
4. Modify: `api/engine/steps/01_buildProgramFromDefinition.js`

This is Phase 4. Read the current versions of all four files in full before making any changes.

---

### Part A: Create `api/engine/conditioningScoring.js`

```javascript
// api/engine/conditioningScoring.js
//
// Sequence-aware scoring for conditioning programs.
// Called from pickBest() when programType === 'conditioning'.
// Returns a score adjustment (≤ 0 penalty, or small positive bonus).
// Uses impact_level, density_rating, and complexity_rank directly.
// engine_role is supplementary only.
//
// Penalty arrays are indexed by fitness_rank (0=beginner, 1=intermediate,
// 2=advanced, 3=elite). Higher rank = milder penalty.

export function scoreConditioningSequence(candidate, condState, rankValue, thresholds) {
  // thresholds come from compiledConfig.builder.conditioning_thresholds
  // All arrays are length 4 (one value per rank). Defaults used if absent.

  const rank = Math.max(0, Math.min(3, rankValue ?? 0));

  const {
    high_impact_threshold      = 2,
    high_density_threshold     = 2,
    high_complexity_threshold  = 2,

    impact_adjacency_penalty    = [-3.0, -2.0, -1.0, -0.5],
    density_adjacency_penalty   = [-2.0, -1.5, -0.5,  0.0],
    density_complexity_penalty  = [-2.0, -1.5, -0.5,  0.0],

    impact_daily_cap            = [2, 3, 4, 5],
    impact_over_cap_penalty     = [-3.0, -2.0, -1.0, -0.5],

    density_daily_cap           = [3, 4, 5, 6],
    density_over_cap_penalty    = [-2.0, -1.5, -0.5, -0.2],

    complexity_daily_cap        = [2, 3, 4, 5],
    complexity_over_cap_penalty = [-2.0, -1.5, -0.5, -0.2],

    density_bonus_multiplier    = [0.5, 0.8, 1.2, 1.5],
  } = thresholds ?? {};

  const candidateImpact     = candidate.impact_level    ?? 0;
  const candidateDensity    = candidate.den              ?? 0;  // density_rating
  const candidateComplexity = candidate.cx               ?? 0;  // complexity_rank

  const prevImpact     = condState.lastImpactLevel    ?? 0;
  const prevDensity    = condState.lastDensityRating  ?? 0;
  const prevComplexity = condState.lastComplexityRank ?? 0;

  let penalty = 0;

  // ── Adjacency penalties ────────────────────────────────────────────────────

  // High impact following high impact (e.g., box jump after sprint)
  if (prevImpact >= high_impact_threshold && candidateImpact >= high_impact_threshold) {
    penalty += impact_adjacency_penalty[rank] ?? -1.0;
  }

  // High density following high density (back-to-back dense efforts)
  if (prevDensity >= high_density_threshold && candidateDensity >= high_density_threshold) {
    penalty += density_adjacency_penalty[rank] ?? -0.5;
  }

  // High complexity following high density (complex movement under metabolic fatigue)
  if (prevDensity >= high_density_threshold && candidateComplexity >= high_complexity_threshold) {
    penalty += density_complexity_penalty[rank] ?? -0.5;
  }

  // ── Daily soft caps ────────────────────────────────────────────────────────

  const capImpact     = Array.isArray(impact_daily_cap)     ? (impact_daily_cap[rank]     ?? 4) : impact_daily_cap;
  const capDensity    = Array.isArray(density_daily_cap)    ? (density_daily_cap[rank]    ?? 5) : density_daily_cap;
  const capComplexity = Array.isArray(complexity_daily_cap) ? (complexity_daily_cap[rank] ?? 4) : complexity_daily_cap;

  if (candidateImpact >= high_impact_threshold) {
    const overImpact = Math.max(0, condState.highImpactCountToday + 1 - capImpact);
    if (overImpact > 0) {
      penalty += (impact_over_cap_penalty[rank] ?? -1.0) * overImpact;
    }
  }

  if (candidateDensity >= high_density_threshold) {
    const overDensity = Math.max(0, condState.highDensityCountToday + 1 - capDensity);
    if (overDensity > 0) {
      penalty += (density_over_cap_penalty[rank] ?? -0.5) * overDensity;
    }
  }

  if (candidateComplexity >= high_complexity_threshold) {
    const overComplexity = Math.max(0, condState.highComplexityCountToday + 1 - capComplexity);
    if (overComplexity > 0) {
      penalty += (complexity_over_cap_penalty[rank] ?? -0.5) * overComplexity;
    }
  }

  // ── Density bonus (scaled by rank — elite athletes benefit more) ───────────
  const bonusMultiplier = Array.isArray(density_bonus_multiplier)
    ? (density_bonus_multiplier[rank] ?? 1.0)
    : density_bonus_multiplier;
  const densityBonus = candidateDensity * bonusMultiplier * 0.1;  // keep bonus small

  return penalty + densityBonus;
}
```

---

### Part B: Extend `api/engine/exerciseSelector.js`

Find the `pickBest()` function. Near the end of the scoring section (after all existing score calculations, before the `return` that picks the max scorer), add:

```javascript
// Conditioning sequence scoring (no-op for non-conditioning programs)
if (sel.programType === 'conditioning' && sel.condState) {
  score += scoreConditioningSequence(
    ex,
    sel.condState,
    sel.rankValue ?? 0,
    sel.condThresholds ?? {}
  );
}
```

Add the import at the top of the file:
```javascript
import { scoreConditioningSequence } from './conditioningScoring.js';
```

Do not change any other part of `pickBest()` or any other function.

---

### Part C: Extend `api/engine/selectorStrategies.js`

In the `best_match_by_movement` strategy function, find where the `sel` object is built (the object that sets `mp`, `sw`, `sw2`, `requirePref`, `preferLoadable`, `preferIsolation`, `preferCompound`).

**Add these fields to `sel`:**
```javascript
sel.programType    = compiledConfig?.programType ?? null;
sel.rankValue      = builderState?.rankValue ?? 0;
sel.condState      = builderState?.conditioning ?? null;
sel.condThresholds = compiledConfig?.builder?.conditioningThresholds ?? {};
```

**Also suppress the compound/isolation auto-bias for conditioning:**
```javascript
const isConditioning = compiledConfig?.programType === 'conditioning';
sel.preferCompound  = !isConditioning && (slotDef.slot?.[0] === 'A');
sel.preferIsolation = !isConditioning && (slotDef.slot?.[0] === 'C');
```

**Important:** The `fillSlot()` function in `selectorStrategies.js` currently receives `(slotDef, catalogIndex, state)`. Check whether `compiledConfig` is already accessible inside this function (it may be passed as part of `state` or `catalogIndex`). If not, check how it is passed from Step 1 and thread it through the minimum number of call sites without changing the public API contract. Do not change the signature of `fillSlot()` itself if it would break Step 1's call site — instead read how Step 1 calls `fillSlot` and pass compiledConfig via the `state` object if that is already the mechanism.

---

### Part D: Extend `01_buildProgramFromDefinition.js`

**1. Add `rankValue` to `builderState`:**

Find where `builderState` is constructed (the object with `usedIdsWeek`, `usedSw2Today`, `usedRegionsToday`, `stats`). Add:
```javascript
rankValue: Number.isFinite(Number(rankValue)) ? Number(rankValue) : 0,
```
where `rankValue` comes from the client profile's `fitness_rank` (already available in the build inputs).

**2. Add `conditioning` sub-object to `builderState`:**

```javascript
conditioning: {
  lastImpactLevel:      0,
  lastDensityRating:    0,
  lastComplexityRank:   0,
  lastEngineRole:       null,
  highImpactCountToday:    0,
  highDensityCountToday:   0,
  highComplexityCountToday: 0,
},
```

**3. Reset per-day conditioning state:**

At the start of each day iteration (the loop over day templates), reset:
```javascript
if (builderState.conditioning) {
  builderState.conditioning.lastImpactLevel      = 0;
  builderState.conditioning.lastDensityRating    = 0;
  builderState.conditioning.lastComplexityRank   = 0;
  builderState.conditioning.lastEngineRole       = null;
  builderState.conditioning.highImpactCountToday    = 0;
  builderState.conditioning.highDensityCountToday   = 0;
  builderState.conditioning.highComplexityCountToday = 0;
}
```

**4. Update conditioning state after each exercise is selected:**

After the block where `usedIdsWeek`, `usedSw2Today`, and `usedRegionsToday` are updated, add:
```javascript
if (builderState.conditioning && ex) {
  const c = builderState.conditioning;
  const impact     = ex.impact_level    ?? ex.impactLevel    ?? 0;
  const density    = ex.den             ?? 0;
  const complexity = ex.cx              ?? 0;
  const HIGH_IMPACT     = compiledConfig?.builder?.conditioningThresholds?.high_impact_threshold     ?? 2;
  const HIGH_DENSITY    = compiledConfig?.builder?.conditioningThresholds?.high_density_threshold    ?? 2;
  const HIGH_COMPLEXITY = compiledConfig?.builder?.conditioningThresholds?.high_complexity_threshold ?? 2;

  c.lastImpactLevel      = impact;
  c.lastDensityRating    = density;
  c.lastComplexityRank   = complexity;
  c.lastEngineRole       = ex.engine_role ?? ex.engineRole ?? null;

  if (impact     >= HIGH_IMPACT)     c.highImpactCountToday++;
  if (density    >= HIGH_DENSITY)    c.highDensityCountToday++;
  if (complexity >= HIGH_COMPLEXITY) c.highComplexityCountToday++;
}
```

**Important notes for Part D:**
- `ex` here is the normalised exercise object from the index (short field names: `den`, `cx`, `impact_level`). Check the actual field names used in the index by reading `buildIndex()` in `exerciseSelector.js` before writing this code.
- The reset must happen BEFORE each day's slot loop, not once at program start.
- `usedIdsWeek` is NOT reset per day (it persists across the week). The conditioning state IS reset per day. This is intentional.
- Do not change the public API of `buildProgramFromDefinition` or `runPipeline`.

---

## After Prompt 8 — Validation Checklist

Run the following checks before considering the implementation complete:

1. **Generate a conditioning program for rank 0 (beginner):** Confirm no two consecutive high-impact exercises appear in any day. Check debug stats for `sequencePenaltyLog` if you added it, or trace the `avoided_repeat_sw2` equivalent for conditioning.

2. **Generate a conditioning program for rank 3 (elite):** Confirm high-impact combinations are permitted (mild penalty should not prevent them).

3. **Generate a hypertrophy program:** Confirm scoring is identical to pre-patch. The conditioning scoring layer must be a complete no-op for non-conditioning programs.

4. **Run the coverage report for `conditioning_default_v1`:** Confirm engine, carry, and locomotion exercises appear in slot counts. No slot should show 0 for commercial_gym at rank 1.

5. **Check AMRAP and EMOM segments:** Generate a conditioning program in Phase 3 config. Confirm Block A segments have `segment_type: "amrap"` and Block B has `segment_type: "emom"`.

---

*Prompts authored: 2026-03-07*
*Based on: docs/conditioning-program-spec.md + codebase audit*
