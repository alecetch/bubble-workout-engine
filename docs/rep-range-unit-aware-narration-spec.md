# Rep Range Unit-Aware Narration Spec

## Goal

Fix exercise narration so plain rep prescriptions render with the word `reps` where appropriate, without breaking distance/time/calorie prescriptions that already include their unit.

Examples:

- desired: `Dumbbell Thruster: 1 x 15-20 reps`
- keep: `Run Interval (Outdoor or Treadmill): 1 x 400 m`
- keep: `Bike Erg: 1 x 30 seconds`

This should be a code fix, not a narration-template-only fix.

## Problem Summary

Today, `EXERCISE_LINE` templates rely on `{REP_RANGE}`, which is populated from `item.reps_prescribed`.

That field is generated in [04_applyRepRules.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/04_applyRepRules.js):

- if `reps_unit = reps`, output is `15-20`
- if `reps_unit = m`, output is `400 m`
- if `reps_unit = seconds`, output is `30 seconds`

So the same narration template:

```text
{EX_NAME}: {SETS} x {REP_RANGE}
```

produces:

- `1 x 15-20`
- `1 x 400 m`

This is consistent, but not ideal for plain reps.

## Recommendation

Add a new narration token that is explicitly unit-aware, and keep the existing `{REP_RANGE}` token unchanged for backward compatibility.

Recommended token name:

- `PRESCRIPTION_TEXT`

Note:

- `REPS_TEXT` would also be acceptable and is slightly more stylistically consistent with existing token names.
- This spec uses `PRESCRIPTION_TEXT` because it is semantically clear and safely covers non-rep units too.

Definition:

- for `reps_unit = reps`: `15-20 reps`
- for `reps_unit = m`: `400 m`
- for `reps_unit = seconds`: `30 seconds`
- for `reps_unit = cal`: `20 cal`
- if no prescription exists: fall back to the current rep-range default behavior

This keeps:

- preview compact metadata unchanged unless we deliberately choose to update it later
- existing templates compatible
- interval-style outputs safe

## Why This Is Better Than Editing the Template

A template-only change such as:

```text
{EX_NAME}: {SETS} x {REP_RANGE} reps
```

would break unit-based prescriptions:

- bad: `1 x 400 m reps`
- bad: `1 x 30 seconds reps`

The issue is not template selection. It is that the current token is not unit-aware.

## Scope

### Change 1: `api/engine/steps/05_applyNarration.js`

Add a helper to derive a narration-safe prescription string from:

- `item.reps_prescribed`
- `item.reps_unit`

Suggested behavior:

1. Read `item.reps_prescribed` as the base value.
2. Normalize `item.reps_unit`.
3. If unit is blank or `reps`, append ` reps` to the base value.
4. If unit is `m`, `seconds`, or `cal`, return the base value unchanged.
5. If base value is blank, fall back to the existing default rep-range logic.

Recommended helper signature:

```js
function buildPrescriptionText(item, fallbackRepRange)
```

Clarification:

- `fallbackRepRange` should be the already-resolved rep-range string from the current call site, after existing fallback/default-fill logic has run.
- In other words, this should be the final resolved value currently assigned to `repRange`, not the raw unresolved `item.reps_prescribed`.
- The helper should read `item.reps_unit` directly from `item`.

Then add this token to `exTokens`:

```js
PRESCRIPTION_TEXT: ...
```

Keep the existing tokens unchanged:

- `REP_RANGE`
- `SETS`
- `RIR`
- `TEMPO`

### Change 2: narration template seed data

Update the active `EXERCISE_LINE` templates in [R__seed_narration_template.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__seed_narration_template.sql) to use:

```text
{EX_NAME}: {SETS} x {PRESCRIPTION_TEXT}
```

instead of:

```text
{EX_NAME}: {SETS} x {REP_RANGE}
```

Update all four active exercise-line templates that currently use `{REP_RANGE}`:

- `ex_line_main`
- `ex_line_main_copy`
- `ex_line_secondary`
- `ex_line_accessory`

No matcher changes are needed.

### Change 3: reword one `ex_line_main` pool variant

One current `ex_line_main` pool entry uses:

```text
{EX_NAME}: {SETS} sets in the {REP_RANGE} range. Keep {RIR} RIR and controlled tempo ({TEMPO}).
```

This should not be updated mechanically to:

```text
{EX_NAME}: {SETS} sets in the {PRESCRIPTION_TEXT} range.
```

because plain-rep outputs would become awkward:

```text
6-8 reps range
```

Instead, rewrite that specific variant to remove the trailing word `range`, for example:

```text
{EX_NAME}: {SETS} sets in the {PRESCRIPTION_TEXT}. Keep {RIR} RIR and controlled tempo ({TEMPO}).
```

The other affected templates can be updated by straightforward token replacement if their surrounding copy still reads naturally.

## What Should Not Change

- `item.reps_prescribed` formatting in [04_applyRepRules.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/04_applyRepRules.js)
- compact item metadata rendering in [preview.html](/c:/Users/alecp/bubble-workout-engine/api/admin/preview.html), unless separately requested
- rep rule storage
- narration matching logic

This should remain a small narration-layer enhancement plus a seed-template update.

## Acceptance Criteria

1. In Program Preview, a plain-rep item such as Dumbbell Thruster renders:
   - `line: Dumbbell Thruster: 1 x 15-20 reps`
2. A distance item such as Run Interval still renders:
   - `line: Run Interval (Outdoor or Treadmill): 1 x 400 m`
3. A seconds-based item still renders:
   - `line: ... 1 x 30 seconds`
4. All four active `EXERCISE_LINE` templates listed above are updated together, so plain-rep wording is consistent across main, secondary, and accessory contexts.
5. Existing templates elsewhere that still use `{REP_RANGE}` continue to work.
6. No changes are required to rep-rule data.

## Test Plan

Add focused tests in [05_applyNarration.test.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/__tests__/05_applyNarration.test.js):

1. plain reps item
   - input: `reps_prescribed = "15-20"`, `reps_unit = "reps"`
   - expect line token expansion to produce `15-20 reps`

2. meter item
   - input: `reps_prescribed = "400 m"`, `reps_unit = "m"`
   - expect unchanged `400 m`

3. seconds item
   - input: `reps_prescribed = "30 seconds"`, `reps_unit = "seconds"`
   - expect unchanged `30 seconds`

4. backward compatibility
   - template using `{REP_RANGE}` still produces current output

## Migration / Rollout Notes

No DB migration is required.

Suggested rollout order:

1. add `PRESCRIPTION_TEXT` token in code
2. add tests
3. update the four active `EXERCISE_LINE` template pools in [R__seed_narration_template.sql](/c:/Users/alecp/bubble-workout-engine/migrations/R__seed_narration_template.sql)
4. verify in `/admin/preview`

## Final Recommendation

Implement a new unit-aware narration token, `PRESCRIPTION_TEXT`, and migrate `EXERCISE_LINE` templates to use it.

This is the smallest clean fix because it:

- solves `15-20` vs `15-20 reps`
- preserves `400 m`
- preserves backward compatibility
- avoids coupling template content to rep-unit assumptions
- updates the seed source of truth, so the fix survives Flyway reruns
