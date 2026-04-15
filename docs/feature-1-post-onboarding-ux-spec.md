# Feature 1 Specification: Post-Onboarding UX Overhaul

## 1. What Is Already Built

Understand the existing architecture before reading the amendments. All of the infrastructure this feature builds on must not be re-implemented.

### 1.1 Tab navigation

The app has five tabs defined in `mobile/src/navigation/AppTabs.tsx`:

| Tab | Component | Description |
|-----|-----------|-------------|
| `HomeTab` | `OnboardingNavigator` | Onboarding flow + `ProgramReviewScreen` (has the "Generate Program" button) |
| `ProgramsTab` | `ProgramsStackNavigator` | `ProgramHub` → `ProgramDashboard` → `ProgramDay` |
| `TodayTab` | `TodayScreen` | Currently a redirect: auto-navigates to `ProgramsTab > ProgramDay` |
| `HistoryTab` | `HistoryStackNavigator` | History and PRs |
| `SettingsTab` | `SettingsScreen` | Settings |

### 1.2 `TodayScreen` (current, `mobile/src/screens/today/TodayScreen.tsx`)

A redirect screen. On mount it:
1. Resolves `resolvedProgramId` from `sessionStore.activeProgramId` or `useActivePrograms().data.primary_program_id`
2. Loads `useProgramOverview(resolvedProgramId)` to get `calendarDays`
3. Finds today's `programDayId` from `calendarDays` (falls back to first week 1 day)
4. Calls `navigation.navigate("ProgramsTab", { screen: "ProgramDay", params: { programDayId } })` automatically

**There is no rendered content beyond loading spinners.** The user never sees the Today tab as a destination — they pass through it immediately.

### 1.3 `ProgramReviewScreen` (current, `mobile/src/screens/program/ProgramReviewScreen.tsx`)

The terminal screen on `HomeTab`. After onboarding completes, `OnboardingEntry` routes to this screen. It shows:
- A summary of the user's profile (goals, equipment, schedule, metrics)
- A prominent sticky **"Generate Program" CTA** at the bottom of the screen

**The Generate button is always visible, even after a program has been generated.** When the user taps the `HomeTab` at any point after onboarding, they land here with the Generate button active.

After successful generation, the screen navigates to `ProgramsTab > ProgramDashboard`. The HomeTab still contains `ProgramReview` with the Generate button on the next tap.

### 1.4 `ProgramDashboardScreen` (do not re-implement)

`mobile/src/screens/program/ProgramDashboardScreen.tsx` — the full calendar-based dashboard. Already implements:
- `dayStatusByProgramDayId` from AsyncStorage via `getDayStatus`
- `weekStatusByNumber` computation
- `useFocusEffect` to refresh local day statuses on tab focus
- Week pill strip, calendar day pill row, day preview card

This screen remains unchanged. It is the detailed calendar view on the ProgramsTab.

### 1.5 Data hooks

| Hook | Returns |
|------|---------|
| `useActivePrograms()` | `{ programs, today_sessions, primary_program_id }` |
| `useProgramOverview(programId)` | `{ calendarDays, weeks, selectedDayPreview, program }` |
| `useDayPreview(programId, dayId)` | Day detail preview (label, type, sessionDuration) |

`today_sessions[]` from `useActivePrograms` contains: `{ program_day_id, program_id, day_label, program_title, program_type }`.

`selectedDayPreview` from `useProgramOverview` contains: `{ programDayId, label, type, sessionDuration, equipmentSlugs }`.

`calendarDays[]` from `useProgramOverview` contains: `{ id, calendarDate, scheduledDate, isTrainingDay, programDayId, weekNumber }`.

### 1.6 `OnboardingEntry.tsx` — console.log status

The file has been inspected. There are no `console.log` calls in the current version. This item from `ticket-maturity-gap-close.md` is already resolved.

---

## 2. What This Spec Adds

The current `TodayScreen` auto-navigates instead of rendering. The `ProgramReviewScreen` always shows "Generate Program" regardless of whether the user has an active program. Together these create the reported issues:

1. The app's home experience after onboarding is not context-aware — there is no "what should I do today?" surface
2. The "Generate Program" button is always visible and always prominent, even mid-program

This spec adds four amendments. No backend changes are required. No migrations are needed.

| Amendment | What it does |
|-----------|-------------|
| 1 | Refactor `TodayScreen` into a lifecycle-aware today dashboard |
| 2 | Add a `TodayWorkoutCard` component |
| 3 | Add a `WeekProgressBadge` component |
| 4 | Add an active-program guard to `ProgramReviewScreen` |

---

## 3. Lifecycle State Model

Define a `TodayLifecycleState` type used throughout `TodayScreen`:

```ts
type TodayLifecycleState =
  | "no_program"        // No active program exists
  | "today_scheduled"   // Today is a training day, not yet completed
  | "today_complete"    // Today is a training day and it has been logged complete
  | "today_rest"        // Today is a rest day (no training day on today's date)
  | "program_complete"; // All training days in the program are complete
```

### Computation function

Add a pure `computeLifecycleState` function (testable in isolation):

```ts
type ProgramDayStatus = "scheduled" | "started" | "complete";

function computeLifecycleState(params: {
  resolvedProgramId: string | null;
  calendarDays: Array<{
    calendarDate?: string | null;
    isTrainingDay?: boolean;
    programDayId?: string | null;
  }>;
  dayStatusByProgramDayId: Record<string, ProgramDayStatus>;
  todayIso: string; // "YYYY-MM-DD"
}): TodayLifecycleState {
  const { resolvedProgramId, calendarDays, dayStatusByProgramDayId, todayIso } = params;

  if (!resolvedProgramId) return "no_program";

  // All training days in the program
  const allTrainingDays = calendarDays.filter(
    (d) => d.isTrainingDay && d.programDayId,
  );

  // Today's training day entry (if any)
  const todayTrainingDay = allTrainingDays.find(
    (d) => d.calendarDate === todayIso,
  );

  if (todayTrainingDay?.programDayId) {
    const status =
      dayStatusByProgramDayId[todayTrainingDay.programDayId] ?? "scheduled";
    if (status === "complete") return "today_complete";
    return "today_scheduled";
  }

  // Check if program is entirely complete
  if (
    allTrainingDays.length > 0 &&
    allTrainingDays.every(
      (d) => dayStatusByProgramDayId[d.programDayId!] === "complete",
    )
  ) {
    return "program_complete";
  }

  return "today_rest";
}
```

Export this function so it can be unit tested independently.

---

## 4. Amendment 1 — Refactor `TodayScreen`

**File:** `mobile/src/screens/today/TodayScreen.tsx`

### Replace auto-navigate with lifecycle rendering

**Remove:**
- The `useEffect` that calls `navigation.navigate("ProgramsTab", ...)` automatically
- The `hasNavigatedRef` guard
- The loading state that says "Opening today's workout..."

**Keep:**
- `useActivePrograms` and `useProgramOverview` data fetching
- `resolvedProgramId` resolution
- `calendarDays` and `todayIso` derivation
- The "No Active Program" loading/error states

**Add:**
- `dayStatusByProgramDayId` state, initialized via `useFocusEffect` from AsyncStorage (copy the exact pattern from `ProgramDashboardScreen` lines 64–197 — `dayStatusByProgramDayId`, `refreshDayStatuses`, `useFocusEffect`, `programDayIdsSignature`)
- `computeLifecycleState` call producing the `lifecycleState` value
- State-appropriate rendering

### State rendering

#### `no_program`

Retain the existing "No Active Program" view:
```tsx
<View style={styles.centered}>
  <Text style={styles.title}>No Active Program</Text>
  <Text style={styles.subtitle}>Generate a program to unlock your Today workout.</Text>
  <PressableScale
    style={styles.primaryButton}
    onPress={() => navigation.navigate("HomeTab", { screen: "ProgramReview" })}
  >
    <Text style={styles.primaryLabel}>Get Started</Text>
  </PressableScale>
</View>
```

#### `today_scheduled`

```tsx
<ScrollView contentContainerStyle={styles.content}>
  <Text style={styles.greeting}>{greetingText()}</Text>

  <WeekProgressBadge
    weekNumber={currentWeekNumber}
    totalWeeks={totalWeeks}
    completedDaysThisWeek={completedDaysThisWeek}
    totalDaysThisWeek={totalDaysThisWeek}
  />

  <TodayWorkoutCard
    label={todayPreview?.label ?? "Today's Workout"}
    type={todayPreview?.type ?? ""}
    sessionDuration={todayPreview?.sessionDuration ?? null}
    onStartWorkout={() => {
      if (!todayProgramDayId) return;
      navigation.navigate("ProgramsTab", {
        screen: "ProgramDay",
        params: { programDayId: todayProgramDayId },
      });
    }}
  />
</ScrollView>
```

`greetingText()` returns a short motivational string. Keep it simple for v1:
```ts
function greetingText(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning. Time to work.";
  if (hour < 17) return "Good afternoon. Let's go.";
  return "Good evening. Still time to train.";
}
```

#### `today_complete`

```tsx
<View style={styles.centered}>
  <Text style={styles.title}>Today's workout is done.</Text>
  <Text style={styles.subtitle}>
    {nextScheduledDay
      ? `Next: ${nextScheduledDay.label ?? "next scheduled day"}`
      : "Rest and recover. See you next session."}
  </Text>
  <PressableScale
    style={styles.secondaryButton}
    onPress={() => navigation.navigate("ProgramsTab", { screen: "ProgramHub" })}
  >
    <Text style={styles.secondaryLabel}>View Full Program</Text>
  </PressableScale>
</View>
```

`nextScheduledDay` is the next `calendarDay` after today that has `isTrainingDay = true` and a `programDayId` not already complete.

#### `today_rest`

```tsx
<View style={styles.centered}>
  <Text style={styles.title}>Rest day.</Text>
  <Text style={styles.subtitle}>
    {nextScheduledDay
      ? `Next training: ${nextScheduledDay.calendarDate}`
      : "Enjoy the recovery."}
  </Text>
  <WeekProgressBadge ... />
  <PressableScale
    style={styles.secondaryButton}
    onPress={() => navigation.navigate("ProgramsTab", { screen: "ProgramHub" })}
  >
    <Text style={styles.secondaryLabel}>View Program</Text>
  </PressableScale>
</View>
```

#### `program_complete`

```tsx
<View style={styles.centered}>
  <Text style={styles.title}>Program complete!</Text>
  <Text style={styles.subtitle}>You finished all scheduled sessions. Ready for the next block?</Text>
  <PressableScale
    style={styles.primaryButton}
    onPress={() => navigation.navigate("HomeTab", { screen: "ProgramReview" })}
  >
    <Text style={styles.primaryLabel}>Generate New Program</Text>
  </PressableScale>
</View>
```

### Derived values in `TodayScreen`

Add these inside the component, after `calendarDays` is available:

```ts
// Current week number — the week that contains today or the most recent week with activity
const currentWeekNumber = useMemo(() => {
  const todayWeek = calendarDays.find(
    (d) => d.calendarDate === todayIso && d.weekNumber != null,
  )?.weekNumber;
  if (todayWeek) return todayWeek;
  // Fall back to the last week containing a complete day
  const completedDays = calendarDays.filter(
    (d) => d.programDayId && dayStatusByProgramDayId[d.programDayId] === "complete",
  );
  if (completedDays.length > 0) {
    return Math.max(...completedDays.map((d) => d.weekNumber ?? 1));
  }
  return 1;
}, [calendarDays, todayIso, dayStatusByProgramDayId]);

const totalWeeks = overviewQuery.data?.weeks?.length ?? 1;

const daysInCurrentWeek = useMemo(
  () =>
    calendarDays.filter(
      (d) => d.isTrainingDay && d.programDayId && d.weekNumber === currentWeekNumber,
    ),
  [calendarDays, currentWeekNumber],
);

const completedDaysThisWeek = daysInCurrentWeek.filter(
  (d) => dayStatusByProgramDayId[d.programDayId!] === "complete",
).length;

const totalDaysThisWeek = daysInCurrentWeek.length;

const todayTrainingDay = calendarDays.find(
  (d) => d.calendarDate === todayIso && d.isTrainingDay && d.programDayId,
);
const todayProgramDayId = todayTrainingDay?.programDayId ?? null;

// Today's workout preview — use selectedDayPreview if it matches today, otherwise undefined
const todayPreview = useMemo(() => {
  const preview = overviewQuery.data?.selectedDayPreview;
  if (!preview || !todayProgramDayId) return undefined;
  if (preview.programDayId === todayProgramDayId) return preview;
  return undefined;
}, [overviewQuery.data?.selectedDayPreview, todayProgramDayId]);

// Next training day after today that is not complete
const nextScheduledDay = useMemo(() => {
  return (
    calendarDays
      .filter(
        (d) =>
          d.isTrainingDay &&
          d.programDayId &&
          (d.calendarDate ?? "") > todayIso &&
          dayStatusByProgramDayId[d.programDayId] !== "complete",
      )
      .sort((a, b) => (a.calendarDate ?? "").localeCompare(b.calendarDate ?? ""))[0] ?? null
  );
}, [calendarDays, todayIso, dayStatusByProgramDayId]);
```

---

## 5. Amendment 2 — New Component: `TodayWorkoutCard`

**Create:** `mobile/src/components/today/TodayWorkoutCard.tsx`

```tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type TodayWorkoutCardProps = {
  label: string;           // e.g., "Day 3 — Upper Body"
  type: string;            // e.g., "Strength", "Hypertrophy", "Conditioning"
  sessionDuration: number | null;  // minutes, null if unknown
  onStartWorkout: () => void;
};

export function TodayWorkoutCard({
  label,
  type,
  sessionDuration,
  onStartWorkout,
}: TodayWorkoutCardProps): React.JSX.Element {
  const metaParts = [
    type || null,
    sessionDuration != null ? `${sessionDuration} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.card}>
      <Text style={styles.dayLabel}>{label}</Text>
      {metaParts ? <Text style={styles.meta}>{metaParts}</Text> : null}
      <PressableScale style={styles.startButton} onPress={onStartWorkout}>
        <Text style={styles.startLabel}>Start Workout</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dayLabel: {
    color: colors.textPrimary,
    ...typography.h2,
    fontWeight: "700",
  },
  meta: {
    color: colors.textSecondary,
    ...typography.body,
  },
  startButton: {
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  startLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
});
```

---

## 6. Amendment 3 — New Component: `WeekProgressBadge`

**Create:** `mobile/src/components/today/WeekProgressBadge.tsx`

```tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type WeekProgressBadgeProps = {
  weekNumber: number;
  totalWeeks: number;
  completedDaysThisWeek: number;
  totalDaysThisWeek: number;
};

export function WeekProgressBadge({
  weekNumber,
  totalWeeks,
  completedDaysThisWeek,
  totalDaysThisWeek,
}: WeekProgressBadgeProps): React.JSX.Element {
  return (
    <View style={styles.badge}>
      <Text style={styles.week}>
        Week {weekNumber} of {totalWeeks}
      </Text>
      {totalDaysThisWeek > 0 ? (
        <Text style={styles.days}>
          {completedDaysThisWeek}/{totalDaysThisWeek} days this week
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  week: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  days: {
    color: colors.textSecondary,
    ...typography.small,
  },
});
```

---

## 7. Amendment 4 — Active Program Guard in `ProgramReviewScreen`

**File:** `mobile/src/screens/program/ProgramReviewScreen.tsx`

### Problem

`ProgramReviewScreen` always renders the "Generate Program" sticky footer button. After a program has been generated, the user can return to `HomeTab` and see this button prominently. There is no indication that they already have an active program.

### Change

Add `useActivePrograms` to the component. If the query resolves and `programs.length > 0`:
- Show an information banner: "You already have an active program."
- Replace the "Generate Program" sticky footer with a "View Today's Workout" primary CTA
- Demote generation to a secondary text link below the banner: "Generate a new program anyway →" with a warning (clicking it still calls `handleGenerate`)

```ts
// Add import
import { useActivePrograms } from "../../api/hooks";

// Add in component body alongside other queries:
const activeProgramsQuery = useActivePrograms();
const hasActiveProgram =
  (activeProgramsQuery.data?.programs?.length ?? 0) > 0;
```

Replace the sticky footer JSX:

```tsx
<View style={styles.footer}>
  {hasActiveProgram ? (
    <>
      <PressableScale
        style={styles.generateButton}
        onPress={() => {
          const parent = navigation.getParent();
          if (parent) {
            (parent as any).navigate("TodayTab" as never);
          }
        }}
      >
        <Text style={styles.generateLabel}>View Today&apos;s Workout</Text>
      </PressableScale>
      <PressableScale
        style={styles.generateSecondary}
        onPress={() => void handleGenerate()}
        disabled={isGenerating}
      >
        <Text style={styles.generateSecondaryLabel}>
          {isGenerating ? "Generating..." : "Generate a new program"}
        </Text>
      </PressableScale>
    </>
  ) : (
    <PressableScale
      style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]}
      onPress={() => void handleGenerate()}
      disabled={isGenerating}
    >
      <Text style={styles.generateLabel}>{isGenerating ? "Generating..." : "Generate Program"}</Text>
    </PressableScale>
  )}
</View>
```

Add the new style entries:

```ts
  generateSecondary: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  generateSecondaryLabel: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
```

### Active program banner

Add above the ScrollView (below the `isGenerating` overlay guard), show when `hasActiveProgram && !isGenerating`:

```tsx
{hasActiveProgram ? (
  <View style={styles.activeProgramBanner}>
    <Text style={styles.activeProgramBannerText}>
      You already have an active program. Generating a new one will replace it.
    </Text>
  </View>
) : null}
```

Banner styles:
```ts
  activeProgramBanner: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
  },
  activeProgramBannerText: {
    color: colors.textSecondary,
    ...typography.small,
    textAlign: "center",
  },
```

---

## 8. Mobile Component Test Coverage

As specified in `ticket-maturity-9.md` Gap 1 and folded into this feature.

### Install

```bash
cd mobile
npm install --legacy-peer-deps @testing-library/react-native jest @types/jest
```

Configure Jest in `mobile/package.json` (or `jest.config.ts`) to use `babel-jest` transformer and point preset to `react-native`.

### Test files to create

#### `mobile/src/state/onboarding/__tests__/resumeLogic.test.ts`

Test `getResumeStep` in `mobile/src/state/onboarding/resumeLogic.ts`:
- Profile with `onboardingStepCompleted = 0` → returns step 1
- Profile with goals set but no equipment → returns step 2
- Profile fully complete → returns `"done"`

#### `mobile/src/state/onboarding/__tests__/fromProfile.test.ts`

Test `resetFromProfile` (the Zustand action in `onboardingStore.ts`) with a mock profile:
- All fields map correctly into draft state
- Missing optional fields produce safe defaults

#### `mobile/src/state/onboarding/__tests__/validators.test.ts`

Test the field validators (wherever they live in the onboarding state layer):
- Valid goals array → passes
- Empty goals array → fails with expected message
- Invalid schedule (0 days selected) → fails

#### `mobile/src/components/program/__tests__/GuidelineLoadHint.test.tsx`

If a `GuidelineLoadHint` component exists, test its rendering:
- `guidelineLoad.value = 80` → renders "80 kg" or similar
- `guidelineLoad = null` → renders nothing or placeholder

#### `mobile/src/screens/today/__tests__/computeLifecycleState.test.ts`

```ts
import { computeLifecycleState } from "../TodayScreen";

describe("computeLifecycleState", () => {
  const today = "2026-04-15";

  it("returns no_program when no programId", () => {
    expect(
      computeLifecycleState({
        resolvedProgramId: null,
        calendarDays: [],
        dayStatusByProgramDayId: {},
        todayIso: today,
      }),
    ).toBe("no_program");
  });

  it("returns today_scheduled when today is a training day not yet complete", () => {
    expect(
      computeLifecycleState({
        resolvedProgramId: "p1",
        calendarDays: [
          { calendarDate: today, isTrainingDay: true, programDayId: "d1" },
        ],
        dayStatusByProgramDayId: {},
        todayIso: today,
      }),
    ).toBe("today_scheduled");
  });

  it("returns today_complete when today is a training day already logged complete", () => {
    expect(
      computeLifecycleState({
        resolvedProgramId: "p1",
        calendarDays: [
          { calendarDate: today, isTrainingDay: true, programDayId: "d1" },
        ],
        dayStatusByProgramDayId: { d1: "complete" },
        todayIso: today,
      }),
    ).toBe("today_complete");
  });

  it("returns today_rest when no training day matches today", () => {
    expect(
      computeLifecycleState({
        resolvedProgramId: "p1",
        calendarDays: [
          { calendarDate: "2026-04-16", isTrainingDay: true, programDayId: "d2" },
        ],
        dayStatusByProgramDayId: {},
        todayIso: today,
      }),
    ).toBe("today_rest");
  });

  it("returns program_complete when all training days are complete", () => {
    expect(
      computeLifecycleState({
        resolvedProgramId: "p1",
        calendarDays: [
          { calendarDate: "2026-04-10", isTrainingDay: true, programDayId: "d1" },
          { calendarDate: "2026-04-12", isTrainingDay: true, programDayId: "d2" },
        ],
        dayStatusByProgramDayId: { d1: "complete", d2: "complete" },
        todayIso: today,
      }),
    ).toBe("program_complete");
  });
});
```

---

## 9. Files Changed

| File | Change |
|------|--------|
| `mobile/src/screens/today/TodayScreen.tsx` | Major amendment: lifecycle-aware rendering, remove auto-navigate |
| `mobile/src/screens/program/ProgramReviewScreen.tsx` | Amendment: active program guard, degrade CTA when program exists |
| `mobile/src/components/today/TodayWorkoutCard.tsx` | **New file** |
| `mobile/src/components/today/WeekProgressBadge.tsx` | **New file** |
| `mobile/src/screens/today/__tests__/computeLifecycleState.test.ts` | **New file** |
| `mobile/src/state/onboarding/__tests__/resumeLogic.test.ts` | **New file** |
| `mobile/src/state/onboarding/__tests__/fromProfile.test.ts` | **New file** |
| `mobile/src/state/onboarding/__tests__/validators.test.ts` | **New file** |

No backend changes. No migrations. No new API routes.

---

## 10. What Is Explicitly Out of Scope

1. **Visual redesign** — `TodayWorkoutCard` and `WeekProgressBadge` use the existing design token system without introducing new colour palette entries, gradients, or animations. That is Feature 2.

2. **Streak display** — Streak data is available on the history overview (`GET /api/history/overview`) but reading it on the Today screen adds a third parallel query. Defer to Feature 2 when the full home screen design pass justifies the extra query.

3. **Push notification deep-link to Today** — The TodayTab can be targeted via deep link once the lifecycle screen exists. Wiring deep links is out of scope for this feature.

4. **Recalibrate / goal refresh** — The `program_complete` state shows a "Generate New Program" CTA that routes to `ProgramReview`. Mid-program adjustment and full recalibration is Feature 10.

5. **Physique AI weekly check-in prompt** — The `today_complete` and `today_rest` states are natural candidates for a physique check-in nudge. That belongs in Feature 4.
