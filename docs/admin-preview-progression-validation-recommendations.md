# Admin Preview Progression Validation Recommendations

## Summary

The current Program Preview progression tab is mixing two different concerns:

1. **Starting weight estimation** — uses onboarding-style anchor lifts to estimate an appropriate starting load for a generated exercise.
2. **Week-to-week progression / regression** — uses actual performance history over repeated exposures to decide whether to increase load, increase reps, hold, or deload.

These are not the same thing in the codebase, and the preview UI currently blurs them together by turning anchor lifts into synthetic repeated history (see `adminPreview.js` lines 504–507).

**Recommendation:**

- Keep onboarding-style anchor lifts in Program Preview for **starting load validation** only.
- Remove the synthetic-history behavior entirely from Program Preview.
- Add a separate **Progression Sandbox** page for scenario-based progression testing (Phase 2).

---

## The Specific Bug

In `api/src/routes/adminPreview.js` at line 504, the current code constructs:

```js
const syntheticHistory = [
  { log_id: "synthetic-1", weight_kg: anchor.loadKg, reps_completed: anchor.reps, rir_actual: anchor.rir ?? 2 },
  { log_id: "synthetic-2", weight_kg: anchor.loadKg, reps_completed: anchor.reps, rir_actual: anchor.rir ?? 2 },
];
```

This tells `buildDecision` that the same performance happened twice recently. The engine responds correctly to that input — but the input is semantically wrong. An onboarding anchor lift is not repeated session history. A first-time user with only anchor-lift data can therefore get `deload_local` on a brand-new program because the engine sees "two identical sessions at the anchor load relative to the generated prescription" and interprets the relationship as underperformance.

---

## Current Code Mapping

### 1. Starting weight estimation — `guidelineLoadService.js`

`makeGuidelineLoadService(db).annotateExercisesWithGuidelineLoads` already implements onboarding-anchor → starting load conversion. It:

- Matches anchor to exercise via `estimation_family` (exact → same-family → cross-family, using `exercise_load_estimation_family_config`)
- Adjusts for target reps and target RIR via `normalizeAnchorLoad`
- Applies `conversionFactor`, `unilateralFactor`, `tempoFactor`, `programFactor`
- Rounds to equipment-appropriate increment
- Returns `guideline_load: { value, unit, confidence, confidence_score, source, reasoning, set_1_rule }`

The service reads from the `client_anchor_lift` DB table. For admin preview the anchor lifts arrive in-memory via the request body — the DB call is bypassed and the same pure math is applied directly.

Key internal pure functions (all currently unexported): `normalizeAnchorLoad`, `parseTempoFactor`, `computeProgramFactor`, `midpoint`, `parseTargetRir`, `floorToIncrement`, `inferIncrement`, `confidenceBand`, `buildSet1Rule`.

### 2. Progression decision engine — `progressionDecisionService.js`

`buildDecision` consumes actual exercise history (weight, reps, RIR over repeated exposures). It is correct and production-ready but requires real repeated performance data — not anchor lifts.

### 3. Why the progression tab is misleading

The current tab shows `outcome: "increase_load"` or `outcome: "deload_local"` for a new user. These labels come from `buildDecision`, which is interpreting the synthetic history as real performance. The output is technically consistent with the engine but semantically wrong for onboarding anchors. Showing "deload" on a new program creates confusion for anyone using the admin tool to validate generated programs.

---

## How Validation Scenarios Map to the Right Service

| Scenario | Service to use | Why |
|---|---|---|
| Is the starting load appropriate for this athlete? | `guidelineLoadService` (pure computation) | Anchor lifts → one-time estimate |
| Does the engine progress load when improving? | `buildDecision` with explicit exposure history | Requires repeated exposures |
| Does the engine hold when plateauing? | `buildDecision` with explicit exposure history | Requires repeated exposures |
| Does the engine deload on repeated decline? | `buildDecision` with explicit exposure history | Requires 2+ underperformance exposures |

The first scenario is what Program Preview can validate today. Scenarios 2–4 need the Progression Sandbox (Phase 2).

---

## Phase 1 — Fix Program Preview Semantics

### What changes

**`api/src/routes/adminPreview.js`**

Replace the entire `progressionPreviews` block (lines 465–549) with a `startingLoads` block.

Instead of building synthetic history and calling `buildDecision`, call a new pure function `computeGuidelineLoadFromAnchors` (see below) for each exercise in week 1.

Input to the new block:
- `anchorLifts[]` from the request body — `{ estimationFamily, loadKg, reps, rir }`
- `exerciseRows` — already in memory from `buildPreviewInputs`
- `familyFactors` — new: a `Map` from `exercise_load_estimation_family_config` (add this query to `buildPreviewInputs`)
- `programType`, `week1` — already available

Output: `starting_loads` in the response (replaces `progression_preview`).

**`api/src/services/guidelineLoadService.js`**

Extract and export a new pure function `computeGuidelineLoadFromAnchors` that mirrors the computation in `annotateExercisesWithGuidelineLoads` without any DB calls:

```js
export function computeGuidelineLoadFromAnchors({
  exerciseItem,     // { ex_id, reps_prescribed, rir_target, tempo_prescribed, intensity_prescription }
  exerciseRow,      // exercise_catalogue row — has load_estimation_metadata, is_loadable
  anchorsByFamily,  // Map<estimationFamily, { loadKg, reps, rir }>  — from request body
  familyFactors,    // Map<"sourceFamily->targetFamily", factor>  — from exercise_load_estimation_family_config
  programType,
})
```

Returns `{ guideline_load_kg, unit, confidence, source, reasoning, set_1_rule }` or `null` when not estimatable.

The existing `_test` exports on `makeGuidelineLoadService` already expose most inner pure functions — expose `computeGuidelineLoadFromAnchors` as a named module export instead so `adminPreview.js` can import it without instantiating the service.

**`buildPreviewInputs` in `adminPreview.js`**

Add one query to the existing `try` block:

```js
const familyConfigR = await client.query(
  `SELECT source_family, target_family, cross_family_factor FROM exercise_load_estimation_family_config`
);
```

Build a `familyFactors` map from the rows and include it in the return value.

**Response field rename**

`progression_preview` → `starting_loads`. Each entry:

```json
{
  "exercise_id": "bb_back_squat",
  "exercise_name": "Back Squat",
  "day": 1,
  "purpose": "main",
  "prescribed_reps": "4-6",
  "intensity_prescription": "2 RIR",
  "guideline_load_kg": 100,
  "unit": "kg",
  "confidence": "high",
  "source": "same_family",
  "reasoning": ["Estimated from your squat anchor lift."],
  "set_1_rule": "Start here for set 1 and adjust only if the prescribed RIR is clearly off.",
  "skipped_reason": null
}
```

Skipped entry (no match):

```json
{
  "exercise_id": "bb_incline_press",
  "exercise_name": "Incline Barbell Press",
  "day": 1,
  "purpose": "main",
  "guideline_load_kg": null,
  "skipped_reason": "no_anchor_match"
}
```

`skipped_reason` values: `"no_estimation_family"` | `"no_anchor_match"` | `"not_loadable"` | `null` (when result present).

**`api/admin/preview.html`**

- Rename `<summary>` label: "Anchor lifts (for progression)" → "Anchor lifts (starting load estimation)"
- Rename "Progression" sub-tab → "Starting Loads"
- Replace `renderProgressionTab` with `renderStartingLoadsTab` — new table columns: Exercise | Day | Purpose | Prescribed | Guideline Load | Confidence | Source | Reasoning
- Remove `renderProgressionHint` from the per-item program view (the inline `progression: deload_local` text next to each exercise in the Program tab) — this hint was the most user-visible symptom of the misleading output
- Update the JS that reads `data.progression_preview?.[type]` to read `data.starting_loads?.[type]`

### What stays the same

- The anchor lift UI inputs (`data-family` inputs for kg and reps) — same fields, same families
- `buildPreviewInputs` — only one new query added
- All existing program generation, pipeline, CSV export logic — untouched
- `buildDecision`, `progressionDecisionService` — not called from preview at all after this change

### Skipped exercises

Non-loadable exercises (`is_loadable = false`) and exercises with `not_estimatable = true` in `load_estimation_metadata` silently return `skipped_reason`. No error thrown. The UI shows "—" for those rows.

---

## Phase 2 — Progression Sandbox (separate page)

Add a new admin page for scenario-based progression testing. This is the right home for validating `buildDecision` behavior.

**Inputs:**
- `program_type`, `fitness_rank`
- `exercise_id`, `purpose`
- `reps_prescribed`, `intensity_prescription` (prescription shape)
- `history[]` — explicit repeated exposures: `{ weight_kg, reps_completed, rir_actual }` (minimum 2 for a decision)

**Backend:** one small route wrapping `loadProgressionConfig` + `resolveProfileName` + `buildDecision`. No DB writes.

**Output:** `outcome`, `recommended_load_kg`, `recommended_reps_target`, `confidence`, `reasons`, full evidence block.

**Preset scenarios** (quick-fill buttons):

| Preset | History | Expected outcome |
|---|---|---|
| Improving | 2× top of rep range, RIR above target | `increase_load` (strength); `increase_load` or `increase_reps` (hypertrophy — depends on whether reps hit top of range) |
| Plateau | 2× mid-range reps, on-target RIR | `hold` |
| Declining | 2× below rep range low end, low RIR | `deload_local` |

Note on the Improving preset: hypertrophy may correctly return `increase_reps` rather than `increase_load` if reps are below the top of the rep range. The preset UI should show the expected outcome as a range for hypertrophy to avoid false "wrong result" confusion.

---

## Why a Dedicated Page for Phase 2

- Starting load estimation and progression history are different inputs and different mental models
- Program Preview is already carrying program generation, debug ranking, CSV export, and (after Phase 1) starting loads — a full progression sandbox with exposure builders would overcrowd it
- The evidence output for `buildDecision` (exposures considered, successful/underperformance counts, required RIR) is richer than fits in the existing tab table format
- The "what did I enter vs what did the engine see" UX is clearer on a dedicated page

If Phase 2 is deferred, the minimum acceptable interim state is: Program Preview clearly labeled as "Starting Loads only — see Progression Sandbox for scenario testing."

---

## Summary of Phase 1 File Changes

| File | Change |
|---|---|
| `api/src/services/guidelineLoadService.js` | Export `computeGuidelineLoadFromAnchors` pure function |
| `api/src/routes/adminPreview.js` | Add `familyFactors` query to `buildPreviewInputs`; replace `progressionPreviews` block with `startingLoads`; rename response field |
| `api/admin/preview.html` | Rename tab/label; replace `renderProgressionTab` with `renderStartingLoadsTab`; remove inline progression hints; update field name consumed from response |
