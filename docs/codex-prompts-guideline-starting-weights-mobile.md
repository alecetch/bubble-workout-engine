# Codex Prompt — Guideline Starting Weights: Mobile UI

## Context

The backend for this feature is already implemented and merged. The new API surface is:

- `GET /reference-data` now includes `anchorExercises[]` — the list of anchor-eligible exercises filtered and typed in `mobile/src/api/referenceData.ts`
- `PATCH /api/client-profiles/:id` now accepts `anchorLifts[]` and `anchorLiftsSkipped: boolean`
- `GET /api/day/:id/full` now returns a `guidelineLoad` field on each exercise object, typed in `mobile/src/api/programViewer.ts`

Both API types are already updated in the mobile repo. Do not modify `referenceData.ts` or `programViewer.ts`.

## What to implement

Three things:

1. **New onboarding screen** `Step2bBaselineLoads` — shown between Step 2 (Equipment) and Step 3 (Schedule) for non-beginner users only. Captures anchor lifts and saves them to the backend.
2. **Navigator, store, and type changes** to wire in the new screen.
3. **Guideline load display on `SegmentCard`** — show the `guidelineLoad` hint inline below each exercise where present.

---

## Part 1 — Types and state

### `mobile/src/state/onboarding/types.ts`

**Extend `OnboardingDraft`** to include anchor lift state:

```typescript
// Add these fields to OnboardingDraft:
anchorLifts: AnchorLiftEntry[];
anchorLiftsSkipped: boolean;
```

**Add new types:**

```typescript
export type AnchorLiftEntry = {
  estimationFamily: string;
  exerciseId: string | null;
  loadKg: number | null;
  reps: number | null;
  rir: number | null;
  skipped: boolean;
};

// The 6 canonical estimation families the screen will show cards for:
export const ESTIMATION_FAMILIES = [
  "squat",
  "hinge",
  "horizontal_press",
  "vertical_press",
  "horizontal_pull",
  "vertical_pull",
] as const;
export type EstimationFamily = (typeof ESTIMATION_FAMILIES)[number];

export const ESTIMATION_FAMILY_LABELS: Record<EstimationFamily, string> = {
  squat: "Squat",
  hinge: "Hinge (Deadlift / RDL)",
  horizontal_press: "Horizontal Press (Bench / Push)",
  vertical_press: "Vertical Press (Overhead)",
  horizontal_pull: "Horizontal Pull (Row)",
  vertical_pull: "Vertical Pull (Pulldown / Pull-up)",
};

// RIR options shown in the effort selector
export type RirOption = { label: string; value: number };
export const RIR_OPTIONS: RirOption[] = [
  { label: "Max effort (0 RIR)", value: 0 },
  { label: "Hard (~1 RIR)", value: 1 },
  { label: "Moderate (~2–3 RIR)", value: 2.5 },
  { label: "Easy (4+ RIR)", value: 4 },
];
```

**Extend `OnboardingStep`** to include `"2b"`:

```typescript
export type OnboardingStep = 1 | 2 | "2b" | 3;
```

**Extend `StepAttemptedState`**:

```typescript
export type StepAttemptedState = {
  step1: boolean;
  step2: boolean;
  step2b: boolean;
  step3: boolean;
};
```

**Update `DEFAULT_ONBOARDING_DRAFT`**:

```typescript
anchorLifts: [],
anchorLiftsSkipped: false,
```

**Update `onboardingStepCompleted` type** — keep as `0 | 1 | 2 | 3`. The baseline loads step does not increment this counter (it has no required fields).

---

### `mobile/src/state/onboarding/onboardingStore.ts`

**Extend the store:**

1. Add `step2b: false` to the `attempted` initial state.
2. Extend `fromProfile` to read `anchorLiftsSkipped` from the profile server response:
   ```typescript
   anchorLiftsSkipped: Boolean(profileLike.anchorLiftsSkipped ?? profileLike.anchor_lifts_skipped ?? false),
   anchorLifts: [],  // never restored from server — user re-enters if needed
   ```
3. Add `anchorLifts` and `anchorLiftsSkipped` to the `DEFAULT_ONBOARDING_DRAFT` merge in `resetFromProfile`.
4. Update the `attempted` reset in `resetFromProfile` to include `step2b: false`.

---

### `mobile/src/state/onboarding/resumeLogic.ts`

**Extend `getResumeStep`** to handle step 2b:

```typescript
import type { OnboardingDraft, OnboardingStep } from "./types";
import { validateAll } from "./validators";

function isNonBeginner(draft: OnboardingDraft): boolean {
  const level = String(draft.fitnessLevel ?? "").toLowerCase();
  return level === "intermediate" || level === "advanced" || level === "elite";
}

export function getResumeStep(draft: OnboardingDraft): OnboardingStep | "done" {
  const validation = validateAll(draft);

  if (!validation.step1Valid) return 1;
  if (!validation.step2Valid) return 2;

  // Step 2b: show for non-beginners who have not yet submitted anchor data
  if (isNonBeginner(draft) && !draft.anchorLiftsSkipped && draft.anchorLifts.length === 0) {
    return "2b";
  }

  if (!validation.step3Valid) return 3;

  return "done";
}
```

---

### `mobile/src/state/onboarding/validators.ts`

Step 2b has no required fields. Do not add validation for it. No changes needed to `validateStep` or `validateAll`.

---

### `mobile/src/api/clientProfiles.ts`

Extend `UpdateClientProfileInput` to include the anchor lift fields:

```typescript
import type { AnchorLiftEntry } from "../state/onboarding/types";

export type UpdateClientProfileInput = Partial<Omit<ClientProfileServer, "id" | "userId">> & {
  anchorLifts?: AnchorLiftEntry[];
  anchorLiftsSkipped?: boolean;
};
```

---

## Part 2 — Navigation

### `mobile/src/navigation/OnboardingNavigator.tsx`

**Add `Step2bBaselineLoads` to the param list and stack:**

```typescript
export type OnboardingStackParamList = {
  OnboardingEntry: undefined;
  Step1Goals: undefined;
  Step2Equipment: undefined;
  Step2bBaselineLoads: undefined;  // NEW
  Step3Schedule: undefined;
  ProgramReview: undefined;
  ProgramDashboard: { programId?: string } | undefined;
  ProgramDay: { programDayId: string };
};
```

Import and register the new screen:

```typescript
import { Step2bBaselineLoadsScreen } from "../screens/onboarding/Step2bBaselineLoadsScreen";

// In the Stack.Navigator:
<Stack.Screen name="Step2bBaselineLoads" component={Step2bBaselineLoadsScreen} options={stepTransitionOptions} />
```

Place it between `Step2Equipment` and `Step3Schedule`.

---

### `mobile/src/screens/onboarding/OnboardingEntry.tsx`

Update the resume navigation to handle `"2b"`:

```typescript
const step = getResumeStep(draft);
if (step === 1) navigation.navigate("Step1Goals");
else if (step === 2) navigation.navigate("Step2Equipment");
else if (step === "2b") navigation.navigate("Step2bBaselineLoads");
else if (step === 3) navigation.navigate("Step3Schedule");
else navigation.navigate("ProgramReview");
```

---

### `mobile/src/screens/onboarding/Step2EquipmentScreen.tsx`

Update the "Continue" / "Next" handler to branch based on fitness level:

```typescript
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";

// In the handleNext / onNext callback, after saving:
const draft = useOnboardingStore.getState().draft;
const fitnessLevel = String(draft.fitnessLevel ?? "").toLowerCase();
const isNonBeginner = fitnessLevel === "intermediate" || fitnessLevel === "advanced" || fitnessLevel === "elite";

if (isNonBeginner) {
  navigation.navigate("Step2bBaselineLoads");
} else {
  navigation.navigate("Step3Schedule");
}
```

Keep all existing save/validation logic unchanged.

---

## Part 3 — New screen

### `mobile/src/screens/onboarding/Step2bBaselineLoadsScreen.tsx`

**Create this file.** The screen is fully optional — tapping Continue with no data entered is valid and just sends `anchorLiftsSkipped: true` with an empty `anchorLifts: []`.

**Props:**

```typescript
type Props = NativeStackScreenProps<OnboardingStackParamList, "Step2bBaselineLoads">;
```

**Screen title:** `"Help us calibrate your first workout"`

**Subtitle:**
```
Tell us a recent working weight for a few key lifts — not your max, just a weight you've used for solid working sets. We'll use these to suggest starting loads for your first session.

If you don't know a lift or haven't trained it recently, just skip it.
```

**Overall skip:**
A `"Skip this step"` checkbox/toggle at the top (or bottom). When toggled on, all family cards are disabled and the Continue button sends `anchorLiftsSkipped: true, anchorLifts: []`.

**Family cards:**
Render one `AnchorFamilyCard` per family in `ESTIMATION_FAMILIES` order. A card is **hidden** when no anchor exercises are available for that family given the user's equipment (see filtering logic below).

**Exercise picker population (filtering logic):**
```typescript
// From referenceData.anchorExercises, for a given family:
const options = (referenceData.anchorExercises ?? [])
  .filter(ex => ex.estimationFamily === family && ex.isAnchorEligible)
  .filter(ex => ex.equipmentItemsSlugs.every(slug => userEquipmentCodes.includes(slug)))
  .sort((a, b) => a.anchorPriority - b.anchorPriority)
  .map(ex => ({ label: ex.label, value: ex.exerciseId }));
```

`userEquipmentCodes` is `draft.selectedEquipmentCodes`.

If `options.length === 0` for a family, do not render its card.

**`AnchorFamilyCard` component** (implement inline in this file or as a sibling component):

Each card contains:
- Family label (from `ESTIMATION_FAMILY_LABELS[family]`)
- "Skip this lift" toggle/checkbox — pre-checked by default
- When "Skip this lift" is unchecked (i.e. the user wants to enter data):
  - `SelectField` — "Which exercise?" — options from filtered anchor list
  - `NumericField` — "Load (kg)" — decimal numeric input
  - `NumericField` — "Reps" — integer numeric input
  - Inline segmented control or `SelectField` — "Effort / RIR" — options from `RIR_OPTIONS` (optional, can remain unset)
- Inline card-level hint when load is entered but reps is empty (or vice versa): `"Enter both load and reps, or skip this lift."` — shown only after user has interacted with the card

**Local state per card** (use `useState` per card or a `Record<family, CardDraft>`):
```typescript
type CardDraft = {
  skipped: boolean;          // true = "skip this lift" is on
  exerciseId: string | null;
  loadKgText: string;        // raw text input, converted to number on save
  repsText: string;          // raw text input
  rir: number | null;
};
```

Default state: `{ skipped: true, exerciseId: null, loadKgText: "", repsText: "", rir: null }`.

**Save logic (on "Continue" tap):**

```typescript
async function handleContinue(): Promise<void> {
  setIsSaving(true);
  try {
    const anchorLifts: AnchorLiftEntry[] = Object.entries(cardDrafts)
      .map(([family, card]) => ({
        estimationFamily: family,
        exerciseId: card.skipped ? null : card.exerciseId,
        loadKg: card.skipped ? null : parseFloat(card.loadKgText) || null,
        reps: card.skipped ? null : parseInt(card.repsText, 10) || null,
        rir: card.skipped ? null : card.rir,
        skipped: card.skipped,
      }));

    await updateClientProfile.mutateAsync({
      anchorLifts,
      anchorLiftsSkipped: stepSkipped,
    });

    setDraft({ anchorLifts, anchorLiftsSkipped: stepSkipped });
    setAttempted("2b");
    navigation.navigate("Step3Schedule");
  } catch (err) {
    setErrorBannerVisible(true);
  } finally {
    setIsSaving(false);
  }
}
```

**Validation:** No blocking validation. Show the inline card hint if load XOR reps is filled, but do not prevent navigation.

**useMe / useReferenceData:** Reuse the same hooks as Step2EquipmentScreen. Both should already be cached from Step 2 (React Query).

**Scaffold:**
Use `OnboardingScaffold`. The scaffold currently accepts `step: 1 | 2 | 3`. Pass `step={3}` here and update `Step3ScheduleMetricsScreen` to also pass `step={3}` (no visible change — both show as the third step pip). This avoids changing the ProgressHeader component. Alternatively, if a 4-dot progress indicator is preferred, that is a separate task — for this implementation keep it simple and pass `step={3}` on the new screen.

**nextLabel:** `"Continue"`

**Back:** Navigate to `Step2Equipment`.

---

## Part 4 — Guideline load on the day screen

### `mobile/src/components/program/SegmentCard.tsx`

The `guidelineLoad` field is already on the exercise type from `programViewer.ts`. Render it inline below each exercise row in the exercise list.

**Where to add it:**
In the `exercises.map(...)` block, after the existing `exercise.restSeconds` row, add:

```tsx
{exercise.guidelineLoad != null && exercise.guidelineLoad.value > 0 ? (
  <GuidelineLoadHint guidelineLoad={exercise.guidelineLoad} />
) : null}
```

**`GuidelineLoadHint` component** — implement in the same file or as `mobile/src/components/program/GuidelineLoadHint.tsx`:

```typescript
type GuidelineLoadHintProps = {
  guidelineLoad: NonNullable<ProgramDayFullResponse["segments"][number]["exercises"][number]["guidelineLoad"]>;
};
```

**Display:**

```
Suggested start: 26 kg / hand  ●  Medium confidence
```

- Format the value + unit:
  - `"kg"` → `"X kg"`
  - `"kg_per_hand"` → `"X kg / hand"`
  - `"kg_per_side"` → `"X kg / side"`
  - `"bodyweight"` → `"Bodyweight"`
- Confidence colour:
  - `"high"` → `colors.success` (`#22C55E`)
  - `"medium"` → `colors.warning` (`#FACC15`)
  - `"low"` → `colors.textSecondary` (`#94A3B8`)
- Tapping the row expands an inline detail view showing `set1Rule` text and `reasoning[]` lines. Use `useState` for expansion. Keep it simple — a `Text` block below the hint row.
- Do not show `GuidelineLoadHint` if `isLogged` is true for the segment (the workout has already been started/logged).

**Styling:** Keep it compact — small text, muted colours. Match the `exerciseMeta` style used for set/rep lines (`typography.small`, `colors.textSecondary` base). The confidence dot can be a small `View` with `width: 6, height: 6, borderRadius: 3` in the confidence colour, displayed inline with the text.

---

## Part 5 — `OnboardingScaffold` step prop

`OnboardingScaffold` currently accepts `step: 1 | 2 | 3`. The ProgressHeader underneath likely renders one dot per step and highlights the current one. **Do not change the scaffold step type.** Pass `step={3}` on `Step2bBaselineLoadsScreen` and leave `Step3ScheduleMetricsScreen` at `step={3}` as well. The progress dots show 3 steps — the new screen shares the third dot. This is acceptable for the initial implementation.

---

## File summary

| File | Action |
|---|---|
| `mobile/src/state/onboarding/types.ts` | Extend `OnboardingDraft`, add `AnchorLiftEntry`, `ESTIMATION_FAMILIES`, `ESTIMATION_FAMILY_LABELS`, `RIR_OPTIONS`, extend `OnboardingStep` and `StepAttemptedState` |
| `mobile/src/state/onboarding/onboardingStore.ts` | Add anchor lift state, extend `fromProfile`, update `resetFromProfile` |
| `mobile/src/state/onboarding/resumeLogic.ts` | Handle `"2b"` step routing for non-beginners |
| `mobile/src/api/clientProfiles.ts` | Add `anchorLifts` and `anchorLiftsSkipped` to `UpdateClientProfileInput` |
| `mobile/src/navigation/OnboardingNavigator.tsx` | Add `Step2bBaselineLoads` to param list and stack |
| `mobile/src/screens/onboarding/OnboardingEntry.tsx` | Handle `"2b"` in resume navigation |
| `mobile/src/screens/onboarding/Step2EquipmentScreen.tsx` | Branch Continue to Step2bBaselineLoads for non-beginners |
| `mobile/src/screens/onboarding/Step2bBaselineLoadsScreen.tsx` | **New file** — full screen implementation |
| `mobile/src/components/program/SegmentCard.tsx` | Render `GuidelineLoadHint` per exercise |
| `mobile/src/components/program/GuidelineLoadHint.tsx` | **New file** — inline guideline load hint component |

---

## Constraints

- Use existing components: `OnboardingScaffold`, `SectionCard`, `SelectField`, `NumericField`, `StickyNavBar`, `ErrorBanner`, `PressableScale`
- Import theme from `../../theme/colors`, `../../theme/spacing`, `../../theme/typography`, `../../theme/components`
- All styling via `StyleSheet.create` — no inline style objects
- Use `useOnboardingStore` for state; `useUpdateClientProfile` for saves (same pattern as Step2EquipmentScreen)
- Use `useReferenceData` and `useMe` hooks (cached from prior steps — no extra network request)
- No new dependencies
- `Ionicons` is available from `@expo/vector-icons` (already used in SegmentCard)
- The screen must be keyboard-aware (use `KeyboardAvoidingView` — already handled by `OnboardingScaffold`)
- `anchorLifts` in the store is never restored from the server on re-open — only `anchorLiftsSkipped` is. The screen starts with all cards in default (skipped) state every time it is visited.
