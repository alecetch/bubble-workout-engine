# Codex Prompt: Admin Preview Phase 1 — Replace Progression Tab with Starting Loads

## Goal

The current Program Preview progression tab builds two identical synthetic history entries from an anchor lift and passes them to `buildDecision`. This produces misleading outputs (`deload_local`, `increase_load`) for a brand-new user who has only entered their baseline lift numbers. These are not repeated session history — they are onboarding estimates.

Phase 1 removes the synthetic-history behavior entirely from Program Preview and replaces it with proper starting load estimation that uses the same math as `guidelineLoadService`. The "Progression" tab becomes "Starting Loads" and shows `guideline_load_kg`, `confidence`, `source`, and `reasoning` per exercise.

No new routes. No new DB tables. Three files change.

---

## Context files to read before writing any code

Read these files in full:

- `api/src/routes/adminPreview.js` — the `createPreviewHandler` function and `buildPreviewInputs`; the `progressionPreviews` block to be replaced is at lines 465–549
- `api/src/services/guidelineLoadService.js` — the full service; the inner pure computation is what you are extracting; note the helper functions: `normalizeAnchorLoad`, `parseTempoFactor`, `computeProgramFactor`, `midpoint`, `parseTargetRir`, `floorToIncrement`, `inferIncrement`, `parseMetadata`, `confidenceBand`, `buildSet1Rule`
- `api/admin/preview.html` — focus on: the `#anchor-lifts-section` (lines ~213–227), `renderProgressionTab` function, `renderProgressionHint` function, `renderProgramWithTabs` function, and where `data.progression_preview` is consumed (~lines 882 and 973)

---

## Part 1 — Extract pure computation from guidelineLoadService

**File: `api/src/services/guidelineLoadService.js`**

Add a new named export `computeGuidelineLoadFromAnchors` at the bottom of the file, before the `makeGuidelineLoadService` factory. This function contains the pure computation from `annotateExercisesWithGuidelineLoads` but takes all data as parameters — no DB calls.

```js
/**
 * Pure computation: estimate a starting load for one exercise given in-memory anchor lifts.
 * Mirrors the math inside annotateExercisesWithGuidelineLoads without any DB calls.
 *
 * @param {object} params
 * @param {object} params.exerciseItem   — pipeline item: { ex_id, reps_prescribed, rir_target, tempo_prescribed, intensity_prescription }
 * @param {object} params.exerciseRow    — exercise_catalogue row: { exercise_id, load_estimation_metadata, is_loadable }
 * @param {Map}    params.anchorsByFamily — Map<estimationFamily, { loadKg, reps, rir }> built from request anchor_lifts
 * @param {Map}    params.familyFactors  — Map<"sourceFamily->targetFamily", number> from exercise_load_estimation_family_config
 * @param {string} params.programType
 *
 * @returns {{ guideline_load_kg, unit, confidence, source, reasoning, set_1_rule } | null}
 *   Returns null when the exercise is not estimatable (not_loadable, not_estimatable, or no match).
 *   Returns an object with guideline_load_kg and metadata otherwise.
 */
export function computeGuidelineLoadFromAnchors({
  exerciseItem,
  exerciseRow,
  anchorsByFamily,
  familyFactors,
  programType,
}) {
  if (!exerciseRow?.is_loadable) return null;
  const meta = parseMetadata(exerciseRow);
  if (meta.not_estimatable || !meta.estimation_family) return null;

  // Match anchor: exact exercise family → same family → cross family
  let chosenAnchor = anchorsByFamily.get(meta.estimation_family) ?? null;
  let source = chosenAnchor ? "same_family" : null;
  let crossFamilyFactor = 1;

  if (!chosenAnchor) {
    for (const [anchorFamily, anchorData] of anchorsByFamily) {
      const key = `${anchorFamily}->${meta.estimation_family}`;
      if (familyFactors.has(key)) {
        chosenAnchor = anchorData;
        crossFamilyFactor = familyFactors.get(key) ?? 1;
        source = "cross_family";
        break;
      }
    }
  }

  if (!chosenAnchor || chosenAnchor.loadKg == null) return null;

  const targetReps = midpoint(exerciseItem.reps_prescribed, 10);
  const intensityStr = exerciseItem.intensity_prescription
    ?? (exerciseItem.rir_target != null ? `${exerciseItem.rir_target} RIR` : "");
  const targetRir = parseTargetRir(intensityStr, 2);
  const anchorReps = toNumber(chosenAnchor.reps, 8);
  const anchorRir = toNumber(chosenAnchor.rir, 2);

  const normalized = normalizeAnchorLoad({
    anchorLoad: toNumber(chosenAnchor.loadKg, 0),
    anchorReps,
    targetReps,
    anchorRir,
    targetRir,
  });

  const conversionFactor = (meta.family_conversion_factor || 1) * crossFamilyFactor;
  const unilateralFactor = meta.is_unilateral ? (meta.unilateral_factor || 0.5) : 1;
  const tempoFactor = parseTempoFactor(exerciseItem.tempo_prescribed);
  const programFactor = computeProgramFactor(programType);
  const rawValue = normalized * conversionFactor * unilateralFactor * tempoFactor * programFactor;
  const increment = inferIncrement(meta, exerciseRow.exercise_id);
  const roundedValue = floorToIncrement(rawValue, increment);

  if (!(roundedValue > 0)) return null;

  // Confidence — no age adjustment in preview (no collection date available)
  let confidenceScore = source === "same_family" ? 35 : 10;
  confidenceScore += chosenAnchor.rir != null ? 15 : 5;
  const confidence = confidenceBand(confidenceScore);

  const reasoning = [];
  if (source === "same_family") {
    reasoning.push(`Estimated from your ${meta.estimation_family.replace(/_/g, " ")} anchor lift.`);
  } else {
    reasoning.push("Estimated from a related anchor family using conservative cross-family conversion.");
  }
  if (parseTempoFactor(exerciseItem.tempo_prescribed) < 1) {
    reasoning.push("Tempo prescription reduced the suggested load slightly.");
  }

  const unit = meta.unit || (meta.is_unilateral ? "kg_per_hand" : "kg");

  return {
    guideline_load_kg: roundedValue,
    unit,
    confidence,
    source,
    reasoning,
    set_1_rule: buildSet1Rule(confidence),
  };
}
```

**Important:** Do not modify `makeGuidelineLoadService`, `annotateExercisesWithGuidelineLoads`, or any existing logic. You are only adding a new export.

---

## Part 2 — Add familyFactors query to buildPreviewInputs

**File: `api/src/routes/adminPreview.js`**

Inside `buildPreviewInputs`, within the existing `try` block that already fetches exercises and rep rules, add one query after the existing queries:

```js
const familyConfigR = await client.query(
  `SELECT source_family, target_family, cross_family_factor
   FROM exercise_load_estimation_family_config`
);
```

Build a Map from the rows:

```js
const familyFactors = new Map(
  (familyConfigR.rows ?? []).map((r) => [
    `${r.source_family}->${r.target_family}`,
    Number(r.cross_family_factor) || 1,
  ])
);
```

Add `familyFactors` to the return value of `buildPreviewInputs`.

No other changes to `buildPreviewInputs`.

---

## Part 3 — Replace progressionPreviews with startingLoads in createPreviewHandler

**File: `api/src/routes/adminPreview.js`**

**3a. Update the import from `progressionDecisionService`.**

Remove the import of `buildDecision`, `loadProgressionConfig`, `rankKey`, `resolveProfileName` entirely. These are no longer called from the preview handler.

**3b. Add import for the new pure function:**

```js
import { computeGuidelineLoadFromAnchors } from "../services/guidelineLoadService.js";
```

**3c. Replace the `progressionPreviews` block.**

Delete lines 465–549 (the entire `const progressionPreviews = {}` block including the `if (anchorLifts.length > 0)` check and all its contents).

Replace with:

```js
const startingLoads = {};

if (anchorLifts.length > 0) {
  // Build a lookup from estimationFamily → anchor data
  const anchorsByFamily = new Map(
    anchorLifts
      .filter((a) => a.estimationFamily && a.loadKg != null)
      .map((a) => [String(a.estimationFamily), a])
  );

  for (const programType of programTypes) {
    const preview = previews[programType];
    if (!preview?.ok) continue;

    const week1 = (preview.program?.weeks ?? []).find((w) => w.week_index === 1);
    if (!week1) continue;

    const decisions = [];
    for (const day of (week1.days ?? [])) {
      for (const seg of (day.segments ?? [])) {
        for (const item of (seg.items ?? [])) {
          const exerciseId = String(item.ex_id ?? "");
          const exerciseName = cached.exerciseNameMap[exerciseId] ?? exerciseId;
          const exerciseRow = cached.exerciseRows.find((r) => String(r.exercise_id) === exerciseId) ?? null;

          const base = {
            exercise_id: exerciseId,
            exercise_name: exerciseName,
            day: day.day_index,
            purpose: seg.purpose ?? "main",
            prescribed_reps: item.reps_prescribed ?? "",
            intensity_prescription: item.intensity_prescription
              ?? (item.rir_target != null ? `${item.rir_target} RIR` : ""),
          };

          if (!exerciseRow?.is_loadable) {
            decisions.push({ ...base, guideline_load_kg: null, skipped_reason: "not_loadable" });
            continue;
          }

          const meta = exerciseRow?.load_estimation_metadata;
          if (!meta?.estimation_family) {
            decisions.push({ ...base, guideline_load_kg: null, skipped_reason: "no_estimation_family" });
            continue;
          }

          const result = computeGuidelineLoadFromAnchors({
            exerciseItem: item,
            exerciseRow,
            anchorsByFamily,
            familyFactors: cached.familyFactors,
            programType,
          });

          if (!result) {
            decisions.push({ ...base, guideline_load_kg: null, skipped_reason: "no_anchor_match" });
          } else {
            decisions.push({
              ...base,
              guideline_load_kg: result.guideline_load_kg,
              unit: result.unit,
              confidence: result.confidence,
              source: result.source,
              reasoning: result.reasoning,
              set_1_rule: result.set_1_rule,
              skipped_reason: null,
            });
          }
        }
      }
    }

    startingLoads[programType] = decisions;
  }
}
```

**3d. Update the response.**

Replace `progression_preview: progressionPreviews` with `starting_loads: startingLoads` in the `res.json(...)` call.

---

## Part 4 — Update the admin UI

**File: `api/admin/preview.html`**

**4a. Rename the anchor lifts section label.**

Find the `<summary>` inside `#anchor-lifts-section`:

```html
<summary style="cursor:pointer;color:var(--muted);padding:2px 0">Anchor lifts (for progression)</summary>
```

Change to:

```html
<summary style="cursor:pointer;color:var(--muted);padding:2px 0">Anchor lifts (starting load estimation)</summary>
```

**4b. Replace `renderProgressionTab` with `renderStartingLoadsTab`.**

Delete the existing `renderProgressionTab` function entirely. Replace it with:

```js
function renderStartingLoadsTab(decisions) {
  if (!decisions || decisions.length === 0) {
    return `<div class="panel-empty">No starting load estimates — add anchor lifts above and regenerate.</div>`;
  }
  const rows = decisions.map(d => {
    if (d.skipped_reason) {
      return `<tr>
        <td>${esc(d.exercise_name ?? d.exercise_id)}</td>
        <td>${esc(String(d.day ?? ""))}</td>
        <td>${esc(d.purpose ?? "")}</td>
        <td>${esc(d.prescribed_reps ?? "")}</td>
        <td colspan="4" style="color:var(--muted);font-style:italic">${esc(d.skipped_reason)}</td>
      </tr>`;
    }
    return `<tr>
      <td>${esc(d.exercise_name ?? d.exercise_id)}</td>
      <td>${esc(String(d.day ?? ""))}</td>
      <td>${esc(d.purpose ?? "")}</td>
      <td>${esc(d.prescribed_reps ?? "")}</td>
      <td><strong>${esc(String(d.guideline_load_kg ?? "—"))}</strong> ${esc(d.unit ?? "kg")}</td>
      <td class="${d.confidence === 'high' ? 'ok' : d.confidence === 'low' ? 'err' : 'warn'}">${esc(d.confidence ?? "")}</td>
      <td>${esc(d.source ?? "")}</td>
      <td style="font-size:11px;color:var(--muted)">${(d.reasoning ?? []).map(r => esc(r)).join(" ")}</td>
    </tr>`;
  });
  return `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead>
      <tr style="text-align:left;border-bottom:1px solid var(--border)">
        <th style="padding:4px 8px">Exercise</th>
        <th style="padding:4px 8px">Day</th>
        <th style="padding:4px 8px">Purpose</th>
        <th style="padding:4px 8px">Prescribed</th>
        <th style="padding:4px 8px">Guideline Load</th>
        <th style="padding:4px 8px">Confidence</th>
        <th style="padding:4px 8px">Source</th>
        <th style="padding:4px 8px">Reasoning</th>
      </tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}
```

**4c. Remove `renderProgressionHint` and its call site.**

Delete the `renderProgressionHint` function entirely. In `renderItem` (or wherever the inline progression hint is rendered), remove the call to `renderProgressionHint(progressionDecision)` and the `const progressionDecision = ...` line that precedes it.

Also remove `buildProgressionKey`, `buildProgressionMap`, and `formatProgressionRecommendation` — these are no longer needed.

**4d. Update `renderProgramWithTabs`.**

In `renderProgramWithTabs`, change the sub-tab label and panel ID:

```js
// Before:
<button class="sub-tab" data-panel="${panelId}-progression">Progression</button>
// ...
<div id="${panelId}-progression" class="sub-panel">
  ${renderProgressionTab(progressionData)}
</div>

// After:
<button class="sub-tab" data-panel="${panelId}-starting-loads">Starting Loads</button>
// ...
<div id="${panelId}-starting-loads" class="sub-panel">
  ${renderStartingLoadsTab(progressionData)}
</div>
```

Update the function signature comment if present. No other logic changes.

**4e. Update the field name consumed from the API response.**

Find all occurrences of `data.progression_preview` and replace with `data.starting_loads`. There are two (around lines 882 and 973).

Also update any variable named `progressionData` passed into `renderProgramWithTabs` to reflect the new source — but the variable name itself is fine to keep.

**4f. Update `renderProgram` call site in `renderProgramWithTabs`.**

The first argument to `renderProgram` within `renderProgramWithTabs` also passes `progressionData` down to render inline hints. After removing `renderProgressionHint`, stop passing `progressionData` to `renderProgram` (or stop using it inside `renderProgram`). Ensure `renderProgram` no longer builds a `progressionMap` or passes it into `renderWeek`.

---

## Part 5 — Tests

**File: `api/src/routes/__tests__/adminPreview.test.js`**

### Tests to remove (or update to expect the new behavior)

- Any test that asserts `progression_preview` in the response — update to assert `starting_loads` instead.
- Any test that asserts `outcome: "increase_load"` or `outcome: "deload_local"` in the progression response — these outcomes no longer exist in Program Preview.

### Tests to add

| Case | Assert |
|---|---|
| `anchor_lifts` with matching family → `starting_loads[type]` contains entry with `guideline_load_kg > 0` | Starting load computed |
| `anchor_lifts` with family that has no anchor provided → `skipped_reason: "no_anchor_match"` | Skipped cleanly |
| Exercise with `is_loadable: false` → `skipped_reason: "not_loadable"` | Skipped cleanly |
| Exercise with no `estimation_family` in catalogue → `skipped_reason: "no_estimation_family"` | Skipped cleanly |
| No `anchor_lifts` in body → `starting_loads` is empty object `{}` | No errors, not `progression_preview` |
| `starting_loads` entry has `confidence`, `source`, `reasoning`, `set_1_rule` fields | Full shape returned |

Use the same `node:test` + mock DB pattern already in the test file. You can stub `cached.exerciseRows` and `cached.familyFactors` as needed.

---

## Part 6 — Verify: no calls to buildDecision remain in adminPreview.js

After the changes, `grep -n "buildDecision\|loadProgressionConfig\|syntheticHistory\|synthetic-1\|progressionPreviews\|progression_preview" api/src/routes/adminPreview.js` should return no matches. If any remain, they are regressions.

---

## Summary of files changed

| File | Change |
|---|---|
| `api/src/services/guidelineLoadService.js` | Add exported pure function `computeGuidelineLoadFromAnchors` |
| `api/src/routes/adminPreview.js` | Add `familyFactors` query to `buildPreviewInputs`; remove `progressionDecisionService` import; replace `progressionPreviews` block with `startingLoads`; rename response field |
| `api/admin/preview.html` | Rename anchor lifts label; replace `renderProgressionTab` → `renderStartingLoadsTab`; remove inline progression hint; rename sub-tab; update field name from response |
| `api/src/routes/__tests__/adminPreview.test.js` | Update/add tests for new `starting_loads` shape; remove tests that assert old progression outcomes |

No new routes. No migrations. No new services.
