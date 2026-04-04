# Preview Compact Meta Unit-Aware Spec

## Goal

Make the compact item metadata in `/admin/preview` unit-aware for plain-rep prescriptions, using the same logic as `PRESCRIPTION_TEXT`.

Examples:

- current: `1x · 15-20 · RIR 0`
- desired: `1x · 15-20 reps · RIR 0`

Keep existing distance/time/calorie behavior unchanged:

- `1x 400 m`
- `1x · 30 seconds`

## Problem Summary

The recent `PRESCRIPTION_TEXT` change fixed narration lines only.

So now:

- narration line can show `1 x 15-20 reps`
- compact preview metadata still shows `15-20`

This happens because the compact metadata renderer in [preview.html](/c:/Users/alecp/bubble-workout-engine/api/admin/preview.html) uses `item.reps_prescribed` directly, while narration uses the unit-aware token path in [05_applyNarration.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/05_applyNarration.js).

## Recommendation

Add a small preview-only formatter that mirrors the `PRESCRIPTION_TEXT` rule:

- if `reps_unit = reps` or blank, append ` reps`
- if `reps_unit = m`, `seconds`, or `cal`, leave `item.reps_prescribed` unchanged

This should be local to `/admin/preview` and should not change:

- rep rule formatting
- narration tokens
- persisted API payloads

## Scope

### Change 1: `api/admin/preview.html`

Add a helper near the existing preview formatting functions, for example:

```js
function buildCompactPrescriptionText(item) {
  const base = String(item?.reps_prescribed || "").trim();
  if (!base) return "";
  const unit = String(item?.reps_unit || "reps").trim().toLowerCase();
  if (!unit || unit === "reps") return `${base} reps`;
  return base;
}
```

Then update `renderItem()` so the compact metadata uses this formatted value instead of `item.reps_prescribed` directly.

Current behavior in `renderItem()` is effectively:

```js
if (item.reps_prescribed) parts.push(item.reps_prescribed);
```

Replace that with:

```js
const prescriptionText = buildCompactPrescriptionText(item);
if (prescriptionText) parts.push(prescriptionText);
```

Also update the `metaText` collapse logic to reference `prescriptionText`, not `item.reps_prescribed`.

Current behavior is effectively:

```js
const metaText = parts.length === 2 && setsLabel && item.reps_prescribed
  ? `${setsLabel} ${item.reps_prescribed}`
  : parts.join(" | ");
```

This should become:

```js
const metaText = parts.length === 2 && setsLabel && prescriptionText
  ? `${setsLabel} ${prescriptionText}`
  : parts.join(" | ");
```

Without this change, plain-rep rows could still collapse back to the old raw `15-20` text even after the parts array was made unit-aware.

### Change 2: preserve interval-style special cases

Keep the existing preview behavior that:

- collapses `sets + prescription` into `1x 400 m` when those are the only two parts
- suppresses `RIR 0` for interval-style rows
- suppresses `0-0-0-0` tempo

This change should only affect the displayed prescription token.

## What Should Not Change

- [04_applyRepRules.js](/c:/Users/alecp/bubble-workout-engine/api/engine/steps/04_applyRepRules.js)
- `item.reps_prescribed`
- narration templates
- narration matching
- mobile app payloads

This is a UI-only formatting change for admin preview.

## Acceptance Criteria

1. Plain-rep preview items display:
   - `1x · 15-20 reps · RIR 0`
2. Distance items still display:
   - `1x 400 m`
3. Seconds items still display:
   - `1x · 30 seconds`
4. Existing compact formatting rules for interval-style items remain unchanged.

## Test / Verification Plan

Manual verification in `/admin/preview`:

1. Generate a HYROX or strength preview with a plain-rep item
   - example: Sandbag Thruster or Barbell Back Squat
   - confirm compact row shows `15-20 reps` or `6-8 reps`

2. Generate a distance item
   - example: Run Interval or Row Erg
   - confirm compact row still shows `400 m` or `500 m`, not `400 m reps`

3. Generate a seconds item
   - confirm compact row still shows `30 seconds`, not `30 seconds reps`

4. Confirm the compact `sets + prescription` collapse still works:
   - `1x 400 m`
   - not `1x · 400 m`

## Final Recommendation

Implement a preview-local helper that mirrors the `PRESCRIPTION_TEXT` rule and use it in `renderItem()` for compact metadata.

This keeps the preview consistent with narration while staying a small, isolated UI-only fix.
