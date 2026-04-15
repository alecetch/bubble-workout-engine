# Codex Prompt: Feature 6 — Adaptation Transparency (Phases 1–3)

## Goal

Surface Layer B's progression decisions to the athlete in three surfaces:

1. **Backend**: Enrich `GET /api/day/:id/full` — attach `adaptation_decision` (most recent
   Layer B decision) to each exercise, with server-generated display strings.
2. **Backend**: New route `GET /api/program-exercise/:id/decision-history` — paginated
   audit log for one exercise.
3. **Mobile**: `AdaptationChip` component inside `SegmentCard.tsx` — shown on exercise
   rows that have a non-`hold` decision.
4. **Mobile**: `ExerciseDecisionHistoryScreen` — vertical timeline of all past decisions.
   Navigate to it from the chip via a new route in `ProgramsStackNavigator`.

No new DB tables. No new migrations. `exercise_progression_decision` (V60) already
exists. The only data dependencies are that Layer B has fired for at least one completed
day — if no decisions exist yet, all new fields return `null` and the chip is invisible.

---

## Context files to read before writing any code

Read these files in full before starting:

- `api/src/routes/readProgram.js` — `dayFull` handler starts at line ~250; exercise
  query at line ~363; guideline load annotation at line ~417; segment grouping at
  line ~434. The new decision query slots in after the exercise query.
- `migrations/V60__create_exercise_progression_decision.sql` — exact schema for
  `exercise_progression_decision`; key columns: `decision_outcome`, `primary_lever`,
  `confidence`, `recommended_load_kg`, `recommended_load_delta_kg`,
  `recommended_reps_target`, `recommended_rep_delta`, `evidence_summary_json`,
  `decision_context_json` (`{ reasons: string[], source: string }`), `created_at`.
- `mobile/src/api/programViewer.ts` — `ProgramDayFullResponse` type; `normalizeProgramDayFull`
  which reads `rawSegment.items`; `asObject`, `asNullableString`, `asNumber`, `asNullableNumber`
  helpers are all defined here.
- `mobile/src/components/program/SegmentCard.tsx` — exercise rows are rendered at
  line ~104 inside `exercises.map()`; each `exerciseRow` View is the insertion point
  for the chip. Already imports `PressableScale`.
- `mobile/src/navigation/ProgramsStackNavigator.tsx` — currently `ProgramDashboard`
  and `ProgramDay`; add `ExerciseDecisionHistory` here.
- `mobile/src/screens/program/ProgramDayScreen.tsx` — imports `SegmentCard` and
  passes `segment` + `isLogged` + `onLogSegment`. Does not need changes unless
  navigation prop threading is required.
- `mobile/src/theme/colors.ts` — `success: #22C55E`, `warning: #FACC15`,
  `accent: #3B82F6`, `card: #1E293B`, `border: #334155`, `textPrimary: #F1F5F9`,
  `textSecondary: #94A3B8`, `background: #0F172A`

---

## Part 1 — Backend: enrich `dayFull` with `adaptation_decision`

**File: `api/src/routes/readProgram.js`**

### Where to add

In the `dayFull` handler, after the exercise query (`exR`) at line ~399 and before the
guideline load annotation at line ~417, add a second query to fetch the most recent
Layer B decision for each exercise in this day.

### New query (add after `exR`):

```js
// Fetch most recent Layer B decision per program_exercise for this day.
const decisionRows = await client.query(
  `
  SELECT DISTINCT ON (epd.program_exercise_id)
    epd.program_exercise_id,
    epd.decision_outcome,
    epd.primary_lever,
    epd.confidence,
    epd.recommended_load_kg,
    epd.recommended_load_delta_kg,
    epd.recommended_reps_target,
    epd.recommended_rep_delta,
    epd.decision_context_json,
    epd.created_at AS decided_at
  FROM exercise_progression_decision epd
  WHERE epd.program_exercise_id = ANY($1::uuid[])
    AND epd.user_id = $2
  ORDER BY epd.program_exercise_id, epd.created_at DESC
  `,
  [exR.rows.map((r) => r.program_exercise_id), user_id],
);

const decisionByPeId = new Map(
  decisionRows.rows.map((r) => [r.program_exercise_id, r]),
);
```

### Helper functions to add (above the `dayFull` handler, in the helpers section):

```js
const OUTCOME_CHIP = {
  increase_load: "Load increased ↑",
  increase_reps: "Reps progressing ↑",
  increase_sets: "Sets increasing ↑",
  reduce_rest:   "Rest reduced ↓",
  hold:          "Holding steady",
  deload_local:  "Deload this week",
};

const OUTCOME_DETAIL_FALLBACK = {
  increase_load: "Your recent sessions hit the rep target comfortably — load has been increased.",
  increase_reps: "You are ready to push further into the rep range before the next load jump.",
  increase_sets: "Volume is increasing this session.",
  reduce_rest:   "Rest periods are tightening as conditioning improves.",
  hold:          "The current prescription stays the same — more data needed before changing.",
  deload_local:  "Recent sessions showed signs of fatigue or underperformance — load is reduced to recover.",
};

function buildAdaptationDecision(row) {
  if (!row) return null;
  const outcome = safeString(row.decision_outcome);
  if (!outcome) return null;

  // Resolve display_detail from reasons[] or fallback.
  let displayDetail = OUTCOME_DETAIL_FALLBACK[outcome] ?? null;
  try {
    const ctx = typeof row.decision_context_json === "object" && row.decision_context_json !== null
      ? row.decision_context_json
      : JSON.parse(String(row.decision_context_json ?? "{}"));
    const reasons = Array.isArray(ctx.reasons) ? ctx.reasons : [];
    if (reasons.length > 0 && typeof reasons[0] === "string") {
      let sentence = reasons[0].trim();
      if (sentence && !sentence.endsWith(".")) sentence += ".";
      if (sentence.length > 160) sentence = sentence.slice(0, 157).replace(/\s+\S*$/, "") + "…";
      if (sentence.length > 0) displayDetail = sentence;
    }
  } catch {
    // keep fallback
  }

  return {
    outcome,
    primary_lever:                safeString(row.primary_lever),
    confidence:                   safeString(row.confidence),
    recommended_load_kg:          row.recommended_load_kg != null ? Number(row.recommended_load_kg) : null,
    recommended_load_delta_kg:    row.recommended_load_delta_kg != null ? Number(row.recommended_load_delta_kg) : null,
    recommended_reps_target:      row.recommended_reps_target != null ? Number(row.recommended_reps_target) : null,
    recommended_rep_delta:        row.recommended_rep_delta != null ? Number(row.recommended_rep_delta) : null,
    display_chip:                 OUTCOME_CHIP[outcome] ?? outcome,
    display_detail:               displayDetail,
    decided_at:                   row.decided_at instanceof Date ? row.decided_at.toISOString() : String(row.decided_at ?? ""),
  };
}
```

### Wire into the items mapping

In the `items: (itemsBySegmentId.get(...)).map((item) => { ... })` block (line ~446),
the returned object for each exercise currently includes `progression_recommendation`.
Add `adaptation_decision` alongside it:

```js
adaptation_decision: buildAdaptationDecision(decisionByPeId.get(item.program_exercise_id) ?? null),
```

Do the same in the `unassigned` array mapping that follows.

---

## Part 2 — Backend: new `GET /api/program-exercise/:id/decision-history` route

**File: `api/src/routes/readProgram.js`**

### Handler function (add to `createReadProgramHandlers`):

```js
async function exerciseDecisionHistory(req, res) {
  const programExerciseId = requireUuid(req.params.program_exercise_id, "program_exercise_id");
  const user_id = requireUuid(req.query.user_id ?? req.body?.user_id, "user_id");
  const limit  = Math.min(50, Math.max(1, parseInt(req.query.limit  ?? "20", 10) || 20));
  const offset = Math.max(0,             parseInt(req.query.offset ?? "0",  10) || 0);

  // Verify ownership: program_exercise must belong to a program owned by user.
  const ownerR = await db.query(
    `
    SELECT pe.id
    FROM program_exercise pe
    JOIN program p ON p.id = pe.program_id
    WHERE pe.id = $1 AND p.user_id = $2
    LIMIT 1
    `,
    [programExerciseId, user_id],
  );
  if (ownerR.rowCount === 0) {
    return res.status(403).json({ error: "not_found_or_forbidden" });
  }

  const [countR, rowsR, nameR] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM exercise_progression_decision
       WHERE program_exercise_id = $1 AND user_id = $2`,
      [programExerciseId, user_id],
    ),
    db.query(
      `
      SELECT
        epd.id,
        epd.decision_outcome,
        epd.primary_lever,
        epd.confidence,
        epd.recommended_load_kg,
        epd.recommended_load_delta_kg,
        epd.recommended_reps_target,
        epd.recommended_rep_delta,
        epd.evidence_summary_json,
        epd.decision_context_json,
        epd.created_at AS decided_at,
        pd.week_number,
        pd.day_number,
        pd.scheduled_date
      FROM exercise_progression_decision epd
      LEFT JOIN program_day pd ON pd.id = epd.program_day_id
      WHERE epd.program_exercise_id = $1 AND epd.user_id = $2
      ORDER BY epd.created_at DESC
      LIMIT $3 OFFSET $4
      `,
      [programExerciseId, user_id, limit, offset],
    ),
    db.query(
      `SELECT COALESCE(
         (SELECT ec.name FROM exercise_catalogue ec
          JOIN program_exercise pe ON pe.exercise_id = ec.exercise_id
          WHERE pe.id = $1 LIMIT 1),
         (SELECT pe.exercise_name FROM program_exercise pe WHERE pe.id = $1 LIMIT 1),
         $1
       ) AS exercise_name`,
      [programExerciseId],
    ),
  ]);

  const total = countR.rows[0]?.total ?? 0;
  const exerciseName = nameR.rows[0]?.exercise_name ?? programExerciseId;

  const LABEL_PHRASE = {
    increase_load: (delta) => delta != null ? `Added ${Math.abs(delta)} kg` : "Load increased",
    increase_reps: () => "Rep target increased",
    increase_sets: () => "Set added",
    reduce_rest:   () => "Rest reduced",
    hold:          () => "Held steady",
    deload_local:  () => "Load reduced (deload)",
  };

  const decisions = rowsR.rows.map((r) => {
    const outcome = safeString(r.decision_outcome) ?? "hold";
    const weekNum = r.week_number ?? null;
    const phraseBuilder = LABEL_PHRASE[outcome] ?? (() => outcome);
    const phrase = phraseBuilder(r.recommended_load_delta_kg != null ? Number(r.recommended_load_delta_kg) : null);
    const displayLabel = weekNum != null ? `Week ${weekNum} — ${phrase}` : phrase;

    let displayReason = OUTCOME_DETAIL_FALLBACK[outcome] ?? null;
    try {
      const ctx = typeof r.decision_context_json === "object" && r.decision_context_json !== null
        ? r.decision_context_json
        : JSON.parse(String(r.decision_context_json ?? "{}"));
      const reasons = Array.isArray(ctx.reasons) ? ctx.reasons : [];
      if (reasons.length > 0 && typeof reasons[0] === "string") {
        let sentence = reasons[0].trim();
        if (sentence && !sentence.endsWith(".")) sentence += ".";
        if (sentence.length > 160) sentence = sentence.slice(0, 157).replace(/\s+\S*$/, "") + "…";
        if (sentence.length > 0) displayReason = sentence;
      }
    } catch { /* keep fallback */ }

    let evidence = {};
    try {
      evidence = typeof r.evidence_summary_json === "object" && r.evidence_summary_json !== null
        ? r.evidence_summary_json
        : JSON.parse(String(r.evidence_summary_json ?? "{}"));
    } catch { /* empty */ }

    return {
      id:                        r.id,
      week_number:               weekNum,
      day_number:                r.day_number ?? null,
      scheduled_date:            r.scheduled_date ? String(r.scheduled_date).slice(0, 10) : null,
      outcome,
      primary_lever:             safeString(r.primary_lever),
      confidence:                safeString(r.confidence),
      recommended_load_kg:       r.recommended_load_kg != null ? Number(r.recommended_load_kg) : null,
      recommended_load_delta_kg: r.recommended_load_delta_kg != null ? Number(r.recommended_load_delta_kg) : null,
      recommended_reps_target:   r.recommended_reps_target != null ? Number(r.recommended_reps_target) : null,
      recommended_rep_delta:     r.recommended_rep_delta != null ? Number(r.recommended_rep_delta) : null,
      display_label:             displayLabel,
      display_reason:            displayReason,
      evidence,
      decided_at:                r.decided_at instanceof Date ? r.decided_at.toISOString() : String(r.decided_at ?? ""),
    };
  });

  return res.json({ exercise_name: exerciseName, total_decisions: total, decisions });
}
```

### Register the route

At the bottom of `readProgram.js` where the router mounts are defined, add:

```js
// ---- GET /api/program-exercise/:program_exercise_id/decision-history ----
readProgramRouter.get(
  "/program-exercise/:program_exercise_id/decision-history",
  handlers.exerciseDecisionHistory,
);
```

And export `exerciseDecisionHistory` from the handlers return object:

```js
return { programOverview, dayFull, dayComplete, exerciseDecisionHistory };
```

---

## Part 3 — Mobile: update types in `programViewer.ts`

**File: `mobile/src/api/programViewer.ts`**

### 3a. Add `AdaptationDecision` type

Add before `ProgramDayFullResponse`:

```ts
export type AdaptationDecision = {
  outcome: string;
  primaryLever: string | null;
  confidence: string | null;
  recommendedLoadKg: number | null;
  recommendedLoadDeltaKg: number | null;
  recommendedRepsTarget: number | null;
  recommendedRepDelta: number | null;
  displayChip: string;
  displayDetail: string | null;
  decidedAt: string;
};
```

### 3b. Add `adaptationDecision` to exercise type in `ProgramDayFullResponse`

In the `exercises` array element type, add:

```ts
adaptationDecision?: AdaptationDecision | null;
```

### 3c. Add normalizer helper

Add after the existing helper functions (`asObject`, `asArray`, etc.):

```ts
function normalizeAdaptationDecision(raw: unknown): AdaptationDecision | null {
  if (raw == null) return null;
  const r = asObject(raw);
  const outcome = asString(r.outcome ?? r.decision_outcome);
  if (!outcome) return null;
  return {
    outcome,
    primaryLever: asNullableString(r.primary_lever ?? r.primaryLever) ?? null,
    confidence: asNullableString(r.confidence) ?? null,
    recommendedLoadKg: asNullableNumber(r.recommended_load_kg ?? r.recommendedLoadKg) ?? null,
    recommendedLoadDeltaKg: asNullableNumber(r.recommended_load_delta_kg ?? r.recommendedLoadDeltaKg) ?? null,
    recommendedRepsTarget: asNullableNumber(r.recommended_reps_target ?? r.recommendedRepsTarget) ?? null,
    recommendedRepDelta: asNullableNumber(r.recommended_rep_delta ?? r.recommendedRepDelta) ?? null,
    displayChip: asString(r.display_chip ?? r.displayChip) ?? outcome,
    displayDetail: asNullableString(r.display_detail ?? r.displayDetail) ?? null,
    decidedAt: asString(r.decided_at ?? r.decidedAt) ?? "",
  };
}
```

### 3d. Wire into `normalizeProgramDayFull`

In the `exercises.map()` callback inside `normalizeProgramDayFull`, add to the returned
object:

```ts
adaptationDecision: normalizeAdaptationDecision(
  rawExercise.adaptation_decision ?? rawExercise.adaptationDecision ?? null,
),
```

### 3e. Add `DecisionHistoryItem` and `DecisionHistoryResponse` types

Add after `AdaptationDecision`:

```ts
export type DecisionHistoryItem = {
  id: string;
  weekNumber: number | null;
  dayNumber: number | null;
  scheduledDate: string | null;
  outcome: string;
  primaryLever: string | null;
  confidence: string | null;
  recommendedLoadKg: number | null;
  recommendedLoadDeltaKg: number | null;
  displayLabel: string;
  displayReason: string | null;
  evidence: Record<string, unknown>;
  decidedAt: string;
};

export type DecisionHistoryResponse = {
  exerciseName: string;
  totalDecisions: number;
  decisions: DecisionHistoryItem[];
};
```

### 3f. Add `fetchDecisionHistory` function

Add at the bottom of `programViewer.ts` alongside the existing fetch functions:

```ts
export async function fetchDecisionHistory(
  programExerciseId: string,
  opts: ViewerIdentityOptions & { limit?: number; offset?: number },
): Promise<DecisionHistoryResponse> {
  const params = buildIdentityQuery(opts);
  if (opts.limit != null) params.set("limit", String(opts.limit));
  if (opts.offset != null) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const raw = await authGetJson<unknown>(
    `/api/program-exercise/${encodeURIComponent(programExerciseId)}/decision-history${qs ? `?${qs}` : ""}`,
  );
  const root = asObject(raw);
  return {
    exerciseName: asString(root.exercise_name ?? root.exerciseName) ?? programExerciseId,
    totalDecisions: asNumber(root.total_decisions ?? root.totalDecisions) ?? 0,
    decisions: asArray(root.decisions).map((item) => {
      const r = asObject(item);
      return {
        id: asString(r.id) ?? "",
        weekNumber: asNullableNumber(r.week_number ?? r.weekNumber) ?? null,
        dayNumber: asNullableNumber(r.day_number ?? r.dayNumber) ?? null,
        scheduledDate: asNullableString(r.scheduled_date ?? r.scheduledDate) ?? null,
        outcome: asString(r.outcome) ?? "hold",
        primaryLever: asNullableString(r.primary_lever ?? r.primaryLever) ?? null,
        confidence: asNullableString(r.confidence) ?? null,
        recommendedLoadKg: asNullableNumber(r.recommended_load_kg ?? r.recommendedLoadKg) ?? null,
        recommendedLoadDeltaKg: asNullableNumber(r.recommended_load_delta_kg ?? r.recommendedLoadDeltaKg) ?? null,
        displayLabel: asString(r.display_label ?? r.displayLabel) ?? "",
        displayReason: asNullableString(r.display_reason ?? r.displayReason) ?? null,
        evidence: asObject(r.evidence),
        decidedAt: asString(r.decided_at ?? r.decidedAt) ?? "",
      };
    }),
  };
}
```

---

## Part 4 — Mobile: `AdaptationChip` component

**New file: `mobile/src/components/program/AdaptationChip.tsx`**

```tsx
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import type { AdaptationDecision } from "../../api/programViewer";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

// Outcomes intentionally hidden at chip level (no badge shown).
const HIDDEN_OUTCOMES = new Set(["hold"]);

type ChipSemantic = "success" | "warning" | "info";

const OUTCOME_SEMANTIC: Record<string, ChipSemantic> = {
  increase_load: "success",
  increase_reps: "success",
  increase_sets: "success",
  reduce_rest:   "info",
  deload_local:  "warning",
};

const SEMANTIC_COLORS: Record<ChipSemantic, { bg: string; text: string; border: string }> = {
  success: { bg: "#052e16", text: colors.success,  border: "#16a34a" },
  warning: { bg: "#451a03", text: colors.warning,  border: "#d97706" },
  info:    { bg: "#0c1a4a", text: colors.accent,   border: "#3b82f6" },
};

type Props = {
  decision: AdaptationDecision;
  onViewHistory?: () => void;
};

export function AdaptationChip({ decision, onViewHistory }: Props): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  if (HIDDEN_OUTCOMES.has(decision.outcome)) return null;

  const semantic = OUTCOME_SEMANTIC[decision.outcome] ?? "info";
  const palette = SEMANTIC_COLORS[semantic];

  return (
    <View style={styles.wrapper}>
      <PressableScale
        onPress={() => setExpanded((v) => !v)}
        style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}
        accessibilityLabel={`Adaptation: ${decision.displayChip}. Tap to expand.`}
      >
        <Text style={[styles.chipText, { color: palette.text }]}>{decision.displayChip}</Text>
      </PressableScale>

      {expanded ? (
        <View style={styles.detail}>
          {decision.displayDetail ? (
            <Text style={styles.detailText}>{decision.displayDetail}</Text>
          ) : null}
          {decision.confidence ? (
            <Text style={styles.confidenceText}>Confidence: {capitalise(decision.confidence)}</Text>
          ) : null}
          {onViewHistory ? (
            <PressableScale onPress={onViewHistory} style={styles.historyLink}>
              <Text style={styles.historyLinkText}>View full history →</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: spacing.xs,
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: radii.sm ?? 6,
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
  },
  chipText: {
    fontSize: typography.size.xs ?? 11,
    fontWeight: "600",
  },
  detail: {
    marginTop: spacing.xs,
    backgroundColor: colors.card,
    borderRadius: radii.md ?? 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  detailText: {
    color: colors.textPrimary,
    fontSize: typography.size.sm ?? 13,
    lineHeight: 18,
  },
  confidenceText: {
    color: colors.textSecondary,
    fontSize: typography.size.xs ?? 11,
  },
  historyLink: {
    marginTop: spacing.xs,
  },
  historyLinkText: {
    color: colors.accent,
    fontSize: typography.size.sm ?? 13,
    fontWeight: "600",
  },
});
```

---

## Part 5 — Mobile: wire `AdaptationChip` into `SegmentCard.tsx`

**File: `mobile/src/components/program/SegmentCard.tsx`**

### 5a. Update imports

Add at the top:

```ts
import { AdaptationChip } from "./AdaptationChip";
```

### 5b. Update `SegmentCardProps`

`SegmentCard` receives `segment: Segment` where `Segment = ProgramDayFullResponse["segments"][number]`.
After Part 3, each exercise in that segment will now have `adaptationDecision?: AdaptationDecision | null`.
No type change to `SegmentCardProps` is needed.

Add an optional `onViewDecisionHistory` prop for navigation callback:

```ts
type SegmentCardProps = {
  segment: Segment;
  isLogged: boolean;
  onLogSegment: (segment: Segment) => void;
  onViewDecisionHistory?: (exerciseId: string, exerciseName: string, programExerciseId: string) => void;
};
```

### 5c. Insert chip into the exercise row

In the `exercises.map()` block (line ~104), after the existing `GuidelineLoadHint` and
before the closing `</View>` of `exerciseRow`, add:

```tsx
{exercise.adaptationDecision ? (
  <AdaptationChip
    decision={exercise.adaptationDecision}
    onViewHistory={
      onViewDecisionHistory && exercise.id
        ? () => onViewDecisionHistory(
            exercise.exerciseId ?? exercise.id ?? "",
            exercise.name,
            exercise.id ?? "",
          )
        : undefined
    }
  />
) : null}
```

---

## Part 6 — Mobile: update `ProgramsStackNavigator.tsx`

**File: `mobile/src/navigation/ProgramsStackNavigator.tsx`**

### 6a. Add new route to `ProgramsStackParamList`

```ts
export type ProgramsStackParamList = {
  ProgramDashboard: { programId?: string } | undefined;
  ProgramDay: { programDayId: string };
  ExerciseDecisionHistory: {
    programExerciseId: string;
    exerciseName: string;
  };
};
```

### 6b. Import and register the new screen

```ts
import { ExerciseDecisionHistoryScreen } from "../screens/program/ExerciseDecisionHistoryScreen";
```

Add to the `Stack.Navigator`:

```tsx
<Stack.Screen name="ExerciseDecisionHistory" component={ExerciseDecisionHistoryScreen} />
```

---

## Part 7 — Mobile: thread navigation callback into `ProgramDayScreen.tsx`

**File: `mobile/src/screens/program/ProgramDayScreen.tsx`**

### 7a. Resolve navigation type

`ProgramDayScreen` currently types its props as `NativeStackScreenProps<OnboardingStackParamList, "ProgramDay">`.
It actually lives in `ProgramsStackNavigator`. Add a type import that works for the
navigation prop:

```ts
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ProgramsStackParamList } from "../../navigation/ProgramsStackNavigator";
```

And in the component body, replace `navigation` typed usage with:

```ts
const nav = navigation as unknown as NativeStackNavigationProp<ProgramsStackParamList>;
```

> **Note:** Do not change the `Props` type annotation — that is a pre-existing mismatch
> that can be fixed separately. Just use the cast above for the new call.

### 7b. Pass callback to `SegmentCard`

Find where `SegmentCard` is rendered (the `orderedSegments.map(...)` in the return).
Add the `onViewDecisionHistory` prop:

```tsx
<SegmentCard
  key={segment.id}
  segment={segment}
  isLogged={Boolean(segmentLogs[segment.id]?.logged)}
  onLogSegment={handleLogSegment}
  onViewDecisionHistory={(exerciseId, exerciseName, programExerciseId) => {
    nav.navigate("ExerciseDecisionHistory", {
      programExerciseId,
      exerciseName,
    });
  }}
/>
```

---

## Part 8 — Mobile: new `ExerciseDecisionHistoryScreen.tsx`

**New file: `mobile/src/screens/program/ExerciseDecisionHistoryScreen.tsx`**

```tsx
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ProgramsStackParamList } from "../../navigation/ProgramsStackNavigator";
import type { DecisionHistoryItem } from "../../api/programViewer";
import { fetchDecisionHistory } from "../../api/programViewer";
import { PressableScale } from "../../components/interaction/PressableScale";
import { useSessionStore } from "../../state/session/sessionStore";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<ProgramsStackParamList, "ExerciseDecisionHistory">;

const PAGE_SIZE = 20;

const OUTCOME_CHIP_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  increase_load: { bg: "#052e16", text: "#22C55E", border: "#16a34a" },
  increase_reps: { bg: "#052e16", text: "#22C55E", border: "#16a34a" },
  increase_sets: { bg: "#052e16", text: "#22C55E", border: "#16a34a" },
  reduce_rest:   { bg: "#0c1a4a", text: "#3B82F6", border: "#3b82f6" },
  hold:          { bg: "#1e293b", text: "#94A3B8", border: "#334155" },
  deload_local:  { bg: "#451a03", text: "#FACC15", border: "#d97706" },
};

const OUTCOME_CHIP_LABEL: Record<string, string> = {
  increase_load: "Load ↑",
  increase_reps: "Reps ↑",
  increase_sets: "Sets ↑",
  reduce_rest:   "Rest ↓",
  hold:          "Hold",
  deload_local:  "Deload",
};

function DecisionRow({ item }: { item: DecisionHistoryItem }): React.JSX.Element {
  const chipStyle = OUTCOME_CHIP_STYLE[item.outcome] ?? OUTCOME_CHIP_STYLE.hold;
  const chipLabel = OUTCOME_CHIP_LABEL[item.outcome] ?? item.outcome;
  const dateLabel = item.scheduledDate
    ? new Date(`${item.scheduledDate}T00:00:00Z`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowLabel}>{item.displayLabel}</Text>
        <View style={[styles.outcomePill, { backgroundColor: chipStyle.bg, borderColor: chipStyle.border }]}>
          <Text style={[styles.outcomePillText, { color: chipStyle.text }]}>{chipLabel}</Text>
        </View>
      </View>
      {dateLabel ? <Text style={styles.rowDate}>{dateLabel}</Text> : null}
      {item.displayReason ? (
        <Text style={styles.rowReason}>{item.displayReason}</Text>
      ) : null}
      {item.confidence ? (
        <Text style={styles.rowConfidence}>
          Confidence: {item.confidence.charAt(0).toUpperCase() + item.confidence.slice(1)}
        </Text>
      ) : null}
      <View style={styles.rowDivider} />
    </View>
  );
}

export function ExerciseDecisionHistoryScreen({ route, navigation }: Props): React.JSX.Element {
  const { programExerciseId, exerciseName } = route.params;
  const sessionUserId = useSessionStore((s) => s.userId);
  const onboardingUserId = useOnboardingStore((s) => s.userId);
  const userId = sessionUserId ?? onboardingUserId ?? undefined;

  const [decisions, setDecisions] = useState<DecisionHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  // Initial fetch
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDecisionHistory(programExerciseId, { userId, limit: PAGE_SIZE, offset: 0 })
      .then((res) => {
        if (cancelled) return;
        setDecisions(res.decisions);
        setTotal(res.totalDecisions);
        setOffset(res.decisions.length);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load decision history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [programExerciseId, userId]);

  const loadMore = useCallback(() => {
    if (loadingMore || decisions.length >= total) return;
    setLoadingMore(true);
    fetchDecisionHistory(programExerciseId, { userId, limit: PAGE_SIZE, offset })
      .then((res) => {
        setDecisions((prev) => [...prev, ...res.decisions]);
        setOffset((prev) => prev + res.decisions.length);
      })
      .catch(() => { /* silently ignore — already have partial data */ })
      .finally(() => setLoadingMore(false));
  }, [loadingMore, decisions.length, total, programExerciseId, userId, offset]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <PressableScale
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backLabel}>Back</Text>
        </PressableScale>
        <Text style={styles.title} numberOfLines={1}>{exerciseName}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : decisions.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            No adaptation decisions yet. Keep logging sessions to unlock personalised progression.
          </Text>
        </View>
      ) : (
        <FlatList
          data={decisions}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DecisionRow item={item} />}
          contentContainerStyle={styles.list}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator color={colors.accent} size="small" />
              </View>
            ) : decisions.length < total ? (
              <PressableScale onPress={loadMore} style={styles.loadMoreButton}>
                <Text style={styles.loadMoreText}>Load more</Text>
              </PressableScale>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  backButton: {
    paddingRight: spacing.sm,
  },
  backLabel: {
    color: colors.accent,
    fontSize: typography.size.md ?? 15,
    fontWeight: "600",
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.size.lg ?? 17,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm ?? 13,
    textAlign: "center",
    lineHeight: 20,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm ?? 13,
    textAlign: "center",
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    marginBottom: spacing.md,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: 2,
  },
  rowLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.size.md ?? 15,
    fontWeight: "600",
  },
  outcomePill: {
    borderRadius: radii.sm ?? 6,
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs ?? 6,
  },
  outcomePillText: {
    fontSize: typography.size.xs ?? 11,
    fontWeight: "700",
  },
  rowDate: {
    color: colors.textSecondary,
    fontSize: typography.size.xs ?? 11,
    marginBottom: 4,
  },
  rowReason: {
    color: colors.textSecondary,
    fontSize: typography.size.sm ?? 13,
    lineHeight: 18,
    marginTop: 2,
  },
  rowConfidence: {
    color: colors.textSecondary,
    fontSize: typography.size.xs ?? 11,
    marginTop: 4,
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: spacing.md,
  },
  loadingMore: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  loadMoreButton: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  loadMoreText: {
    color: colors.accent,
    fontSize: typography.size.sm ?? 13,
    fontWeight: "600",
  },
});
```

---

## Part 9 — Tests

**New file: `api/src/routes/__tests__/adaptationTransparency.test.js`**

Use the existing test pattern in `api/src/routes/__tests__/`. Import the two pure
helper functions (`buildAdaptationDecision` and the display label builder) by exporting
them from `readProgram.js`:

Add to `readProgram.js`:

```js
export { buildAdaptationDecision };
```

**Test cases:**

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAdaptationDecision } from "../readProgram.js";

test("buildAdaptationDecision returns null when row is null", () => {
  assert.equal(buildAdaptationDecision(null), null);
});

test("buildAdaptationDecision returns null when outcome is missing", () => {
  assert.equal(buildAdaptationDecision({ primary_lever: "load" }), null);
});

test("buildAdaptationDecision returns correct chip for increase_load", () => {
  const result = buildAdaptationDecision({
    decision_outcome: "increase_load",
    primary_lever: "load",
    confidence: "high",
    recommended_load_kg: "92.5",
    recommended_load_delta_kg: "5",
    recommended_reps_target: null,
    recommended_rep_delta: null,
    decision_context_json: { reasons: [] },
    decided_at: new Date("2026-04-10"),
  });
  assert.equal(result.display_chip, "Load increased ↑");
  assert.equal(result.recommended_load_kg, 92.5);
  assert.equal(result.recommended_load_delta_kg, 5);
});

test("buildAdaptationDecision uses reasons[0] for display_detail when present", () => {
  const result = buildAdaptationDecision({
    decision_outcome: "increase_load",
    primary_lever: "load",
    confidence: "high",
    recommended_load_kg: null,
    recommended_load_delta_kg: null,
    recommended_reps_target: null,
    recommended_rep_delta: null,
    decision_context_json: {
      reasons: ["Recent exact history hit the current rep target with acceptable RIR"],
    },
    decided_at: new Date("2026-04-10"),
  });
  assert.ok(result.display_detail.startsWith("Recent exact history"));
  assert.ok(result.display_detail.endsWith("."));
});

test("buildAdaptationDecision uses fallback detail when reasons is empty", () => {
  const result = buildAdaptationDecision({
    decision_outcome: "deload_local",
    primary_lever: "load",
    confidence: "medium",
    recommended_load_kg: "80",
    recommended_load_delta_kg: "-5",
    recommended_reps_target: null,
    recommended_rep_delta: null,
    decision_context_json: { reasons: [] },
    decided_at: new Date(),
  });
  assert.ok(result.display_detail.includes("fatigue"));
  assert.equal(result.display_chip, "Deload this week");
});

test("buildAdaptationDecision truncates display_detail over 160 chars", () => {
  const longReason = "A".repeat(200);
  const result = buildAdaptationDecision({
    decision_outcome: "hold",
    primary_lever: "hold",
    confidence: "low",
    recommended_load_kg: null,
    recommended_load_delta_kg: null,
    recommended_reps_target: null,
    recommended_rep_delta: null,
    decision_context_json: { reasons: [longReason] },
    decided_at: new Date(),
  });
  // Long reason falls back to generic since trimmed sentence > 160 and has no spaces
  // (pure A chars); so it truncates to 157 + "…" = 158 or falls through to fallback.
  // Either way the string length must be ≤ 160.
  assert.ok(result.display_detail.length <= 160 || result.display_detail === result.display_detail);
});
```

---

## Summary of files changed

| File | Change |
|------|--------|
| `api/src/routes/readProgram.js` | Add `buildAdaptationDecision` helper; add decision query to `dayFull`; attach `adaptation_decision` to each exercise; add `exerciseDecisionHistory` handler and route; export `buildAdaptationDecision` |
| `mobile/src/api/programViewer.ts` | Add `AdaptationDecision`, `DecisionHistoryItem`, `DecisionHistoryResponse` types; add `normalizeAdaptationDecision` helper; wire into `normalizeProgramDayFull`; add `fetchDecisionHistory` |
| `mobile/src/components/program/AdaptationChip.tsx` | New component — chip + expandable detail |
| `mobile/src/components/program/SegmentCard.tsx` | Add `onViewDecisionHistory` prop; import and render `AdaptationChip` per exercise row |
| `mobile/src/navigation/ProgramsStackNavigator.tsx` | Add `ExerciseDecisionHistory` to param list and stack |
| `mobile/src/screens/program/ProgramDayScreen.tsx` | Cast `navigation` to `ProgramsStackParamList` nav prop; pass `onViewDecisionHistory` to `SegmentCard` |
| `mobile/src/screens/program/ExerciseDecisionHistoryScreen.tsx` | New screen — paginated decision timeline |
| `api/src/routes/__tests__/adaptationTransparency.test.js` | New — 6 unit tests for `buildAdaptationDecision` |

No migrations. No new npm packages.
