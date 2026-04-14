# Add "Rate Your Last Set" (RIR capture) to Log Segment screen

## AMENDMENT NOTES (read before implementing)

This document was reviewed against the actual codebase before being passed to Codex. Key corrections from the original draft:

- **Per-exercise, not per-set.** The current `LogSegmentModal` stores one `{ weight, reps }` entry per exercise, not per set. There is no multi-set tracking or `activeSetIndex`. RIR capture follows the same model: one value per exercise per segment log.
- **`rir_actual` already exists in the backend.** `api/src/routes/segmentLog.js` already validates, inserts, selects, and echoes `rir_actual`. The only backend change is narrowing the allowed range from 0–10 to 0–4. No DB migration is needed.
- **Correct field name is `rir_actual` / `rirActual`.** The original draft used `rir_reps_left` throughout. Use `rir_actual` (DB/API snake_case) and `rirActual` (TypeScript camelCase) everywhere.
- **The multi-set API example in the original Section 8 is aspirational.** It does not match the current data model. Ignore the `set_number` / sets-array shape. The payload remains one row per exercise.
- **"Active set" concept becomes "active exercise".** Since inputs are per-exercise, the RIR selector targets whichever exercise row the user last touched.

---

## 1. PRODUCT REQUIREMENT

### OVERVIEW

Enhance the existing Log Segment modal so that after the user enters reps and weight for an exercise, they can also record how hard that set felt — expressed as how many more reps they could have done.

This is effectively RIR (Reps in Reserve) capture. The user should never see the term "RIR" in the primary UI.

### PRIMARY USER STORY

As an athlete logging a workout,
I want to quickly indicate how hard my set felt,
so the app can better calibrate future weights and reps.

### SECONDARY USER STORY

As a coach/engine,
I want structured per-exercise effort data,
so I can distinguish too easy / on target / too hard / failure
and use that for progression, hold, or deload decisions.

### SUCCESS CRITERIA

- User can log effort for an exercise with 1 tap.
- Logging effort adds minimal friction.
- The meaning is obvious to non-technical users.
- The data is stored per exercise-log row.
- Existing logging flows continue to work even if effort is not entered.
- The UI is accessible and usable with one hand.

---

## 2. USER EXPERIENCE REQUIREMENT

### SCREEN

File: `mobile/src/components/program/LogSegmentModal.tsx`

This is a modal sheet. The ACTUAL section renders one exercise row per loadable exercise. Each row has weight and reps inputs.

### NEW UI BLOCK

Add a card/panel below the ACTUAL exercise inputs and above the Cancel / Save buttons.

Section content:
- Title: **"Rate Your Last Set"**
- Prompt: **"How many more reps could you do?"**
- 5 selectable buttons (left to right): `4+` · `3` · `2` · `1` · `0`

Optional supporting caption below the selected button:
- `4+` → "Could do 4 or more reps"
- `3` → "Could do 3 more reps"
- `2` → "Could do 2 more reps"
- `1` → "Could do 1 more rep"
- `0` → "Could do no more reps"

### DO NOT

- Ask "What was your RIR?"
- Use the words RIR, reps in reserve, or proximity to failure in any main UI copy.

---

## 3. INTERACTION MODEL

### ACTIVE EXERCISE TRACKING

The effort selector always targets the **active exercise** — whichever loadable exercise row the user most recently:
- touched the weight input
- touched the reps input

If no exercise has been touched yet, no exercise is active and the effort buttons are disabled.

### BEHAVIOR

- When the user edits weight or reps on an exercise row, that exercise becomes active.
- The effort selector reflects the active exercise's current `rirActual` value.
- If the active exercise already has a stored `rirActual`, show it selected.
- If not, show no selection.

### ON TAP OF AN EFFORT BUTTON

- Save the value to the active exercise in local screen state immediately.
- Visually mark the selected button.
- Allow changing the value before pressing Save.
- Tapping a different value replaces the previous value.

### SWITCHING BETWEEN EXERCISES

- When the user touches inputs on a different exercise, that exercise becomes active.
- The effort selector switches to that exercise's `rirActual` (selected or blank).

### SAVE BEHAVIOR

On press of Save:
- persist reps and weight as today
- also persist `rirActual` for any exercises that have a value
- send `null` for exercises with no effort value

### OPTIONALITY

Effort logging is optional. Do not block Save if effort is missing.

---

## 4. EFFORT SCALE / DATA MODEL

### USER-FACING OPTIONS

`4+` · `3` · `2` · `1` · `0`

### STORED REPRESENTATION

Store as an integer in `rir_actual`:

| Display | Stored `rir_actual` |
|---------|---------------------|
| `4+`    | `4`                 |
| `3`     | `3`                 |
| `2`     | `2`                 |
| `1`     | `1`                 |
| `0`     | `0`                 |

For "4+" store `4`. No separate flag needed at this stage.

### SEMANTIC MEANING

- 4 = very easy / lots left in tank
- 3 = easy
- 2 = productive working set
- 1 = hard
- 0 = failure / no reps left

---

## 5. UI / UX DETAILS

### LAYOUT

Place the effort card below the ACTUAL exercise rows and above the action buttons row. It should feel like the final step before saving.

### RECOMMENDED STRUCTURE

```
┌─────────────────────────────────────────┐
│  Rate Your Last Set              [ℹ]    │
│  How many more reps could you do?        │
│                                          │
│  [ 4+ ]  [ 3 ]  [ 2 ]  [ 1 ]  [ 0 ]   │
│                                          │
│  Could do 2 more reps                   │
└─────────────────────────────────────────┘
```

### INFO ICON (optional)

If included, tap opens a lightweight tooltip or bottom sheet:
> "This helps tailor future weights and reps to your actual effort."

Avoid technical detail.

### BUTTON STATES

Each button must support:
- **default** — unselected
- **selected** — stronger border, filled background, elevated contrast
- **pressed** — visual feedback on tap
- **disabled** — when no exercise has been touched yet; optionally show "Enter your set first"

### ACCESSIBILITY

- Accessible label for each button, e.g. `accessibilityLabel="Could do 3 more reps"`
- Tap targets ≥ 44 pt
- Selected state must not rely on color alone (use border/fill contrast too)
- Support screen readers

---

## 6. STATE MANAGEMENT

### CURRENT STATE SHAPE

```ts
// existing
type InputState = { weight: string; reps: string };
const [inputMap, setInputMap] = useState<Record<string, InputState>>({});
```

`inputMap` is keyed by `ex.id` (program_exercise.id).

### EXTENDED STATE SHAPE

Extend `InputState` and add active exercise tracking:

```ts
type InputState = {
  weight: string;
  reps: string;
  rirActual: number | null;  // NEW
};

const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);  // NEW
```

### RULES

- `activeExerciseId` initializes to `null`.
- Set `activeExerciseId` to `key` whenever the user focuses the weight or reps `TextInput` for that exercise.
- The effort selector reads from `inputMap[activeExerciseId]?.rirActual`.
- Tapping an effort button writes to `inputMap[activeExerciseId].rirActual`.
- Buttons are disabled when `activeExerciseId` is `null`.

### PREFILL FROM EXISTING LOGS

When overlaying existing DB logs (the `useEffect` that reads `existingLogsQuery.data`), also map `rir_actual`:

```ts
if (row.rirActual != null) initial[key].rirActual = row.rirActual;
```

---

## 7. PERSISTENCE

### BACKEND STATUS

**No DB migration required.** The `rir_actual` column already exists in `segment_exercise_log` and is already handled in the backend route.

### ONLY BACKEND CHANGE REQUIRED

In `api/src/routes/segmentLog.js`, narrow the validation range from `0–10` to `0–4`:

```js
// current
if (!Number.isFinite(rirActual) || rirActual < 0 || rirActual > 10) {

// change to
if (!Number.isFinite(rirActual) || rirActual < 0 || rirActual > 4) {
```

Valid values: `null`, `0`, `1`, `2`, `3`, `4`.

### BACKWARD COMPATIBILITY

The field is already optional in the backend. Older clients that omit `rir_actual` continue to work unchanged.

---

## 8. API / MOBILE CLIENT

### CURRENT PAYLOAD (mobile → backend)

```ts
// mobile/src/api/segmentLog.ts — SaveSegmentLogPayload rows currently
{
  program_exercise_id: r.programExerciseId,
  order_index: r.orderIndex,
  weight_kg: r.weightKg,
  reps_completed: r.repsCompleted,
}
```

### REQUIRED CHANGES — `mobile/src/api/segmentLog.ts`

1. Add `rirActual: number | null` to the row type in `SaveSegmentLogPayload`.
2. Include it in the mapped payload sent to the API:
   ```ts
   rir_actual: r.rirActual ?? null,
   ```
3. Add `rirActual` to `SegmentLogRow` and map it in `getSegmentExerciseLogs`:
   ```ts
   rirActual: row.rir_actual != null ? Number(row.rir_actual) : null,
   ```

### PAYLOAD SHAPE (after change)

```json
{
  "program_id": "...",
  "program_day_id": "...",
  "workout_segment_id": "...",
  "rows": [
    {
      "program_exercise_id": "...",
      "order_index": 1,
      "weight_kg": 80,
      "reps_completed": 8,
      "rir_actual": 2
    },
    {
      "program_exercise_id": "...",
      "order_index": 2,
      "weight_kg": 60,
      "reps_completed": 10,
      "rir_actual": null
    }
  ]
}
```

One row per exercise. `rir_actual` is optional; `null` is accepted.

---

## 9. ANALYTICS / FUTURE USE

This release is data capture only. Implementation should make the data cleanly usable for progression logic.

Future uses:
- Increase load when athlete consistently reports RIR ≥ 3 (too easy)
- Hold when RIR is 1–2 (on target)
- Avoid increase when RIR = 0 (failure)
- Detect repeated underperformance

Do not implement progression logic here.

---

## 10. EDGE CASES

| Case | Behavior |
|------|----------|
| User enters reps/weight but no effort | Save normally; `rir_actual = null` |
| User taps effort before touching any input | Buttons are disabled; no-op |
| User switches to a different exercise | Effort selector reflects that exercise's value |
| User changes effort multiple times | Latest choice wins |
| User closes modal without saving | Discard local state consistently with existing behavior |
| Network failure on save | Local state preserved; retry with same payload |
| Old client sends no `rir_actual` | Backend accepts — field is already optional |
| Value submitted outside 0–4 | Backend rejects with 400 validation error |

---

## 11. ACCEPTANCE CRITERIA

### UI

- Log Segment modal shows a "Rate Your Last Set" section below the ACTUAL inputs
- Five effort buttons: `4+`, `3`, `2`, `1`, `0`
- Touching an exercise input activates that exercise as the RIR target
- Selecting a button visually updates and stores the value for the active exercise
- Buttons are disabled until an exercise is touched
- Existing weight/reps logging is unaffected

### Data

- `rirActual` is stored per exercise row
- Missing effort values are allowed (`null`)
- Stored values are limited to 0–4 or null

### API

- Segment log endpoint accepts `rir_actual` in each row (0–4 or null)
- Values outside 0–4 are rejected with 400
- Existing clients without the field are unaffected

### UX

- No jargon required of the user
- Logging with or without effort is equally fast
- Flow remains appropriate for intra-workout use

---

## 12. IMPLEMENTATION NOTES FOR CODEX

### Files to change

**Mobile:**

1. `mobile/src/api/segmentLog.ts`
   - Add `rirActual: number | null` to `SegmentLogRow`
   - Add `rirActual: number | null` to the row type inside `SaveSegmentLogPayload`
   - Map `rir_actual` in both `getSegmentExerciseLogs` (response parsing) and `saveSegmentExerciseLogs` (request serialization)

2. `mobile/src/components/program/LogSegmentModal.tsx`
   - Extend `InputState` with `rirActual: number | null`
   - Add `activeExerciseId` state (`string | null`, init `null`)
   - Set `activeExerciseId` via `onFocus` on each weight/reps `TextInput`
   - Overlay `rirActual` from existing logs in the `useEffect` prefill block
   - Add the "Rate Your Last Set" UI block with five `PressableScale` buttons
   - Wire button tap → `setInputMap` for `rirActual` on `activeExerciseId`
   - In `handleSave`, include `rirActual` (mapped to `rir_actual`) in each row payload

**Backend:**

3. `api/src/routes/segmentLog.js`
   - Change validation range for `rir_actual` from `0–10` to `0–4`
   - No other changes required

**Tests:**

4. `api/test/segmentLog.route.test.js`
   - Add test: `rir_actual = 3` is accepted
   - Add test: `rir_actual = 5` is rejected with 400
   - Add test: missing `rir_actual` is accepted (null stored)
   - Add test: `rir_actual = 0` is accepted

5. Mobile tests (if applicable)
   - Test: touching exercise A then tapping effort stores on A
   - Test: switching to exercise B, then tapping effort stores on B (not A)
   - Test: save payload includes `rir_actual` for exercises with values, `null` for others

---

## 13. OPTIONAL FUTURE ENHANCEMENTS (NOT REQUIRED NOW)

- Per-set RIR (requires expanding the data model from per-exercise to per-set rows)
- Prompt after completing the final set of an exercise rather than a persistent card
- Coach interpretation hints ("Too easy", "On target", "Very hard")
- Show "RIR" terminology in analytics-only screens for advanced users
- Distinguish warmup sets from working sets; require effort only on working sets
- Use effort data to suggest next-session load adjustments inline
