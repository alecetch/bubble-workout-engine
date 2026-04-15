# Codex Prompt: Feature 5 — Progress Visualization (First Delivery Slice)

## Goal

Build the athlete-facing visualization layer (Feature 5, first delivery slice):

1. Fix three small mobile type/API gaps
2. Create a `HistoryStackNavigator` that adds `ExerciseTrend` and `ProgressOverview` screens to the existing History tab
3. Build the Exercise Trend screen — e1RM line chart with decision markers, range pills
4. Build the Progress Overview screen — weekly volume bar chart, strength snapshots, streak

The backend is **already fully implemented**. All new fields (`estimatedE1rmKg`, `decisionOutcome`, `decisionPrimaryLever`, `bestEstimatedE1rmKg`, `weeklyVolumeByRegion8w`, `shareLabel`, `milestoneType`) are already returned by the API. This task is 100% mobile.

No new tables. No new API routes. No new backend files.

---

## Context files to read before writing any code

- `mobile/src/api/history.ts` — All types and fetch functions; the three gaps are identified below
- `mobile/src/api/hooks.ts` — All React Query hooks; `useExerciseHistory`, `useSessionHistoryMetrics`, `usePrsFeed` already exist
- `mobile/src/navigation/AppTabs.tsx` — Tab navigator; `HistoryTab` currently uses `HistoryScreen` directly
- `mobile/src/navigation/ProgramsStackNavigator.tsx` — Pattern to follow for new stack navigator
- `mobile/src/screens/history/HistoryScreen.tsx` — Existing history screen; has exercise search with tap-to-summary, PRs section, timeline — understand fully before modifying
- `mobile/src/theme/colors.ts` — Dark theme tokens: `background: #0F172A`, `card: #1E293B`, `accent: #3B82F6`, `success: #22C55E`, `warning: #FACC15`, `error: #EF4444`, `textPrimary: #F1F5F9`, `textSecondary: #94A3B8`, `border: #334155`
- `mobile/src/theme/spacing.ts` — Spacing scale
- `mobile/src/theme/typography.ts` — Font sizes and weights

---

## Part 1 — Fix three type/API gaps in `mobile/src/api/history.ts`

### Gap 1: `SessionHistoryMetrics` missing `weeklyVolumeByRegion8w`

**Add these types** (before `SessionHistoryMetrics`):

```ts
export type WeeklyVolumePoint = {
  weekStart: string;
  volumeLoad: number;
};

export type WeeklyVolumeByRegion8w = {
  upper: WeeklyVolumePoint[];
  lower: WeeklyVolumePoint[];
  full: WeeklyVolumePoint[];
};
```

**Add `weeklyVolumeByRegion8w` to `SessionHistoryMetrics`:**

```ts
export type SessionHistoryMetrics = {
  // ... existing fields ...
  weeklyVolumeByRegion8w: WeeklyVolumeByRegion8w;
};
```

**Update `normalizeSessionHistoryMetrics`** to include:

```ts
weeklyVolumeByRegion8w: normalizeWeeklyVolumeByRegion(root.weeklyVolumeByRegion8w),
```

**Add the helper function** before `normalizeSessionHistoryMetrics`:

```ts
function normalizeWeeklyVolumePoint(raw: unknown): WeeklyVolumePoint {
  const row = asObject(raw);
  return {
    weekStart: toDateOnly(row.weekStart),
    volumeLoad: asNumber(row.volumeLoad, 0),
  };
}

function normalizeWeeklyVolumeByRegion(raw: unknown): WeeklyVolumeByRegion8w {
  const root = asObject(raw);
  return {
    upper: asArray(root.upper).map(normalizeWeeklyVolumePoint),
    lower: asArray(root.lower).map(normalizeWeeklyVolumePoint),
    full: asArray(root.full).map(normalizeWeeklyVolumePoint),
  };
}
```

### Gap 2: `fetchExerciseHistory` doesn't pass the `window` param

The function signature `fetchExerciseHistory(exerciseId: string, userId?: string)` ignores the window. The API supports `?window=4w|8w|12w|all`.

**Update the signature and implementation:**

```ts
export async function fetchExerciseHistory(
  exerciseId: string,
  window: ExerciseHistoryWindow = "12w",
  userId?: string,
): Promise<ExerciseHistoryResponse> {
  const params = new URLSearchParams();
  params.set("window", window);
  params.set("include_decisions", "true");
  if (userId) params.set("user_id", userId);
  const raw = await authGetJson<unknown>(
    `/api/v1/history/exercise/${encodeURIComponent(exerciseId)}?${params.toString()}`,
  );
  return normalizeExerciseHistory(raw);
}
```

### Gap 3: `PrsFeedRow` missing `shareLabel` and `milestoneType`

**Add the fields to the type:**

```ts
export type PrsFeedRow = {
  // ... existing fields ...
  shareLabel: string | null;
  milestoneType: string | null;
};
```

**Update `normalizePrsFeed` rows mapping** to include:

```ts
shareLabel: asNullableString(row.shareLabel),
milestoneType: asNullableString(row.milestoneType),
```

---

## Part 2 — Update `mobile/src/api/hooks.ts`

### Update `useExerciseHistory`

The existing hook signature is `useExerciseHistory(exerciseId: string | null, userId?: string)`. Extend it to accept and forward `window`:

```ts
export function useExerciseHistory(
  exerciseId: string | null,
  window: ExerciseHistoryWindow = "12w",
  userId?: string,
): UseQueryResult<ExerciseHistoryResponse> {
  return useQuery({
    queryKey: [...queryKeys.exerciseHistory(exerciseId ?? ""), window, userId ?? null],
    queryFn: () => fetchExerciseHistory(exerciseId as string, window, userId),
    enabled: Boolean(exerciseId),
    staleTime: HISTORY_STALE_MS,
  });
}
```

**Import `ExerciseHistoryWindow`** from `./history` — add it to the existing import block.

---

## Part 3 — New `mobile/src/navigation/HistoryStackNavigator.tsx`

Replace the direct `HistoryScreen` in `AppTabs.tsx` with a stack navigator. Pattern: follow `ProgramsStackNavigator.tsx` exactly.

**New file:**

```ts
import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HistoryScreen } from "../screens/history/HistoryScreen";
import { ExerciseTrendScreen } from "../screens/history/ExerciseTrendScreen";
import { ProgressOverviewScreen } from "../screens/history/ProgressOverviewScreen";

export type HistoryStackParamList = {
  HistoryMain: undefined;
  ExerciseTrend: { exerciseId: string; exerciseName: string };
  ProgressOverview: undefined;
};

const Stack = createNativeStackNavigator<HistoryStackParamList>();

export function HistoryStackNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator
      initialRouteName="HistoryMain"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="HistoryMain" component={HistoryScreen} />
      <Stack.Screen name="ExerciseTrend" component={ExerciseTrendScreen} />
      <Stack.Screen name="ProgressOverview" component={ProgressOverviewScreen} />
    </Stack.Navigator>
  );
}
```

---

## Part 4 — Update `mobile/src/navigation/AppTabs.tsx`

**4a. Import `HistoryStackNavigator`:**

```ts
import { HistoryStackNavigator, type HistoryStackParamList } from "./HistoryStackNavigator";
```

Remove the direct `HistoryScreen` import.

**4b. Update `RootTabParamList`:**

```ts
HistoryTab: NavigatorScreenParams<HistoryStackParamList> | undefined;
```

Import `NavigatorScreenParams` from `@react-navigation/native` (already imported).

**4c. Replace the HistoryTab screen declaration:**

```ts
<Tab.Screen
  name="HistoryTab"
  component={HistoryStackNavigator}
  options={{ title: "History" }}
/>
```

---

## Part 5 — Update `mobile/src/screens/history/HistoryScreen.tsx`

The existing screen is a single flat scroll view. Make two targeted changes:

### 5a. Add navigation type

`HistoryScreen` currently receives no navigation prop. Add typed navigation:

```ts
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { HistoryStackParamList } from "../../navigation/HistoryStackNavigator";

type HistoryScreenNavProp = NativeStackNavigationProp<HistoryStackParamList, "HistoryMain">;
```

Import `useNavigation` from `@react-navigation/native`:

```ts
const navigation = useNavigation<HistoryScreenNavProp>();
```

### 5b. Tap exercise → navigate to ExerciseTrend

The existing screen shows exercise summary cards after a search or PR tap. Find where `ExerciseSummaryCard` or the exercise tap handler is — it currently calls `setSelectedExercise(item.exerciseId)` or similar. Replace any in-screen expansion with a navigation push:

```ts
navigation.navigate("ExerciseTrend", {
  exerciseId: item.exerciseId,
  exerciseName: item.exerciseName ?? item.exerciseId,
});
```

This applies to: exercise search result row tap, PR row tap (where exerciseId is available).

### 5c. Add Progress Overview button

At the top of the scroll content (before the metrics grid), add a tappable card:

```tsx
<PressableScale onPress={() => navigation.navigate("ProgressOverview")} style={styles.progressCard}>
  <Text style={styles.progressCardTitle}>Progress Overview</Text>
  <Text style={styles.progressCardSubtitle}>Volume trends & strength snapshots</Text>
</PressableScale>
```

Style it like the existing section cards: background `colors.card`, border `colors.border`, radius `radii.md`, padding `spacing.md`.

---

## Part 6 — New `mobile/src/screens/history/ExerciseTrendScreen.tsx`

### Screen purpose

Shows the strength trend for one exercise: e1RM line chart, decision markers, range pills, summary stats.

### Props / Route

Receives `{ exerciseId: string; exerciseName: string }` from navigation params.

```ts
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { HistoryStackParamList } from "../../navigation/HistoryStackNavigator";

type Props = NativeStackScreenProps<HistoryStackParamList, "ExerciseTrend">;
```

### Data

```ts
const [window, setWindow] = useState<ExerciseHistoryWindow>("12w");
const { data, userId } = ...; // useSessionStore for userId, useExerciseHistory for data
```

Use `useExerciseHistory(exerciseId, window, userId)`.

### Layout

```
SafeAreaView (background: colors.background)
  ScrollView
    Header row: back chevron + exercise name
    Summary row: 3 stat chips (Best E1RM, Top Weight, Sessions)
    Range pills: [4W] [8W] [12W] [All]
    E1RM line chart (SVG)
    Decision legend row
    Empty state (if series is empty)
```

### Range pills

```tsx
const WINDOWS: { label: string; value: ExerciseHistoryWindow }[] = [
  { label: "4W", value: "4w" },
  { label: "8W", value: "8w" },
  { label: "12W", value: "12w" },
  { label: "All", value: "all" },
];
```

Active pill: `backgroundColor: colors.accent`, text `colors.textPrimary`. Inactive: `colors.card`, text `colors.textSecondary`.

### SVG Line Chart

Use `react-native-svg` (already installed). The chart renders the `estimatedE1rmKg` series as a polyline. Decision markers appear as colored circles on top.

**Chart dimensions:** width = `Dimensions.get("window").width - spacing.lg * 2`, height = `200`.

**Implementation pattern:**

```ts
function buildChartPath(
  series: ExerciseHistoryPoint[],
  chartWidth: number,
  chartHeight: number,
): { points: string; markers: { cx: number; cy: number; outcome: string | null }[] } {
  // Filter points that have estimatedE1rmKg
  const valid = series.filter((p) => p.estimatedE1rmKg != null);
  if (valid.length < 2) return { points: "", markers: [] };

  const values = valid.map((p) => p.estimatedE1rmKg as number);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const PADDING = { top: 16, bottom: 16, left: 8, right: 8 };
  const plotW = chartWidth - PADDING.left - PADDING.right;
  const plotH = chartHeight - PADDING.top - PADDING.bottom;

  const toX = (i: number) => PADDING.left + (i / (valid.length - 1)) * plotW;
  const toY = (v: number) => PADDING.top + plotH - ((v - minVal) / range) * plotH;

  const points = valid.map((p, i) => `${toX(i)},${toY(p.estimatedE1rmKg as number)}`).join(" ");
  const markers = valid.map((p, i) => ({
    cx: toX(i),
    cy: toY(p.estimatedE1rmKg as number),
    outcome: p.decisionOutcome,
  }));

  return { points, markers };
}
```

**Decision marker color:**

```ts
function decisionColor(outcome: string | null): string {
  switch (outcome) {
    case "increase_load":
    case "increase_reps":
      return colors.success;
    case "hold":
      return colors.textSecondary;
    case "deload_local":
      return colors.warning;
    default:
      return "transparent";
  }
}
```

**SVG render:**

```tsx
import Svg, { Polyline, Circle } from "react-native-svg";

// Inside the component:
const { points, markers } = buildChartPath(series, chartWidth, 200);

<Svg width={chartWidth} height={200}>
  {points ? (
    <Polyline
      points={points}
      fill="none"
      stroke={colors.accent}
      strokeWidth={2}
    />
  ) : null}
  {markers.map((m, i) => (
    decisionColor(m.outcome) !== "transparent" ? (
      <Circle key={i} cx={m.cx} cy={m.cy} r={5} fill={decisionColor(m.outcome)} />
    ) : (
      <Circle key={i} cx={m.cx} cy={m.cy} r={3} fill={colors.accent} opacity={0.5} />
    )
  ))}
</Svg>
```

**Text summary fallback** (accessibility): below the chart, render a `<Text>` line like:
`"${series.length} sessions logged. Best estimated 1RM: ${summary.bestEstimatedE1rmKg ?? "n/a"} kg."`

### Decision legend

Below the chart, one row:

```
● Increase load   ● Increase reps   ● Hold   ● Deload
```

Each dot uses `decisionColor()`. Text `colors.textSecondary`, font size 11.

### Summary stat chips

Three chips in a row: `Best E1RM`, `Top Weight`, `Sessions`. Use `summary.bestEstimatedE1rmKg`, `summary.bestWeightKg`, `summary.sessionsCount`. Style: background `colors.card`, border `colors.border`, flex 1, center-aligned.

### Loading / empty states

- Loading: centered `ActivityIndicator` with `color={colors.accent}`
- Empty series: centered text "No data yet for this exercise."

---

## Part 7 — New `mobile/src/screens/history/ProgressOverviewScreen.tsx`

### Screen purpose

Shows the 8-week volume trend bar chart, upper/lower strength snapshot cards, and the streak/consistency row.

### Data

```ts
const userId = useSessionStore((s) => s.userId);
const { data: metrics, isLoading, refetch } = useSessionHistoryMetrics(userId ?? undefined);
```

### Layout

```
SafeAreaView (background: colors.background)
  ScrollView
    Header row: back chevron + "Progress Overview"
    Region toggle pills: [Full] [Upper] [Lower]  (default: Full)
    Weekly volume bar chart (SVG)
    Strength snapshot row: upper card + lower card
    Streak & consistency row
```

### Region toggle

```ts
type RegionKey = "full" | "upper" | "lower";
const [region, setRegion] = useState<RegionKey>("full");
```

Pill style: same as ExerciseTrendScreen range pills.

### SVG Bar Chart

**Chart dimensions:** width = `Dimensions.get("window").width - spacing.lg * 2`, height = `180`.

The active region's `WeeklyVolumePoint[]` array drives the bars.

**Implementation:**

```ts
function buildBarChart(
  data: WeeklyVolumePoint[],
  chartWidth: number,
  chartHeight: number,
): { bars: { x: number; y: number; w: number; h: number; label: string }[] } {
  if (data.length === 0) return { bars: [] };

  const PADDING = { top: 8, bottom: 24, left: 8, right: 8 };
  const plotW = chartWidth - PADDING.left - PADDING.right;
  const plotH = chartHeight - PADDING.top - PADDING.bottom;

  const maxVol = Math.max(...data.map((d) => d.volumeLoad), 1);
  const barGap = 4;
  const barW = Math.max(4, plotW / data.length - barGap);

  const bars = data.map((d, i) => {
    const barH = (d.volumeLoad / maxVol) * plotH;
    const x = PADDING.left + i * (barW + barGap);
    const y = PADDING.top + plotH - barH;
    // Label: "Jan 5" from weekStart
    const date = new Date(`${d.weekStart}T00:00:00Z`);
    const label = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return { x, y, w: barW, h: Math.max(2, barH), label };
  });

  return { bars };
}
```

**SVG render:**

```tsx
import Svg, { Rect, Text as SvgText } from "react-native-svg";

const seriesData = metrics?.weeklyVolumeByRegion8w?.[region] ?? [];
const { bars } = buildBarChart(seriesData, chartWidth, 180);

<Svg width={chartWidth} height={180}>
  {bars.map((b, i) => (
    <React.Fragment key={i}>
      <Rect x={b.x} y={b.y} width={b.w} height={b.h} fill={colors.accent} rx={2} />
      {i % 2 === 0 ? (
        <SvgText
          x={b.x + b.w / 2}
          y={180 - 4}
          fontSize={9}
          fill={colors.textSecondary}
          textAnchor="middle"
        >
          {b.label}
        </SvgText>
      ) : null}
    </React.Fragment>
  ))}
</Svg>
```

**Text summary fallback**: below the chart, render a `<Text>`:
`"${seriesData.length} weeks of data. Peak week: ${Math.max(...seriesData.map(d => d.volumeLoad), 0).toLocaleString()} kg volume load."`

**Empty state**: if `seriesData.length === 0`, show "No volume data for this region yet."

### Strength snapshot cards

Two cards side by side (flexDirection: row, gap: spacing.sm). Each card:

```tsx
function StrengthCard({
  label,
  data,
}: {
  label: string;
  data: SessionHistoryStrengthRegion | null;
}): React.JSX.Element {
  return (
    <View style={styles.strengthCard}>
      <Text style={styles.strengthCardRegion}>{label}</Text>
      {data ? (
        <>
          <Text style={styles.strengthCardExercise}>{data.exerciseName}</Text>
          <Text style={styles.strengthCardValue}>{data.bestE1rmKg.toFixed(1)} kg</Text>
          {data.trendPct != null ? (
            <Text
              style={[
                styles.strengthCardTrend,
                { color: data.trendPct >= 0 ? colors.success : colors.error },
              ]}
            >
              {data.trendPct >= 0 ? "+" : ""}{data.trendPct.toFixed(1)}%
            </Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.strengthCardEmpty}>No data</Text>
      )}
    </View>
  );
}
```

Usage:

```tsx
<View style={{ flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg }}>
  <StrengthCard label="Upper Body" data={metrics?.strengthUpper28d ?? null} />
  <StrengthCard label="Lower Body" data={metrics?.strengthLower28d ?? null} />
</View>
```

### Streak & consistency row

```tsx
<View style={styles.streakRow}>
  <View style={styles.streakChip}>
    <Text style={styles.streakValue}>{metrics?.dayStreak ?? 0}</Text>
    <Text style={styles.streakLabel}>Day streak</Text>
  </View>
  <View style={styles.streakChip}>
    <Text style={styles.streakValue}>{metrics?.consistency28d?.completed ?? 0}</Text>
    <Text style={styles.streakLabel}>Sessions (28d)</Text>
  </View>
  <View style={styles.streakChip}>
    <Text style={styles.streakValue}>{metrics ? `${Math.round(metrics.consistency28d.rate * 100)}%` : "—"}</Text>
    <Text style={styles.streakLabel}>Consistency</Text>
  </View>
</View>
```

Chip style: background `colors.card`, border `colors.border`, flex 1, center-aligned, padding `spacing.sm`, border radius `radii.md`.

### Loading state

Centered `ActivityIndicator` with `color={colors.accent}`.

---

## Part 8 — Tests

**New file: `mobile/src/api/__tests__/history.test.ts`**

Use `node:test` + `node:assert/strict`. No mocking of fetch needed — test the pure normalizer functions by calling them directly with synthetic data.

Import the pure normalizers directly. Since they are not currently exported, you must export them from `history.ts`:

```ts
// Add these exports to history.ts alongside the existing fetch functions:
export { normalizeWeeklyVolumeByRegion, normalizeSessionHistoryMetrics };
```

**Wait** — before exporting, check if those functions are currently unexported private functions. They are (no `export` keyword). Add `export` to them.

### Test cases

```ts
test("normalizeWeeklyVolumeByRegion returns structured upper/lower/full arrays", () => {
  const raw = {
    upper: [{ weekStart: "2026-03-02T00:00:00Z", volumeLoad: 4200 }],
    lower: [{ weekStart: "2026-03-02", volumeLoad: 5100 }],
    full: [],
  };
  const result = normalizeWeeklyVolumeByRegion(raw);
  assert.equal(result.upper[0].weekStart, "2026-03-02");
  assert.equal(result.upper[0].volumeLoad, 4200);
  assert.equal(result.lower[0].volumeLoad, 5100);
  assert.deepEqual(result.full, []);
});

test("normalizeWeeklyVolumeByRegion returns empty arrays when field is missing", () => {
  const result = normalizeWeeklyVolumeByRegion({});
  assert.deepEqual(result, { upper: [], lower: [], full: [] });
});

test("normalizeSessionHistoryMetrics includes weeklyVolumeByRegion8w", () => {
  const raw = {
    dayStreak: 5,
    consistency28d: { completed: 8, scheduled: 12, rate: 0.67 },
    volume28d: 48000,
    strengthUpper28d: null,
    strengthLower28d: null,
    sessionsCount: 20,
    programmesCompleted: 2,
    weeklyVolumeByRegion8w: {
      upper: [{ weekStart: "2026-03-02", volumeLoad: 3000 }],
      lower: [],
      full: [{ weekStart: "2026-03-02", volumeLoad: 6000 }],
    },
  };
  const result = normalizeSessionHistoryMetrics(raw);
  assert.equal(result.dayStreak, 5);
  assert.equal(result.weeklyVolumeByRegion8w.upper[0].volumeLoad, 3000);
  assert.deepEqual(result.weeklyVolumeByRegion8w.lower, []);
  assert.equal(result.weeklyVolumeByRegion8w.full[0].weekStart, "2026-03-02");
});

test("normalizeSessionHistoryMetrics weeklyVolumeByRegion8w defaults to empty when absent", () => {
  const raw = {
    dayStreak: 0,
    consistency28d: { completed: 0, scheduled: 0, rate: 0 },
    volume28d: 0,
    strengthUpper28d: null,
    strengthLower28d: null,
    sessionsCount: 0,
    programmesCompleted: 0,
  };
  const result = normalizeSessionHistoryMetrics(raw);
  assert.deepEqual(result.weeklyVolumeByRegion8w, { upper: [], lower: [], full: [] });
});
```

**Add the test script path** — the existing test script `src/**/*.test.ts` already covers `src/api/__tests__/history.test.ts`, so no script changes needed.

---

## Part 9 — Export verification

After all changes, run this grep to confirm no broken references:

```bash
grep -rn "useExerciseHistory" mobile/src --include="*.ts" --include="*.tsx"
```

All call sites must now pass `window` as the second argument (or accept the `"12w"` default). The existing `HistoryScreen.tsx` does not currently call `useExerciseHistory` directly — it uses `useExerciseSummary` and the search flow. If any other call site is found, update the argument order.

---

## Summary of files changed

| File | Change |
|---|---|
| `mobile/src/api/history.ts` | Add `WeeklyVolumePoint`, `WeeklyVolumeByRegion8w` types; add to `SessionHistoryMetrics`; update `normalizeSessionHistoryMetrics`; add `normalizeWeeklyVolumeByRegion` (exported); update `fetchExerciseHistory` to pass `window`; add `shareLabel`/`milestoneType` to `PrsFeedRow`; update `normalizePrsFeed` |
| `mobile/src/api/hooks.ts` | Update `useExerciseHistory` to accept `window` param; import `ExerciseHistoryWindow` |
| `mobile/src/navigation/HistoryStackNavigator.tsx` | New file — stack navigator wrapping HistoryMain, ExerciseTrend, ProgressOverview |
| `mobile/src/navigation/AppTabs.tsx` | Replace `HistoryScreen` with `HistoryStackNavigator`; update `RootTabParamList` |
| `mobile/src/screens/history/HistoryScreen.tsx` | Add typed navigation prop; exercise/PR tap navigates to `ExerciseTrend`; add Progress Overview card |
| `mobile/src/screens/history/ExerciseTrendScreen.tsx` | New file — e1RM line chart, decision markers, range pills |
| `mobile/src/screens/history/ProgressOverviewScreen.tsx` | New file — volume bar chart, region toggle, strength cards, streak row |
| `mobile/src/api/__tests__/history.test.ts` | New file — 4 normalizer unit tests |

No migrations. No backend changes. No new npm packages.
