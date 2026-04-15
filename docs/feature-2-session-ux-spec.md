# Feature 2 Specification: Session UX — Set-by-Set Completion Flow

## 1. What Has Already Been Delivered

Before reading this spec, understand what exists today so amendments are not confused with new work.

### 1.1 Timer infrastructure (complete, do not re-implement)

| File | What it does |
|------|-------------|
| `mobile/src/components/timers/RingTimer.tsx` | SVG ring component. Renders a 4-quadrant arc that drains from full to empty. Accepts `progress` (0–1), track/progress colors, children. Stateless display only. |
| `mobile/src/components/timers/useCountdownTimer.ts` | Simple countdown hook. Used by earlier iterations; still present. |
| `mobile/src/components/timers/useSegmentTimer.ts` | Full segment+rest timer hook. Reads/writes `useTimerStore`. Handles segment mode, rest mode, haptic completion feedback, mode switching, pause/resume, reset. |
| `mobile/src/state/timer/useTimerStore.ts` | Zustand store keyed by `segmentId`. Each entry tracks segment elapsed, rest elapsed, running flags, timestamps for both modes. One active segment at a time — starting a new segment resets any previously active one. |
| `mobile/src/components/timers/PremiumTimer.tsx` | Assembled timer card. Ring + play/pause + reset. Supports `compact` prop (96 px ring) and full size (200 px ring). Displays segment or rest mode with a tap-to-switch chip. Shows "Done!" / "Rest done!" state hints. |

### 1.2 Session screen and segment cards (complete)

| File | What it does |
|------|-------------|
| `mobile/src/screens/program/ProgramDayScreen.tsx` | Shows ordered `SegmentCard`s for a day. Loads local AsyncStorage state on mount. Has a "Workout complete" bottom bar button that calls `PATCH /api/day/:id/complete` via `markDayComplete`. |
| `mobile/src/components/program/SegmentCard.tsx` | Renders exercise list (LHS) + compact `PremiumTimer` (RHS). Reads `suggestedRestSeconds` as the max `restSeconds` across exercises in the segment. Calls `onLogSegment()` via a "Log segment" button. |
| `mobile/src/utils/localWorkoutLog.ts` | AsyncStorage helpers: `getSegmentLog`, `setSegmentLog`, `getWorkoutComplete`, `setWorkoutComplete`. Used by `ProgramDayScreen` to persist logged/completed state between app restarts. |

### 1.3 Logging modal (partially complete)

| File | What it does |
|------|-------------|
| `mobile/src/components/program/LogSegmentModal.tsx` | A modal opened per segment. Shows the planned exercises and an ACTUAL section with weight/reps inputs and an RIR picker (0–4 options). Prefills weight from `ex.intensity` (raw text field). Saves via `POST /api/segment-log`. |

**What the modal does NOT do:**
- Does not prefill weight from `ex.guidelineLoad.value` (it reads the raw `intensity` text string instead)
- Logs one entry per exercise total — there is no per-set distinction in the UI even though the prescription has a `sets` count
- Does not trigger the rest timer when a set is saved
- Does not show a session summary after the final save

### 1.4 API (complete, no changes needed)

- `POST /api/segment-log` — accepts an array of `rows`, each with `program_exercise_id`, `order_index`, `weight_kg`, `reps_completed`, `rir_actual`. Writes to `segment_exercise_log`, computes `estimated_1rm_kg` per row.
- `PATCH /api/day/:id/complete` — marks the day complete, fires Layer B (once Feature 1 is wired).
- `GET /api/segment-log` — reads existing logs for a segment+day.

---

## 2. What This Spec Adds

The existing delivery closes the timer and basic logging surfaces. What is missing is the **active in-session loop**:

1. Logging is segment-level (one weight/reps entry per exercise), not set-by-set
2. The rest timer is a standalone widget — it does not auto-start when a set is completed
3. Guideline loads are not used as weight prefills
4. No session summary screen after workout completion

The four amendments below close these gaps. They are deliberately additive — they extend the existing components rather than replace them.

---

## 3. Amendment 1 — Guideline Load Weight Prefill in `LogSegmentModal`

### Problem

`LogSegmentModal` prefills weight from `parseWeightPrefill(ex.intensity)`. `intensity` is a raw prescription string like `"RPE 7-8"` or `"70% 1RM"` — it is often not a number. Meanwhile, `ex.guidelineLoad` already carries a computed `value` (in kg) that is specifically designed to seed the first working weight. It is ignored today.

### Source precedence for weight prefill

Apply prefills in this priority order (highest wins):

1. `existingLogsQuery.data` row for this `programExerciseId` — user already logged this set; show what they logged
2. `ex.guidelineLoad?.value > 0` — engine's suggested starting load
3. `parseWeightPrefill(ex.intensity)` — falls back to raw intensity text (current behavior)
4. `""` — empty

### Change to `mobile/src/components/program/LogSegmentModal.tsx`

In the `useEffect` that builds `initial`, update the per-exercise weight prefill logic:

```ts
// Replace the current single line:
//   weight: parseWeightPrefill(ex.intensity),
// With:

function guidelinePrefill(ex: typeof exercises[number]): string {
  const glv = ex.guidelineLoad?.value;
  if (glv != null && Number.isFinite(Number(glv)) && Number(glv) > 0) {
    return String(Number(glv));
  }
  return parseWeightPrefill(ex.intensity);
}

// In the initial build loop:
initial[key] = {
  weight: guidelinePrefill(ex),
  reps: parseRepsPrefill(ex.reps),
  rirActual: null,
};
```

The existing `existingLogsQuery.data` overlay loop already overwrites this if a real log row exists — no change needed there.

### Type check

`ex.guidelineLoad` is typed via `ProgramDayFullResponse["segments"][number]["exercises"][number]["guidelineLoad"]`. Verify the type includes `value: number | null`. If it is typed as `string | null` from the API response, cast with `Number(glv)` before comparing.

---

## 4. Amendment 2 — Per-Set Logging

### Problem

The prescription has a `sets` count (e.g., `sets: 4`). The current modal collects one weight and one reps value per exercise and submits one row. This means all sets are logged identically and the `order_index` is always 1. When Layer B reads `segment_exercise_log`, it sees a flat history without per-set detail, which degrades progression signal.

The API already supports multiple rows per `programExerciseId` (one row per set, distinguished by `order_index`). The schema uniqueness constraint is `(user_id, workout_segment_id, program_exercise_id, order_index)` — so multiple sets for the same exercise are fully supported.

### UX model

Expand the ACTUAL section in `LogSegmentModal` from a single input row per exercise to **one row per set**:

**Before:**
```
Barbell Back Squat
  [______ kg]  [______ reps]
```

**After:**
```
Barbell Back Squat
  Set 1    [______ kg]  [______ reps]
  Set 2    [______ kg]  [______ reps]
  Set 3    [______ kg]  [______ reps]
  Set 4    [______ kg]  [______ reps]
```

Behaviour:
- Number of input rows = `ex.sets` (from the prescription). If `ex.sets` is null/0, fall back to 1 row.
- All set rows are pre-filled with the same weight/reps prefill (guideline load or prior logged value)
- The RIR picker applies to whichever set row was last focused (same `activeExerciseId` logic, extended to track `activeKey = exerciseId:setIndex`)
- Saving the modal submits one `row` per set, with `order_index` = set number (1-based)

### State shape change

Replace:
```ts
type InputState = { weight: string; reps: string; rirActual: number | null };
const [inputMap, setInputMap] = useState<Record<string, InputState>>({});
// key = programExerciseId
```

With:
```ts
type SetInputState = { weight: string; reps: string; rirActual: number | null };
const [inputMap, setInputMap] = useState<Record<string, SetInputState[]>>({});
// key = programExerciseId, value = array[setIndex]
```

Active exercise tracking:
```ts
const [activeKey, setActiveKey] = useState<{ exerciseId: string; setIndex: number } | null>(null);
```

### Initialization

In the `useEffect`, build an array per exercise:

```ts
const setCount = Math.max(1, ex.sets ?? 1);
const prefillWeight = guidelinePrefill(ex);
const prefillReps = parseRepsPrefill(ex.reps);
initial[key] = Array.from({ length: setCount }, () => ({
  weight: prefillWeight,
  reps: prefillReps,
  rirActual: null,
}));
```

When `existingLogsQuery.data` returns rows, overlay each row into `initial[key][row.orderIndex - 1]` (using `orderIndex - 1` as the array index).

### Save

In `handleSave`, build one row per set per loadable exercise:

```ts
const rows: SaveSegmentLogPayload["rows"] = [];
exercises.forEach((ex) => {
  if (!ex.isLoadable) {
    rows.push({
      programExerciseId: ex.id ?? "",
      orderIndex: 1,
      weightKg: null,
      repsCompleted: null,
      rirActual: null,
    });
    return;
  }
  const sets = inputMap[ex.id ?? ""] ?? [];
  sets.forEach((set, i) => {
    const wRaw = parseFloat(set.weight);
    const rRaw = parseInt(set.reps, 10);
    rows.push({
      programExerciseId: ex.id ?? "",
      orderIndex: i + 1,
      weightKg: Number.isFinite(wRaw) && wRaw > 0 ? wRaw : null,
      repsCompleted: Number.isInteger(rRaw) && rRaw > 0 ? rRaw : null,
      rirActual: set.rirActual ?? null,
    });
  });
});
```

### Copy/fill-down UX (optional but recommended)

Add a small "Fill down" button next to Set 1's weight/reps fields that copies Set 1's values into all subsequent sets for that exercise. This saves time for athletes who do all sets at the same weight.

---

## 5. Amendment 3 — Rest Timer Auto-Start on Set Save

### Problem

The compact `PremiumTimer` on the `SegmentCard` is a standalone widget. Completing a set in the modal and saving has no effect on the timer — the athlete must manually tap Play on the timer card after the modal closes.

### Target behaviour

When the modal closes with a successful save:
- If the segment has `suggestedRestSeconds > 0` (i.e., any exercise in the segment has `restSeconds > 0`), auto-start the rest timer for that segment.
- The timer is already keyed by `segment.id` — calling `useTimerStore.getState().startRest(segment.id)` will start it.

### Change to `ProgramDayScreen.tsx`

Pass a new `onSave` callback to `LogSegmentModal` that also fires the rest timer:

```ts
onSave={() => {
  if (activeSegment) {
    const entry: SegmentLogEntry = { updatedAt: new Date().toISOString() };
    setSegmentLogs((current) => ({ ...current, [activeSegment.id]: entry }));
    void setSegmentLog(programDayId, activeSegment.id, {});

    // Auto-start rest timer for this segment if rest is prescribed
    const maxRest = Math.max(
      0,
      ...(activeSegment.exercises ?? [])
        .map((ex) => ex.restSeconds ?? 0),
    );
    if (maxRest > 0) {
      useTimerStore.getState().startRest(activeSegment.id);
    }
  }
  setActiveSegmentId(null);
  void hapticLight();
}}
```

`useTimerStore` must be imported in `ProgramDayScreen.tsx`.

### Timer store guard

`startRest` in `useTimerStore` calls `initEntry` only if the entry does not exist, but the entry is initialized by `useSegmentTimer` when `SegmentCard` mounts. The `startRest` action will find the entry correctly. No change to `useTimerStore` is needed.

---

## 6. Amendment 4 — Session Summary Screen

### Problem

When the user taps "Workout complete", the only feedback is a `confirmationText` string below the button: `"Workout marked complete."` There is no volume summary, no PR list, and no visual close to the workout.

### Design

Add a `SessionSummaryModal` that appears when "Workout complete" is tapped, shows a brief summary, and calls `PATCH /api/day/:id/complete` only when dismissed (i.e., completion is deferred until the user acknowledges the summary).

### Summary data source

The summary is computed client-side from `inputMap` at the time the user taps "Workout complete". No new API route is needed.

**Computed fields:**

| Field | Computation |
|-------|-------------|
| `totalSets` | Count of non-null set rows across all logged segments |
| `totalVolumeKg` | Sum of `weight_kg × reps_completed` across all logged set rows with non-null weight and reps |
| `exerciseCount` | Count of distinct `programExerciseId`s with at least one logged set |
| `prExercises` | Read from a `prHits` state variable populated after each `saveMutation.onSuccess` via the `prFeed` API (see below) |

### PR surface

After each successful `POST /api/segment-log`, the API already fires push notifications for PRs. The mobile client currently has no in-session PR state.

Add a `prHits` state variable to `ProgramDayScreen`:

```ts
const [prHits, setPrHits] = useState<string[]>([]);
// Each entry is an exercise name
```

When `onSave` fires in `LogSegmentModal`, the modal already knows which exercises were logged. After `saveMutation.onSuccess`, call `GET /api/history/personal-records?limit=5` (already implemented at `prsFeed` route) and compare the most recent PR timestamps against the current session's `program_day_id` to surface new ones. If the response includes records whose `created_at` is within the last 60 seconds, add the exercise name to `prHits`.

Alternatively — and simpler for v1 — skip live PR detection in the modal and instead show a static "Well done!" message in the summary. PR push notifications already fire server-side via `segmentLog.js`. The summary screen does not need to duplicate this.

### `SessionSummaryModal` component

Create `mobile/src/components/program/SessionSummaryModal.tsx`.

Props:
```ts
type SessionSummaryModalProps = {
  visible: boolean;
  totalVolumeKg: number;
  totalSets: number;
  exerciseCount: number;
  prHits: string[];     // exercise names that hit a PR this session
  onDismiss: () => void;
};
```

Content:
```
Session complete
────────────────
[Medal icon]  You hit a PR on [exercise name]!   ← only if prHits.length > 0

Volume lifted:   [X,XXX] kg
Sets completed:  [N]
Exercises:       [N]

[Close / Done button]
```

The "Close" button calls `onDismiss`, which should:
1. Mark the workout complete locally (AsyncStorage)
2. Call `markDayComplete.mutate({ programDayId, isCompleted: true, userId })`
3. Close the modal

### Wiring in `ProgramDayScreen.tsx`

Replace the current direct call in `handleCompleteWorkout`:

```ts
// Current:
const handleCompleteWorkout = async (): Promise<void> => {
  await setWorkoutComplete(programDayId, true);
  setWorkoutCompleteState(true);
  setConfirmationText("Workout marked complete.");
  markDayComplete.mutate({ programDayId, isCompleted: true, userId });
  await hapticMedium();
};

// New:
const [summaryVisible, setSummaryVisible] = useState(false);

const handleCompleteWorkout = async (): Promise<void> => {
  await hapticMedium();
  setSummaryVisible(true);
  // Do NOT call markDayComplete here — defer until modal dismiss
};

const handleSummaryDismiss = async (): Promise<void> => {
  setSummaryVisible(false);
  await setWorkoutComplete(programDayId, true);
  setWorkoutCompleteState(true);
  markDayComplete.mutate({ programDayId, isCompleted: true, userId });
};
```

Volume computation — call a helper that reads `segmentLogs` from the local state built up during the session. For v1, iterate over all loaded `orderedSegments`, find each logged segment's exercises from the API response, and sum `weight × reps` across all set inputs.

---

## 7. What Is Explicitly Out of Scope

The following items from the original Feature 2 roadmap bullet are **not** specified here and should not be built as part of this feature:

1. **Push notification fallback when app is backgrounded** — Expo Notifications integration is a non-trivial infrastructure addition. It belongs with Feature 7 (Push Notifications), not here. The timer's haptic completion already fires on foreground app.

2. **Estimated 1RM display in summary** — The `estimated_1rm_kg` is computed server-side in `POST /api/segment-log`. Reading it back for the summary would require a `GET /api/segment-log` call after save. Defer to Feature 5 (Progress Visualization) which already plans a post-session summary card.

3. **Exercises presented one at a time (scrollable with current highlighted)** — The `ProgramDayScreen` already presents segments as scrollable cards. A full one-at-a-time focused mode requires navigation rearchitecture and is not warranted until the logging flow itself is stabilized.

---

## 8. Files Changed

| File | Change |
|------|--------|
| `mobile/src/components/program/LogSegmentModal.tsx` | Amend: guideline load prefill (§3), per-set state and inputs (§4) |
| `mobile/src/screens/program/ProgramDayScreen.tsx` | Amend: rest timer auto-start on save (§5), summary modal trigger and dismiss handler (§6) |
| `mobile/src/components/program/SessionSummaryModal.tsx` | **New file**: session summary modal (§6) |

No backend changes required. No new API routes. No migration.

---

## 9. Testing

### `LogSegmentModal` — guideline load prefill

- exercise with `guidelineLoad.value = 80` and no prior log → weight prefilled to `"80"`
- exercise with `guidelineLoad.value = 80` and existing log row `weight_kg = 85` → weight prefilled to `"85"` (prior log wins)
- exercise with `guidelineLoad = null` and `intensity = "RPE 7"` → weight prefills to `""` (no extractable number)
- exercise with `guidelineLoad = null` and `intensity = "70"` → weight prefills to `"70"` (legacy path)

### `LogSegmentModal` — per-set rows

- exercise with `sets = 3` renders 3 set rows in the ACTUAL section
- exercise with `sets = null` renders 1 set row
- saving 3 set rows submits `rows` with `order_index` 1, 2, 3 for that `programExerciseId`
- existing logs with `orderIndex = 2` prefill into Set 2's inputs

### Rest timer auto-start

- `onSave` with `maxRest > 0` → `useTimerStore.getState().startRest(segmentId)` is called
- `onSave` with `maxRest = 0` (or no restSeconds on any exercise) → timer not started

### Session summary modal

- tapping "Workout complete" opens `SessionSummaryModal` before `markDayComplete` is called
- `totalVolumeKg` equals the sum of `weight × reps` across all logged sets
- dismissing the modal calls `markDayComplete.mutate`
- `summaryVisible` is false before tap, true after tap, false after dismiss
