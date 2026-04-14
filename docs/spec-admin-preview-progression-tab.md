# Spec: Progression Preview Tab on Admin Preview Page

## Problem

The admin preview page (`/admin/preview`) generates full program previews but has no way to test the progression decision engine. For an intermediate user, `progressionDecisionService` requires workout history — specifically, what weight/reps/RIR they hit in their last session. Without a way to supply that input, the progression logic is untestable from the admin UI.

## What we are NOT doing

- No new DB tables or writes
- No fake rows inserted into `segment_exercise_log`, `program_exercise`, or any other table
- No duplication of `buildDecision` logic — the existing pure function inside `progressionDecisionService.js` is called directly
- No new service, no new route file

## Recommended approach

### Core insight

`buildDecision` in `progressionDecisionService.js` is a pure, DB-free function already exported via `_test`. It takes:
- A `row` (exercise prescription — exercise_id, purpose, reps_prescribed, intensity_prescription, is_loadable, equipment_items_slugs)
- A `history[]` array (synthetic or real — weight_kg, reps_completed, rir_actual)
- Config and rank override objects (already loaded from DB by the existing preview machinery)

The preview page already generates a full program. Week 1 Day 1 exercises are the exact prescription rows we need. The only missing input is "what history to simulate".

The user's anchor lifts (family → kg + reps) are that history. Map each anchor lift to program exercises via `load_estimation_metadata.estimation_family` (already stored as JSONB on `exercise_catalogue`, already fetched in `buildPreviewInputs`).

### What changes

**1. Extend `buildPreviewInputs` — add `estimation_family` to the exercise catalogue fetch**

The existing query already fetches `SELECT * FROM exercise_catalogue`. `load_estimation_metadata` is already returned via `*`. No query change needed — just read `row.load_estimation_metadata?.estimation_family` when building the family index.

**2. Extend the `POST /preview/generate` endpoint to accept an optional `anchor_lifts[]` body field**

```json
{
  "fitness_rank": 1,
  "equipment_preset": "commercial_gym",
  "days_per_week": 3,
  "duration_mins": 50,
  "program_types": ["strength"],
  "anchor_lifts": [
    { "estimationFamily": "squat",            "loadKg": 100, "reps": 5, "rir": 2 },
    { "estimationFamily": "hinge",            "loadKg": 120, "reps": 5, "rir": 2 },
    { "estimationFamily": "horizontal_press", "loadKg": 80,  "reps": 5, "rir": 2 }
  ]
}
```

Shape matches the onboarding `AnchorLiftEntry` type — no new contract to define.

**3. In the preview handler, after `runPipeline` completes:**

For each requested `programType`:
1. Load the progression config for that type from DB (one query, same path as `applyProgressionRecommendations` — `loadProgressionConfig(db, programType)`). Re-use the `fetchProgramGenerationConfigs` already available in the service.
2. Derive `rankOverride` from `progression_by_rank_json[rankKey(fitnessRank)]`.
3. Collect the exercises from Week 1 (all days, or just Day 1 — see note below).
4. For each exercise, look up its `estimation_family` from the catalogue rows already in memory.
5. Find the matching `anchor_lift` entry by family.
6. If found, construct a synthetic 2-entry history:
   ```js
   [
     { log_id: "synthetic-1", weight_kg: anchorLift.loadKg, reps_completed: anchorLift.reps, rir_actual: anchorLift.rir },
     { log_id: "synthetic-2", weight_kg: anchorLift.loadKg, reps_completed: anchorLift.reps, rir_actual: anchorLift.rir },
   ]
   ```
   Two entries satisfies `evidence_requirement_multiplier: 1` (the default for intermediate) with no DB writes.
7. Call `buildDecision({ row, programType, profileName, profile, rankOverride, history: syntheticHistory, config })` directly.
8. Collect results into a `progression_preview[]` array keyed by `exercise_id`.

**4. Include `progression_preview` in the response alongside `previews`**

```json
{
  "ok": true,
  "meta": { ... },
  "previews": { "strength": { ... } },
  "progression_preview": {
    "strength": [
      {
        "exercise_id": "bb_back_squat",
        "exercise_name": "Back Squat",
        "week": 1, "day": 1,
        "prescribed_reps": "5",
        "anchor_load_kg": 100,
        "outcome": "increase_load",
        "recommended_load_kg": 105,
        "confidence": "medium",
        "reasons": ["..."]
      }
    ]
  }
}
```

**5. Add a "Progression" tab to the admin preview UI (`preview.html`)**

- Two inputs added to the existing controls panel: a collapsible "Anchor Lifts" section with 6 family rows, each with a kg field and a reps field (RIR optional, defaults to 2).
- When anchor lifts are present, the request includes them. When the section is empty/collapsed, the field is omitted and progression results are absent.
- The "Progression" tab appears alongside the existing Weeks/Debug tabs on each program type panel.
- The progression tab renders a table: Exercise | Day | Prescribed | Anchor | Outcome | Recommended Load | Confidence | Reason.
- Exercises with no matching anchor lift show "No anchor — skipped".

### Note on week 1 scope

Run progression decisions against **all exercises in week 1** (not just day 1). This gives a complete picture across the full weekly split and is more useful for testing hypertrophy programs with upper/lower splits. The response groups by `week_number` and `day_number`.

---

## What this deliberately omits

- **Anchor lifts for exercises with no estimation_family** — these silently produce "No anchor — skipped". No error.
- **Multi-week progression simulation** — this is a single-decision preview, not a full multi-week simulation. Simulating accumulated streaks and deload triggers is a separate, larger feature.
- **Saving results** — this is a read-only admin tool. No DB writes.
- **Conditioning / Hyrox progression** — `buildDecision` already returns `null` for non-strength/hypertrophy program types. The UI shows "Not applicable" for those rows.

---

## Implementation scope

| File | Change |
|---|---|
| `api/src/routes/adminPreview.js` | Add optional `anchor_lifts[]` param; after pipeline runs, call `loadProgressionConfig` + `buildDecision` per exercise; include `progression_preview` in response |
| `api/src/services/progressionDecisionService.js` | Export `buildDecision` and `loadProgressionConfig` as named exports (currently private / `_test` only) |
| `api/admin/preview.html` | Add "Anchor Lifts" collapsible input section; add "Progression" tab per program type panel |

Three files. No migrations. No new services.

---

## Why not a separate `/preview/progression` endpoint?

A separate endpoint would require duplicating the program generation call (or adding a round-trip from UI to generate, then a second call to get progression). The exercise prescription data needed by `buildDecision` comes from the generated program — it is most natural to produce it in the same request. A single endpoint that optionally enriches its response keeps the server and UI logic co-located and avoids state management between two requests in the browser.

---

## Why not use `applyProgressionRecommendations` directly?

`applyProgressionRecommendations` reads from `program_exercise` and `segment_exercise_log` in Postgres — it requires a real persisted program and real logged sessions. That would require creating fake rows (defeating the purpose of a preview tool) or a separate "dry run" code path. `buildDecision` is already the pure inner function that does all the interesting work; calling it directly is the correct seam.
