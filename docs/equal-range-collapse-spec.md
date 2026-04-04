# Equal Range Collapse Spec

## Goal

When a prescription range has the same low and high value, display it as a single value instead of a duplicated range.

Example:

- current: `1 x 400-400 m`
- desired: `1 x 400 m`

This should also apply to other equal-value prescriptions:

- `9-9` -> `9`
- `30-30 seconds` -> `30 seconds`
- `12-12 cal` -> `12 cal`

## Problem

The current output treats any case where both `rep_low` and `rep_high` are present as a range, even when the values are equal.

That produces awkward copy such as:

- `400-400 m`
- `9-9`

This awkward formatting then appears in multiple downstream surfaces because the formatted value is stored as `reps_prescribed`.

## Current Source Of Truth

Equal-value range strings are generated in:

- [api/engine/steps/04_applyRepRules.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/04_applyRepRules.js#L52)

Current logic:

- if both `rep_low` and `rep_high` are > 0, it emits `${loN}-${hiN}`
- units like `m`, `seconds`, and `cal` are appended afterward

Because `reps_prescribed` is written at this stage, the duplicated range propagates into:

- `/admin/preview` compact item display in [api/admin/preview.html](/c:/Users/alecp/bubble-workout-engine/api/admin/preview.html#L341)
- narration exercise lines in [api/engine/steps/05_applyNarration.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/05_applyNarration.js#L666)
- any downstream emitters or readers that reuse `reps_prescribed`

## Proposed Change

### Preferred approach

Change `formatRepRange(lo, hi, repsUnit)` in [api/engine/steps/04_applyRepRules.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/04_applyRepRules.js#L52) so that:

1. when `loN > 0` and `hiN > 0` and `loN !== hiN`
   - emit the current range form: `${loN}-${hiN}`
2. when `loN > 0` and `hiN > 0` and `loN === hiN`
   - emit a single value: `${loN}`
3. unit formatting remains unchanged
   - `400 m`
   - `30 seconds`
   - `12 cal`

### Why this is the smallest clean fix

This is preferable to a preview-only display patch because:

- it fixes the root formatting once
- it automatically improves narration output
- it keeps all downstream consumers consistent

## Non-Goals

This spec does not change:

- the underlying `rep_low` / `rep_high` values stored in rule data
- how true ranges behave, such as `6-8` or `300-500 m`
- strength/conditioning matching logic

## Expected Behavior

Examples after the change:

- `rep_low=400`, `rep_high=400`, `reps_unit="m"` -> `400 m`
- `rep_low=9`, `rep_high=9`, `reps_unit="reps"` -> `9`
- `rep_low=30`, `rep_high=30`, `reps_unit="seconds"` -> `30 seconds`
- `rep_low=12`, `rep_high=15`, `reps_unit="reps"` -> `12-15`
- `rep_low=300`, `rep_high=500`, `reps_unit="m"` -> `300-500 m`

## Code Changes

### Primary

File:

- [api/engine/steps/04_applyRepRules.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/04_applyRepRules.js)

Function:

- `formatRepRange(lo, hi, repsUnit)`

Change:

- collapse equal low/high pairs to a single scalar string before appending unit text

### No additional changes required

If the upstream formatter is updated, these surfaces should improve automatically:

- [api/admin/preview.html](/c:/Users/alecp/bubble-workout-engine/api/admin/preview.html)
- [api/engine/steps/05_applyNarration.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/05_applyNarration.js)
- any consumers of `item.reps_prescribed`

## Test Impact

There is already a test that encodes the old behavior:

- [api/engine/steps/__tests__/04_applyRepRules.test.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/__tests__/04_applyRepRules.test.js#L119)

Current expectation appears to be:

- `9-9`

That test should be updated to expect:

- `9`

Add or update tests to cover:

1. equal reps range collapses
2. equal meter range collapses
3. equal seconds range collapses
4. unequal ranges remain unchanged

## Acceptance Criteria

1. In `/admin/preview`, an item that previously showed `1 x 400-400 m` now shows `1 x 400 m`.
2. The narration line for the same item uses `400 m`, not `400-400 m`.
3. A normal unequal range like `8-12` remains unchanged.
4. Existing rep-rule matching and item enrichment behavior are unchanged apart from string formatting.

## Rollout Notes

This is a low-risk formatting change, but because it changes a shared formatted field, it should be treated as a deliberate output-contract tweak.

Recommended rollout:

1. update `formatRepRange`
2. update focused tests in `04_applyRepRules.test.js`
3. manually verify one equal-range interval item and one standard strength range in `/admin/preview`
