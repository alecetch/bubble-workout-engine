# Interval Narration Suppression Spec

## Goal

Suppress strength-style narration and metadata for interval-style work so locomotion/conditioning slots do not show irrelevant cues, load advice, logging prompts, RIR, or tempo.

This spec covers two related problems:

1. `CUE_LINE`, `LOAD_HINT`, and `LOGGING_PROMPT` should be absent for:
   - locomotion/conditioning work
   - distance/time-based prescriptions
2. RIR and tempo should be absent at the rep-rule level for interval work, and blank values must stay blank instead of being coerced to `0`.

## Current Behavior

### Narration

Exercise narration is built in [api/engine/steps/05_applyNarration.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/05_applyNarration.js).

- `CUE_LINE`, `LOAD_HINT`, and `LOGGING_PROMPT` are selected once per day context, then applied to every item in the day.
- Exercise cues currently use hardcoded default tokens:
  - `CUE_1 = "brace and stay tight"`
  - `CUE_2 = "control the eccentric"`
- `EXERCISE_LINE` is generated from generic templates that assume strength-style concepts such as RIR and tempo.

Relevant code:

- [api/engine/steps/05_applyNarration.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/05_applyNarration.js#L539)
- [api/engine/steps/05_applyNarration.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/05_applyNarration.js#L653)

### Preview rendering

The compact preview row is rendered directly from item fields in [api/admin/preview.html](/c:/Users/alecp/bubble-workout-engine/api/admin/preview.html#L341):

- shows `reps_prescribed`
- shows `tempo_prescribed` whenever present
- shows `RIR {rir_target}` whenever `rir_target != null`

This means narration-template changes alone will not remove `0-0-0-0` and `RIR 0` from the compact preview line.

### Rep rules

Rep rules are applied in [api/engine/steps/04_applyRepRules.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/04_applyRepRules.js), which only writes values when the rule field is non-blank.

However, rep-rule creation currently coerces blank interval fields to zero in [api/src/routes/adminRepRules.js](/c:/Users/alecp/bubble-workout-engine/api/src/routes/adminRepRules.js#L314):

- `rir_min` -> `toInt(body.rir_min, 0)`
- `rir_max` -> `toInt(body.rir_max, 0)`
- `rir_target` -> `toInt(body.rir_target, 0)`
- `rest_after_set_sec` / `rest_after_round_sec` also default to `0`

Conclusion:

- Source-data cleanup is necessary to remove interval RIR/tempo values from seeded rules.
- A small code tweak is also necessary so blank interval rule fields stay `null`/blank instead of becoming `0` on create/update/import paths.

## Problem Statement

For interval work such as running, rowing, ski erg, or other locomotion/conditioning slots prescribed in meters, calories, or seconds:

- strength-style cues are misleading
- load progression advice is misleading
- “track top set” logging advice is misleading
- RIR is not meaningful
- tempo is not meaningful

The output should feel intentionally sparse rather than incorrectly strength-oriented.

## Proposed Behavior

### 1. Suppress exercise-level narration fields for interval-style work

For any exercise item matching either of these conditions:

- movement pattern is `locomotion` or `conditioning`
- prescription unit is distance/time-based:
  - `m`
  - `seconds`
  - `cal`

the pipeline should emit empty values for:

- `item.narration.cues`
- `item.narration.load_hint`
- `item.narration.log_prompt`

Optional extension:

- also emit a simplified `item.narration.line` that does not mention tempo or RIR when the same interval-style conditions apply

### 2. Suppress RIR and tempo at source for interval work

Rep rules for interval-style work should store:

- `rir_min = null`
- `rir_max = null`
- `rir_target = null`
- `tempo_eccentric = null`
- `tempo_pause_bottom = null`
- `tempo_concentric = null`
- `tempo_pause_top = null`

This should apply to rules intended for interval work, typically matched by one or more of:

- `movement_pattern = locomotion`
- `movement_pattern = conditioning`
- `swap_group_id_2` families such as `run_interval`
- `reps_unit IN ("m", "seconds", "cal")`

### 3. Keep blank interval fields blank through admin/API flows

Rep-rule create/update handling should preserve blanks as `null` for interval-compatible fields rather than coercing them to `0`.

Minimum required change:

- replace `toInt(body.rir_min, 0)`, `toInt(body.rir_max, 0)`, and `toInt(body.rir_target, 0)` with nullable parsing

Recommended consistency change:

- allow nullable tempo fields in any relevant create/update/import flow as well

### 4. Suppress compact preview metadata when blank

No preview-specific branching is needed if interval rep rules truly stop writing RIR and tempo.

Once the item fields are absent:

- [api/admin/preview.html](/c:/Users/alecp/bubble-workout-engine/api/admin/preview.html#L345) will naturally stop rendering those fragments

If a fallback path can still inject `0` values, add a defensive UI rule:

- do not render tempo if it is exactly `0-0-0-0`
- do not render RIR if it is `0` and the item is interval-style

This UI guard is optional but recommended as belt-and-braces protection.

## Matching Rule For Suppression

Introduce a shared helper concept such as `isIntervalStyleItem(item, ex)` or equivalent.

An item is interval-style when any of the following is true:

1. `item.reps_unit` is `m`, `seconds`, or `cal`
2. exercise movement pattern is `locomotion` or `conditioning`
3. exercise `swap_group_id_2` indicates an interval family such as `run_interval`

Recommended precedence:

- `reps_unit` is strongest because it reflects the final applied prescription
- movement pattern provides a good fallback when unit is missing

## Data Changes

### Required

Clean up seeded or source rep rules for interval work so they no longer contain:

- `rir_* = 0`
- `tempo_* = 0`

Likely source of truth:

- exported rep-rule CSVs such as `result_export program rep rules.csv`
- any sync/import path that seeds `program_rep_rule`

### Optional but useful

Add HYROX/conditioning-specific `EXERCISE_LINE` narration templates that avoid tempo/RIR phrasing.

This is complementary, not sufficient on its own.

## Code Changes

### A. Narration suppression

File:

- [api/engine/steps/05_applyNarration.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/05_applyNarration.js)

Change:

- before assigning `cues`, `load_hint`, and `log_prompt`, detect interval-style items
- if interval-style:
  - set those fields to `""`
  - optionally choose an interval-safe exercise line branch

### B. Rep-rule null preservation

File:

- [api/src/routes/adminRepRules.js](/c:/Users/alecp/bubble-workout-engine/api/src/routes/adminRepRules.js)

Change:

- use nullable parsing for:
  - `rir_min`
  - `rir_max`
  - `rir_target`
- if tempo fields are added to editable/create flows, make them nullable too

Potential helper:

- `toNullableInt(value)` already exists in this file and should be reused

### C. Optional preview hardening

File:

- [api/admin/preview.html](/c:/Users/alecp/bubble-workout-engine/api/admin/preview.html)

Change:

- optionally suppress display of:
  - `tempo_prescribed` when equal to `0-0-0-0`
  - `RIR 0` when the item is interval-style

This is not the primary fix. The primary fix is to stop generating those values upstream.

## Acceptance Criteria

### Narration

For a HYROX run interval or similar locomotion/conditioning item with `reps_unit = "m"`:

- no `cues` text is emitted
- no `load_hint` text is emitted
- no `log_prompt` text is emitted

### Rep rules

For interval-targeted rules:

- `rir_min`, `rir_max`, and `rir_target` can be stored as `null`
- tempo fields can be stored as `null`
- creating or updating such rules with blank values does not convert them to `0`

### Preview

For interval-style items:

- the compact preview row does not show `0-0-0-0`
- the compact preview row does not show `RIR 0`

## Test Plan

### Unit tests

Add or update tests for:

- narration suppression for interval-style items in [api/engine/steps/__tests__/05_applyNarration.test.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/__tests__/05_applyNarration.test.js)
- rep-rule create/update nullable parsing in route tests near [api/src/routes/__tests__](/c:/Users/alecp/bubble-workout-engine/api/src/routes/__tests__)
- preview rendering logic if UI hardening is added

### Manual verification

Use `/admin/preview` with a HYROX config and confirm:

1. interval items still show exercise name and prescription
2. interval items do not show cues/load/logging narration
3. interval items do not show tempo or RIR in the compact metadata line
4. strength items remain unchanged

## Rollout Notes

Recommended order:

1. Clean interval rep-rule source data
2. Ship nullable rep-rule parsing so blanks stay blank
3. Ship narration suppression for interval-style items
4. Optionally add preview hardening as a final safeguard

This sequencing avoids a partial rollout where cleaned source data is re-coerced to zero by the API layer.
