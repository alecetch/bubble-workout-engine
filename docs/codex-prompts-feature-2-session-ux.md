# Codex Implementation Prompt — Feature 2: Session UX (Set-by-Set Completion Flow)

## Context

This is a React Native / Expo mobile app (`mobile/`) backed by a Node/Express API (`api/`). State management uses Zustand. Data fetching uses React Query hooks defined in `mobile/src/api/hooks.ts`.

The timer infrastructure is **fully implemented and must not be touched**:
- `mobile/src/components/timers/RingTimer.tsx` — stateless SVG ring display
- `mobile/src/components/timers/useSegmentTimer.ts` — segment+rest timer hook
- `mobile/src/state/timer/useTimerStore.ts` — Zustand store keyed by `segmentId`
- `mobile/src/components/timers/PremiumTimer.tsx` — assembled timer card (compact + full)

The session screen and segment cards are **fully implemented and must not be touched**:
- `mobile/src/screens/program/ProgramDayScreen.tsx`
- `mobile/src/components/program/SegmentCard.tsx`
- `mobile/src/utils/localWorkoutLog.ts`

The API is **complete — no backend changes are needed**:
- `POST /api/segment-log` — accepts `rows[]` with `programExerciseId`, `order_index`, `weight_kg`, `reps_completed`, `rir_actual`. Supports multiple rows per `programExerciseId` (one per set) distinguished by `order_index`.
- `PATCH /api/day/:id/complete` — marks the day complete
- `GET /api/segment-log` — reads existing logs for a segment+day

This prompt amends **three existing files** and creates **one new file**. Read each file carefully before editing.

---

## Part 1 — Amendment 1: Guideline Load Weight Prefill (`LogSegmentModal.tsx`)

**File:** `mobile/src/components/program/LogSegmentModal.tsx`

### Problem

The modal currently prefills exercise weight from `parseWeightPrefill(ex.intensity)`. The `intensity` field is a raw prescription string like `"RPE 7-8"` or `"70% 1RM"` — often not a number. Meanwhile, `ex.guidelineLoad?.value` already holds a computed load in kg designed to seed the first working weight. It is currently ignored.

### Change

Add a `guidelinePrefill` helper function after `parseRepsPrefill` (around line 60):

```ts
function guidelinePrefill(ex: { guidelineLoad?: { value?: number | string | null } | null; intensity?: string | null }): string {
  const glv = ex.guidelineLoad?.value;
  if (glv != null && Number.isFinite(Number(glv)) && Number(glv) > 0) {
    return String(Number(glv));
  }
  return parseWeightPrefill(ex.intensity);
}
```

In the `useEffect` that builds `initial` (currently lines 93–103), replace:

```ts
      initial[key] = {
        weight: parseWeightPrefill(ex.intensity),
        reps: parseRepsPrefill(ex.reps),
        rirActual: null,
      };
```

With:

```ts
      initial[key] = {
        weight: guidelinePrefill(ex),
        reps: parseRepsPrefill(ex.reps),
        rirActual: null,
      };
```

The existing `existingLogsQuery.data` overlay loop (lines 105–112) already overwrites the prefill when a real log row exists — **no change needed there**.

---

## Part 2 — Amendment 2: Per-Set Logging (`LogSegmentModal.tsx`)

**File:** `mobile/src/components/program/LogSegmentModal.tsx`

This is the largest change. Read the full file before editing.

### State shape

Replace the `InputState` type and `inputMap` / `activeExerciseId` state declarations:

**Remove:**
```ts
type InputState = { weight: string; reps: string; rirActual: number | null };
```

**Add in its place:**
```ts
type SetInputState = { weight: string; reps: string; rirActual: number | null };
```

Replace the two state lines at the top of the component body:
```ts
// Remove:
const [inputMap, setInputMap] = useState<Record<string, InputState>>({});
const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);

// Add:
const [inputMap, setInputMap] = useState<Record<string, SetInputState[]>>({});
const [activeKey, setActiveKey] = useState<{ exerciseId: string; setIndex: number } | null>(null);
```

Update the derived values that depended on `activeExerciseId`:
```ts
// Remove:
const activeExercise = loadableExercises.find((ex) => ex.id === activeExerciseId) ?? null;
const activeEffort = activeExerciseId ? (inputMap[activeExerciseId]?.rirActual ?? null) : null;
const activeEffortCaption = EFFORT_OPTIONS.find((option) => option.value === activeEffort)?.caption ?? null;

// Add:
const activeExercise = loadableExercises.find((ex) => ex.id === activeKey?.exerciseId) ?? null;
const activeEffort = activeKey
  ? (inputMap[activeKey.exerciseId]?.[activeKey.setIndex]?.rirActual ?? null)
  : null;
const activeEffortCaption = EFFORT_OPTIONS.find((option) => option.value === activeEffort)?.caption ?? null;
```

### Initialization — `useEffect`

Replace the entire `useEffect` body with the per-set version:

```ts
  useEffect(() => {
    if (!visible || !segment) return;

    const initial: Record<string, SetInputState[]> = {};

    for (const ex of exercises) {
      if (ex.isLoadable !== true) continue;
      const key = ex.id ?? "";
      const setCount = Math.max(1, (ex.sets as number | null | undefined) ?? 1);
      const prefillWeight = guidelinePrefill(ex);
      const prefillReps = parseRepsPrefill(ex.reps);
      initial[key] = Array.from({ length: setCount }, () => ({
        weight: prefillWeight,
        reps: prefillReps,
        rirActual: null,
      }));
    }

    // Overlay existing DB log rows into the correct set slot
    const existingRows = existingLogsQuery.data ?? [];
    for (const row of existingRows) {
      const key = row.programExerciseId;
      if (!initial[key]) continue;
      const idx = (row.orderIndex ?? 1) - 1; // orderIndex is 1-based
      if (idx < 0 || idx >= initial[key].length) continue;
      if (row.weightKg != null) initial[key][idx].weight = String(row.weightKg);
      if (row.repsCompleted != null) initial[key][idx].reps = String(row.repsCompleted);
      if (row.rirActual != null) initial[key][idx].rirActual = row.rirActual;
    }

    setInputMap(initial);
    setActiveKey(null);
  }, [visible, segment?.id, existingLogsQuery.data]);
```

### `handleSave` — submit one row per set

Replace the existing `handleSave` function body:

```ts
  const handleSave = (): void => {
    if (!segment) return;

    const rows: SaveSegmentLogPayload["rows"] = [];

    exercises.forEach((ex) => {
      const key = ex.id ?? "";
      if (ex.isLoadable !== true) {
        rows.push({
          programExerciseId: key,
          orderIndex: 1,
          weightKg: null,
          repsCompleted: null,
          rirActual: null,
        });
        return;
      }
      const sets = inputMap[key] ?? [];
      sets.forEach((set, i) => {
        const wRaw = parseFloat(set.weight);
        const rRaw = parseInt(set.reps, 10);
        rows.push({
          programExerciseId: key,
          orderIndex: i + 1,
          weightKg: Number.isFinite(wRaw) && wRaw > 0 ? wRaw : null,
          repsCompleted: Number.isInteger(rRaw) && rRaw > 0 ? rRaw : null,
          rirActual: set.rirActual ?? null,
        });
      });
    });

    const payload: SaveSegmentLogPayload = {
      userId,
      programId,
      programDayId,
      workoutSegmentId: segment.id,
      rows,
    };

    saveMutation.mutate(payload, {
      onSuccess: () => {
        onSave();
        onClose();
      },
      onError: (err) => {
        console.error("[LogSegmentModal] save failed", err);
      },
    });
  };
```

### ACTUAL section — per-set input rows

Replace the ACTUAL section render (the `loadableExercises.map` block inside `{loadableExercises.length > 0 ? ( <>`) with:

```tsx
                <Text style={styles.sectionLabel}>ACTUAL</Text>
                {loadableExercises.map((ex) => {
                  const key = ex.id ?? "";
                  const sets = inputMap[key] ?? [{ weight: "", reps: "", rirActual: null }];
                  return (
                    <View key={key} style={styles.actualRow}>
                      <Text style={styles.actualName} numberOfLines={2} ellipsizeMode="tail">
                        {ex.name}
                      </Text>
                      {sets.map((set, i) => (
                        <View key={i} style={styles.setRow}>
                          <Text style={styles.setLabel}>Set {i + 1}</Text>
                          <View style={styles.inputsRow}>
                            <View style={styles.inputGroup}>
                              <TextInput
                                value={set.weight}
                                onFocus={() => setActiveKey({ exerciseId: key, setIndex: i })}
                                onChangeText={(v) => {
                                  const sanitized = v
                                    .replace(/[^0-9.]/g, "")
                                    .replace(/^(\d*\.?\d*).*$/, "$1");
                                  setInputMap((m) => {
                                    const prev = m[key] ?? [];
                                    const next = [...prev];
                                    next[i] = { ...(next[i] ?? { reps: "", rirActual: null }), weight: sanitized };
                                    return { ...m, [key]: next };
                                  });
                                }}
                                keyboardType="decimal-pad"
                                textContentType="none"
                                autoComplete="off"
                                placeholder="kg"
                                placeholderTextColor={colors.textSecondary}
                                style={styles.input}
                                accessibilityLabel={`${ex.name} set ${i + 1} weight in kg`}
                              />
                              <Text style={styles.inputUnit}>kg</Text>
                            </View>
                            <View style={styles.inputGroup}>
                              <TextInput
                                value={set.reps}
                                onFocus={() => setActiveKey({ exerciseId: key, setIndex: i })}
                                onChangeText={(v) => {
                                  const sanitized = v.replace(/[^0-9]/g, "");
                                  setInputMap((m) => {
                                    const prev = m[key] ?? [];
                                    const next = [...prev];
                                    next[i] = { ...(next[i] ?? { weight: "", rirActual: null }), reps: sanitized };
                                    return { ...m, [key]: next };
                                  });
                                }}
                                keyboardType="numeric"
                                textContentType="none"
                                autoComplete="off"
                                placeholder="reps"
                                placeholderTextColor={colors.textSecondary}
                                style={styles.input}
                                accessibilityLabel={`${ex.name} set ${i + 1} reps completed`}
                              />
                              <Text style={styles.inputUnit}>reps</Text>
                            </View>
                          </View>
                          {i === 0 && sets.length > 1 ? (
                            <PressableScale
                              style={styles.fillDownButton}
                              onPress={() => {
                                setInputMap((m) => {
                                  const prev = m[key] ?? [];
                                  const filled = prev.map((s, j) =>
                                    j === 0 ? s : { ...s, weight: prev[0].weight, reps: prev[0].reps },
                                  );
                                  return { ...m, [key]: filled };
                                });
                              }}
                            >
                              <Text style={styles.fillDownLabel}>Fill down</Text>
                            </PressableScale>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  );
                })}
```

### RIR picker — update `onPress` to use `activeKey`

The RIR picker `onPress` currently reads `activeExerciseId`. Replace it with:

```ts
                        onPress={() => {
                          if (!activeKey) return;
                          setInputMap((current) => {
                            const prev = current[activeKey.exerciseId] ?? [];
                            const next = [...prev];
                            next[activeKey.setIndex] = {
                              ...(next[activeKey.setIndex] ?? { weight: "", reps: "" }),
                              rirActual: option.value,
                            };
                            return { ...current, [activeKey.exerciseId]: next };
                          });
                        }}
```

Also update the `disabled` check:
```ts
                          const disabled = !activeKey;
```

### Styles — add new style entries

Add these entries to the `StyleSheet.create({})` object:

```ts
  setRow: {
    gap: spacing.xs,
  },
  setLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  fillDownButton: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  fillDownLabel: {
    color: colors.accent,
    ...typography.small,
    fontWeight: "600",
  },
```

---

## Part 3 — Amendment 3: Rest Timer Auto-Start on Save (`ProgramDayScreen.tsx`)

**File:** `mobile/src/screens/program/ProgramDayScreen.tsx`

### Add import

Add `useTimerStore` to the imports at the top of the file:

```ts
import { useTimerStore } from "../../state/timer/useTimerStore";
```

### Update `onSave` callback in `LogSegmentModal` props

Find the `onSave` prop passed to `<LogSegmentModal>` (currently lines 200–209). Replace the callback body:

```ts
        onSave={() => {
          if (activeSegment) {
            const entry: SegmentLogEntry = { updatedAt: new Date().toISOString() };
            setSegmentLogs((current) => ({ ...current, [activeSegment.id]: entry }));
            void setSegmentLog(programDayId, activeSegment.id, {});

            // Auto-start rest timer if any exercise in the segment has rest prescribed
            const maxRest = Math.max(
              0,
              ...(activeSegment.exercises ?? []).map((ex) => (ex.restSeconds as number | null | undefined) ?? 0),
            );
            if (maxRest > 0) {
              useTimerStore.getState().startRest(activeSegment.id);
            }
          }
          setActiveSegmentId(null);
          void hapticLight();
        }}
```

---

## Part 4 — New File: `SessionSummaryModal.tsx`

**Create:** `mobile/src/components/program/SessionSummaryModal.tsx`

This modal shows a brief workout summary and defers the `markDayComplete` API call until the user acknowledges it.

```tsx
import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type SessionSummaryModalProps = {
  visible: boolean;
  totalVolumeKg: number;
  totalSets: number;
  exerciseCount: number;
  prHits: string[]; // exercise names that hit a PR this session
  onDismiss: () => void;
};

export function SessionSummaryModal({
  visible,
  totalVolumeKg,
  totalSets,
  exerciseCount,
  prHits,
  onDismiss,
}: SessionSummaryModalProps): React.JSX.Element {
  const volumeDisplay =
    totalVolumeKg >= 1000
      ? `${(totalVolumeKg / 1000).toFixed(1)}t`
      : `${Math.round(totalVolumeKg).toLocaleString()} kg`;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.title}>Session complete</Text>
            <View style={styles.divider} />

            {prHits.length > 0 ? (
              <View style={styles.prBanner}>
                <Text style={styles.prEmoji}>🏆</Text>
                <Text style={styles.prText} numberOfLines={2}>
                  {prHits.length === 1
                    ? `New PR on ${prHits[0]}!`
                    : `New PRs on ${prHits.slice(0, 2).join(" & ")}!`}
                </Text>
              </View>
            ) : null}

            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{volumeDisplay}</Text>
                <Text style={styles.statLabel}>Volume lifted</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{totalSets}</Text>
                <Text style={styles.statLabel}>Sets completed</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{exerciseCount}</Text>
                <Text style={styles.statLabel}>Exercises</Text>
              </View>
            </View>

            <PressableScale style={styles.doneButton} onPress={onDismiss}>
              <Text style={styles.doneLabel}>Done</Text>
            </PressableScale>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.72)",
    justifyContent: "center",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h2,
    textAlign: "center",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  prBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: spacing.sm,
  },
  prEmoji: {
    fontSize: 24,
  },
  prText: {
    flex: 1,
    color: colors.accent,
    ...typography.body,
    fontWeight: "700",
  },
  statsGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  statValue: {
    color: colors.textPrimary,
    ...typography.h2,
    fontWeight: "700",
  },
  statLabel: {
    color: colors.textSecondary,
    ...typography.small,
    textAlign: "center",
  },
  doneButton: {
    minHeight: 50,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  doneLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
});
```

---

## Part 5 — Amendment 4: Wire `SessionSummaryModal` into `ProgramDayScreen.tsx`

**File:** `mobile/src/screens/program/ProgramDayScreen.tsx`

### Add import

```ts
import { SessionSummaryModal } from "../../components/program/SessionSummaryModal";
```

### Add state

Add these state variables inside the component body (alongside the existing `useState` declarations):

```ts
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [prHits] = useState<string[]>([]); // v1: populated by server push notification; empty array here
```

### Volume computation helper

Add this helper inside the component body, before the JSX `return`:

```ts
  function computeSessionStats(): { totalVolumeKg: number; totalSets: number; exerciseCount: number } {
    // Reads segmentLogs to find which segments were logged, then sums across orderedSegments' exercise data
    // For v1: iterate orderedSegments, read each segment's exercises from dayQuery.data
    let totalVolumeKg = 0;
    let totalSets = 0;
    const exerciseIds = new Set<string>();

    for (const segment of orderedSegments) {
      if (!segmentLogs[segment.id]) continue; // segment was not logged this session
      for (const ex of segment.exercises ?? []) {
        if (!ex.isLoadable) continue;
        exerciseIds.add(ex.id ?? "");
        const setCount = Math.max(1, (ex.sets as number | null | undefined) ?? 1);
        totalSets += setCount;
        // Volume: guideline load × reps × sets as a fallback estimate when exact per-set data is unavailable at this level
        // Exact per-set data lives in the mutation's payload which is no longer in scope here.
        // Use guidelineLoad.value × ex.reps × ex.sets as an estimate; this is the v1 approach.
        const glv = Number((ex.guidelineLoad as { value?: number | null } | null)?.value ?? 0);
        const reps = parseInt((ex.reps as string | null | undefined) ?? "0", 10) || 0;
        if (glv > 0 && reps > 0) {
          totalVolumeKg += glv * reps * setCount;
        }
      }
    }

    return { totalVolumeKg, totalSets, exerciseCount: exerciseIds.size };
  }
```

> **Implementation note:** The `computeSessionStats` helper uses `guidelineLoad.value × reps × sets` as a volume estimate because the per-set input data from `LogSegmentModal` is not passed back up to `ProgramDayScreen` in v1. This is an intentional simplification documented in the spec (§7 Out of Scope). A future iteration can pass actual logged weights back via the `onSave` callback if richer accuracy is needed.

### Replace `handleCompleteWorkout`

```ts
  const handleCompleteWorkout = async (): Promise<void> => {
    await hapticMedium();
    setSummaryVisible(true);
    // markDayComplete is deferred until the user dismisses the summary
  };

  const handleSummaryDismiss = async (): Promise<void> => {
    setSummaryVisible(false);
    await setWorkoutComplete(programDayId, true);
    setWorkoutCompleteState(true);
    markDayComplete.mutate({ programDayId, isCompleted: true, userId });
  };
```

Remove `setConfirmationText("Workout marked complete.")` from `handleCompleteWorkout` — the summary modal replaces it.

### Add `SessionSummaryModal` to JSX

Inside the `return` block, alongside the existing `<LogSegmentModal>`, add:

```tsx
      <SessionSummaryModal
        visible={summaryVisible}
        {...computeSessionStats()}
        prHits={prHits}
        onDismiss={() => { void handleSummaryDismiss(); }}
      />
```

### Update `handleUndoComplete`

The `handleUndoComplete` function references `setConfirmationText`. Since `confirmationText` state is now unused (the modal replaces it), you may either:
- Keep `confirmationText` state and the undo message as-is (low risk, minor dead state), or
- Remove `confirmationText` state entirely and update `handleUndoComplete` to not call `setConfirmationText`.

Prefer keeping it for undo feedback — it is still useful there. Remove only the `setConfirmationText("Workout marked complete.")` line from `handleCompleteWorkout`.

---

## Part 6 — Tests

Write tests in `mobile/src/components/program/__tests__/LogSegmentModal.test.tsx` and `mobile/src/components/program/__tests__/SessionSummaryModal.test.tsx`. Use `@testing-library/react-native` (install with `--legacy-peer-deps` if needed) and Jest.

### `LogSegmentModal` — guideline load prefill

```ts
// guidelinePrefill logic (unit test the helper directly or via the component)

describe("guidelinePrefill", () => {
  it("returns guidelineLoad.value when > 0", () => {
    expect(guidelinePrefill({ guidelineLoad: { value: 80 }, intensity: "RPE 7" })).toBe("80");
  });

  it("falls back to parseWeightPrefill when guidelineLoad is null", () => {
    expect(guidelinePrefill({ guidelineLoad: null, intensity: "70" })).toBe("70");
  });

  it("falls back when guidelineLoad.value is 0", () => {
    expect(guidelinePrefill({ guidelineLoad: { value: 0 }, intensity: "50" })).toBe("50");
  });

  it("returns empty string when both are unusable", () => {
    expect(guidelinePrefill({ guidelineLoad: null, intensity: "RPE 7-8" })).toBe("");
  });
});
```

### `LogSegmentModal` — per-set rows

```ts
it("renders N set rows for an exercise with sets: N", () => {
  // Render LogSegmentModal with a segment containing one exercise with sets: 3
  // Expect 3 weight inputs and 3 reps inputs
  const weightInputs = getAllByA11yLabel(/weight in kg/);
  expect(weightInputs).toHaveLength(3);
});

it("renders 1 set row when ex.sets is null", () => {
  // ex.sets = null → 1 row
  const weightInputs = getAllByA11yLabel(/weight in kg/);
  expect(weightInputs).toHaveLength(1);
});

it("handleSave submits rows with order_index 1, 2, 3 for a 3-set exercise", () => {
  // Verify the mutation payload rows array has orderIndex 1, 2, 3 for the exercise
});

it("existing log with orderIndex 2 prefills Set 2 inputs", () => {
  // existingLogsQuery returns a row with orderIndex: 2, weightKg: 85
  // Set 2 weight input should display "85"
});
```

### Rest timer auto-start

```ts
it("calls useTimerStore.startRest when maxRest > 0 on save", () => {
  const startRestMock = jest.fn();
  jest.spyOn(useTimerStore, "getState").mockReturnValue({ startRest: startRestMock } as any);
  // Trigger onSave with activeSegment.exercises[0].restSeconds = 90
  expect(startRestMock).toHaveBeenCalledWith(activeSegment.id);
});

it("does not call startRest when all exercises have restSeconds = 0", () => {
  // No startRest call expected
});
```

### `SessionSummaryModal`

```ts
it("opens when handleCompleteWorkout is tapped (before markDayComplete fires)", () => {
  // tap complete button → modal visible, markDayComplete not yet called
});

it("calls markDayComplete on dismiss", () => {
  // open modal, tap Done → markDayComplete.mutate called
});

it("displays totalVolumeKg and totalSets", () => {
  render(<SessionSummaryModal visible totalVolumeKg={1250} totalSets={12} exerciseCount={4} prHits={[]} onDismiss={jest.fn()} />);
  expect(getByText("1,250 kg")).toBeTruthy();
  expect(getByText("12")).toBeTruthy();
});

it("shows PR banner when prHits is non-empty", () => {
  render(<SessionSummaryModal visible totalVolumeKg={0} totalSets={0} exerciseCount={0} prHits={["Back Squat"]} onDismiss={jest.fn()} />);
  expect(getByText("New PR on Back Squat!")).toBeTruthy();
});
```

---

## Implementation Notes

1. **No backend changes.** The API already supports per-set rows via `order_index`. No migrations, no new routes.

2. **`ex.sets` type cast.** The `ProgramDayFullResponse` type may type `sets` as `string | null`. Cast with `Math.max(1, parseInt(String(ex.sets ?? "1"), 10) || 1)` if the number cast `(ex.sets as number)` causes TS errors.

3. **`ex.guidelineLoad` type.** If `guidelineLoad` is typed as `unknown` or `string | null` from the API response, the `guidelinePrefill` helper's `Number(glv)` cast handles both forms safely. Add a type assertion comment if the TS compiler complains.

4. **`useTimerStore` import in `ProgramDayScreen`.** The store already exports `useTimerStore` as a named export from `mobile/src/state/timer/useTimerStore.ts`. Import it and call `useTimerStore.getState().startRest(segmentId)` — do not call `useTimerStore()` (the hook form) at the call site because `ProgramDayScreen` already holds all timer state rendering through `SegmentCard`/`PremiumTimer`.

5. **`computeSessionStats` v1 accuracy.** The function uses guideline load × reps × sets as a volume estimate. This is intentionally approximate for v1. A note in a `// TODO` comment is sufficient.

6. **`prHits` state is an empty array in v1.** Server-side PR push notifications already fire via `segmentLog.js`. The mobile client does not poll for new PRs after save in this iteration. The `prHits` state variable exists so the UI wiring is in place for a future enhancement.

7. **File summary:**

| File | Change |
|------|--------|
| `mobile/src/components/program/LogSegmentModal.tsx` | Amend: guideline load prefill, per-set state + inputs + save |
| `mobile/src/screens/program/ProgramDayScreen.tsx` | Amend: rest timer auto-start, summary modal trigger + dismiss handler |
| `mobile/src/components/program/SessionSummaryModal.tsx` | **New file** |
| `mobile/src/components/program/__tests__/LogSegmentModal.test.tsx` | New tests |
| `mobile/src/components/program/__tests__/SessionSummaryModal.test.tsx` | New tests |
