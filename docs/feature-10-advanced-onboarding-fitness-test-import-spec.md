# Feature 10 Specification: Advanced Onboarding — Fitness Test Mode and Training History Import

## 1. Executive Summary

Feature 10 improves the cold-start experience for athletes who do not know their working weights well enough to fill in onboarding anchor lifts directly.

The current system already has a strong first version of cold-start load estimation:

- onboarding Step 2b captures anchor lifts
- anchor lifts persist to `client_anchor_lift`
- `guidelineLoadService` computes starting load suggestions
- `GET /api/day/:id/full` injects `guideline_load`

That is valuable for athletes who can answer:

- “What can you squat for a solid set of 5–8?”
- “What do you usually bench for work sets?”

But a large part of the target audience cannot answer those questions reliably. For those users, Feature 10 adds two alternative entry paths:

1. **Fitness Test Mode**
   - a guided way to generate anchor lifts from simple test sets during onboarding
2. **Training History Import**
   - a CSV-based import that derives anchor lifts from past training logs

The feature also adds a better fallback for users who still provide no anchor data:

3. **Rank-based default loads**
   - conservative defaults per estimation family and fitness rank so the app does not fall back to “no guidance” in every zero-history case

This spec expands the roadmap item in [vision-and-roadmap.md](/c:/Users/alecp/bubble-workout-engine/docs/vision-and-roadmap.md) into an implementation-ready design grounded in the current anchor-lift architecture rather than replacing it.

---

## 2. Product Goals

### Primary goals

1. Reduce friction for users who do not know their working weights.
2. Improve first-session guideline loads without requiring prior in-app history.
3. Reuse the existing anchor-lift and guideline-load architecture rather than building a second cold-start system.
4. Allow a user’s real prior training history to seed better starting estimates.
5. Keep the onboarding experience optional, forgiving, and non-blocking.

### Non-goals

1. This is not a full training-history warehouse.
2. This is not a migration/import tool for every training app under the sun.
3. This is not a form-check or actual max-testing workflow.
4. This is not a live in-gym calibration session with device sensor input.
5. This is not a replacement for logged in-app history once the athlete starts training.

---

## 3. Current-State Analysis

### What already exists

From the current docs and code:

- Step 2b baseline loads already exists in mobile
- `client_anchor_lift` already exists
- `anchorLiftService` already validates and persists anchor lift entries
- `guidelineLoadService` already estimates starting loads from anchor lifts
- `GET /reference-data` already exposes `anchorExercises[]`
- `GET /api/day/:id/full` already returns `guideline_load`

This means Feature 10 is **not** starting from zero. It is extending an existing cold-start path.

### What is missing

1. No “fitness test mode” path in Step 2b.
2. No training-history import route.
3. No import parser or family-mapping service.
4. No rank-based fallback defaults in the estimation config for users with zero anchors.
5. No user-facing “I imported my history” resume path in onboarding.

### Important design consequence

Feature 10 should be designed as:

- **new inputs into the existing anchor-lift system**

not as:

- a parallel estimation system

That means all three inputs should converge into the same downstream model:

- `client_anchor_lift`

Those three sources are:

1. manual anchor entry
2. fitness test mode
3. imported training history

---

## 4. User Experience Scope

Feature 10 adds three athlete-facing surfaces.

### 4.1 Step 2b Fitness Test Mode

Purpose:

- let the user generate baseline anchor data through guided testing instead of self-recall

Primary behavior:

- Step 2b gets a toggle:
  - `Enter known working weights`
  - `Use test mode`
- in test mode, the screen walks one family at a time
- the user performs a simple test set and logs:
  - exercise
  - weight
  - reps
  - optional effort / RIR

### 4.2 Training History Import

Purpose:

- allow the user to seed anchors from prior training data outside the app

Primary behavior:

- user uploads a CSV from a supported exporter
- the app/backend parses rows
- maps exercises to estimation families
- derives anchor lifts from recent best working sets
- writes derived anchors into `client_anchor_lift`

### 4.3 Better Zero-History Fallback

Purpose:

- avoid a fully blank first session for users with no anchors and no logs

Primary behavior:

- if no manual anchors and no imported anchors exist
- and no history exists
- `guidelineLoadService` can return conservative rank-based defaults for estimatable families

This is intentionally lower confidence than manual/imported anchors and must be clearly labeled as such.

---

## 5. Core Product Rules

These are the invariant product rules for v1.

### 5.1 Anchor convergence rule

All cold-start paths end in `client_anchor_lift`.

That means:

- fitness test mode produces anchor-lift rows
- CSV import produces anchor-lift rows
- manual entry still produces anchor-lift rows

### 5.2 Source precedence rule

For one estimation family, anchor sources should be prioritized as:

1. manually entered / manually updated anchor
2. fitness test anchor
3. imported-history anchor

This avoids surprising users who explicitly corrected their numbers after import.

### 5.3 Non-blocking onboarding rule

Neither fitness test mode nor history import should block onboarding completion.

Allowed outcomes:

- user completes test mode partially
- user skips test mode entirely
- import fails but onboarding continues
- import succeeds for some families only

### 5.4 Conservative-default rule

Rank-based default loads are:

- only used when no better source exists
- clearly marked low-confidence
- always calibrate-on-set-1 guidance

### 5.5 Import scope rule

History import exists to derive anchor lifts, not to recreate a full session timeline.

In v1:

- imported rows do **not** populate `segment_exercise_log`
- imported rows do **not** create fake completed sessions
- imported rows do **not** enter PR/history feeds

They only seed anchor lifts.

---

## 6. Backend Design

## 6.1 Data Model Changes

### `client_anchor_lift`

The table already exists and should remain the canonical cold-start store.

Recommended additions:

- `source TEXT NOT NULL DEFAULT 'manual'`
- `source_detail_json JSONB NOT NULL DEFAULT '{}'::jsonb`

Recommended allowed values:

- `manual`
- `fitness_test`
- `history_import`
- `manual_update`

Why:

- source tracking matters for precedence
- it improves auditability and future debugging

### `exercise_load_estimation_family_config`

This table already exists as the family-level estimation config store.

Feature 10 should extend it with conservative fallback defaults by rank.

Recommended new JSONB column:

- `rank_default_loads_json JSONB NOT NULL DEFAULT '{}'::jsonb`

Example shape:

```json
{
  "beginner": 40,
  "intermediate": 80,
  "advanced": 100,
  "elite": 120
}
```

For unilateral/bodyweight families, the config may also need:

- `rank_default_unit TEXT`
- optional per-hand/per-side semantics

### `training_history_import`

Recommended new table for import tracking:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE`
- `client_profile_id UUID NULL REFERENCES client_profile(id) ON DELETE SET NULL`
- `source_app TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'processing'`
- `summary_json JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `completed_at TIMESTAMPTZ NULL`

Recommended statuses:

- `processing`
- `completed`
- `completed_with_warnings`
- `failed`

This is optional operationally, but strongly recommended so imports are inspectable and retryable.

### `training_history_import_row` (optional but recommended)

If the team wants traceability of row-level mapping/warnings:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `import_id UUID NOT NULL REFERENCES training_history_import(id) ON DELETE CASCADE`
- `raw_exercise_name TEXT NOT NULL`
- `mapped_exercise_id TEXT NULL`
- `mapped_estimation_family TEXT NULL`
- `weight_kg NUMERIC NULL`
- `reps INT NULL`
- `performed_at DATE NULL`
- `mapping_confidence TEXT NULL`
- `warning_code TEXT NULL`

This is not required for v1’s athlete-facing flow, but it makes admin/debug work much easier.

---

## 6.2 API Strategy

Recommended new/extended routes:

1. extend `PATCH /api/client-profiles/:id`
   - accept fitness-test-derived anchors as normal `anchorLifts[]`
2. `POST /api/import/training-history`
3. `GET /api/import/training-history/:import_id`
4. optionally extend `GET /reference-data`
   - expose supported import sources
   - expose fitness-test guidance metadata if needed

The existing guideline-load read path remains the same:

- `GET /api/day/:id/full`

---

## 6.3 Fitness Test Mode

### Product model

Fitness test mode is **not** a separate backend concept.

It simply changes how the client gathers anchor data before calling:

- `PATCH /api/client-profiles/:id`

### Why this matters

The roadmap line “No additional API changes needed” is mostly correct for the actual anchor submission path.

However, the expanded implementation may still need:

- more metadata in `reference-data`
- slightly richer source tracking in `client_anchor_lift`

So the correct interpretation is:

- no new anchor-submission API is required
- but some supporting API enrichment may still be useful

### Test-mode flow

For each estimation family:

1. choose one anchor exercise from eligible `anchorExercises[]`
2. prompt:
   - “Use a weight you can complete for a solid, controlled set of 5 reps”
3. user logs:
   - weight
   - reps actually completed
   - optional effort / RIR
4. client submits resulting anchor with:
   - `source = "fitness_test"`

### Why use 5 reps as the default

- lower injury/technique risk than max testing
- high enough load to be useful for estimation
- simple and memorable

### Guardrails

Fitness test mode should show warnings:

- do not test a true max
- stop if movement feels unstable or painful
- skip any lift you are unsure about

This is especially important because the product is not supervising the athlete live.

---

## 6.4 `POST /api/import/training-history`

Purpose:

- accept a supported CSV export
- derive anchor lifts from recent prior training history

### Request model

Recommended multipart form-data:

- `file`
- `source_app`

Supported v1 values:

- `hevy`

The roadmap mentions MyFitnessPal, Hevy, and Strong. For v1, the safest delivery is **Hevy only**, because the roadmap itself also calls it the most popular simple training logger and each vendor has different CSV shapes.

### Response shape

```json
{
  "ok": true,
  "import_id": "uuid",
  "status": "completed_with_warnings",
  "derived_anchor_lifts": [
    {
      "estimation_family": "squat",
      "exercise_id": "bb_back_squat",
      "load_kg": 100,
      "reps": 5,
      "source": "history_import"
    }
  ],
  "warnings": [
    {
      "code": "unmapped_exercise_name",
      "message": "Could not map 12 rows to a supported estimation family."
    }
  ]
}
```

### Processing algorithm

1. parse CSV rows
2. normalize:
   - exercise name
   - date
   - weight
   - reps
3. map row to:
   - exact exercise if possible
   - estimation family if possible
4. keep rows from the last 90 days only
5. for each family:
   - choose the best candidate working set
6. write/upsert to `client_anchor_lift`
7. return derived anchors + warnings

### Definition of “best candidate working set”

Recommended v1 heuristic:

- choose the heaviest recent set in the last 90 days with:
  - reps between 3 and 12 inclusive
  - non-zero weight

Tie-breaker:

1. higher weight
2. more recent date
3. reps closer to 5

Why:

- avoids using very high-rep sets as anchor proxies
- avoids using junk warm-up loads
- simple to explain and test

---

## 6.5 Exercise-name mapping for import

This is the hardest backend piece in Feature 10.

### Requirement

Map imported free-text exercise names to:

1. exact `exercise_id` where possible
2. at minimum, an `estimation_family`

### Recommended v1 strategy

Use a deterministic alias table, not fuzzy string magic in code.

Recommended new table:

- `exercise_import_alias`

Columns:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `source_app TEXT NOT NULL`
- `source_name_normalized TEXT NOT NULL`
- `exercise_id TEXT NULL REFERENCES exercise_catalogue(exercise_id)`
- `estimation_family TEXT NULL`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`

Unique:

- `(source_app, source_name_normalized)`

### Why alias table over hardcoded fuzzy matching

- editable without code deploy
- testable
- debuggable
- source-app-specific

### Acceptable fallback

If no exact alias exists:

1. normalize the string
2. try exact match against canonical exercise names
3. optionally try a conservative similarity threshold
4. if still unmapped:
   - record warning
   - do not derive anchor from that row

For v1, it is better to miss a row than to mis-map a row into the wrong family.

---

## 6.6 Rank-based default loads

This is the roadmap’s third sub-feature and should be implemented inside `guidelineLoadService`.

### Current behavior

No anchor + no history often means:

- `guideline_load = null`

### New behavior

If all of these are true:

1. no recent exact history
2. no anchor data for same exercise/family/cross-family
3. exercise is estimatable
4. estimation family has rank defaults configured

then return a low-confidence default guideline load.

### Example response

```json
{
  "value": 40,
  "unit": "kg",
  "confidence": "low",
  "source": "rank_default",
  "reasoning": [
    "Estimated from conservative beginner defaults for the squat family.",
    "Use set 1 to calibrate before continuing."
  ],
  "set_1_rule": "If this feels easier than ~3 RIR, add a small amount next set."
}
```

### Important caution

This is a product tradeoff:

- better than blank for some users
- potentially wrong for others

So the UI and reasoning must make it obvious these are conservative defaults, not personalized estimates.

---

## 6.7 Source precedence in `guidelineLoadService`

Feature 10 should update the effective precedence order to:

1. exact logged history
2. manual / manual_update anchor
3. fitness_test anchor
4. history_import anchor
5. rank_default
6. null

### Why imported anchors are below manual/test

Imported history can be noisier:

- exercise name mapping may be imperfect
- logging habits vary by app
- row quality is inconsistent

Manual and guided-test sources are more intentional for the current training phase.

---

## 7. Mobile Specification

## 7.1 Step 2b Mode Switch

The existing Step 2b screen should gain a mode selector:

- `Known weights`
- `Test mode`
- `Import history`

Recommended UI:

- segmented control or tab pills at the top of Step 2b

### Mode behavior

`Known weights`
- current behavior

`Test mode`
- guided testing flow in-place or as a nested screen stack

`Import history`
- file-picker / import explanation flow

### Why keep all three in one step

- avoids multiplying onboarding steps
- preserves the mental model that Step 2b is “baseline calibration”

---

## 7.2 Test Mode UX

Recommended flow:

1. intro card
2. one family card at a time
3. user chooses exercise
4. user performs set
5. user enters actual result
6. continue or skip family

Suggested copy:

- “Choose a weight you could perform for a strong, controlled set of 5 reps.”
- “Do not test your max.”
- “If unsure, skip this lift.”

### Captured values

- exercise id
- weight
- reps
- optional effort / RIR

These are then saved as normal anchors with source `fitness_test`.

---

## 7.3 Import History UX

Recommended v1 UX:

1. explain supported source:
   - `Hevy CSV`
2. allow user to select file
3. upload
4. show import result summary:
   - imported rows count
   - derived anchors count
   - unmapped rows count
5. user confirms and continues

### Summary card example

- `Imported 214 rows`
- `Derived 4 anchor lifts`
- `12 rows could not be matched`

### Failure behavior

Import failure should never block onboarding completion.

If import fails:

- show warning
- allow user to switch to known weights or skip

---

## 7.4 Day Detail UX for rank defaults

No major new UI is required beyond the existing guideline-load hint surface.

But the hint should differentiate sources:

- `manual anchor`
- `fitness test`
- `imported history`
- `default`

Recommended visible label only for the weakest source:

- if `source = rank_default`, show a subtle “Default estimate” badge

This helps the user understand why the suggestion may be less precise.

---

## 8. Backend Implementation Plan

## Phase 1: Source tracking + rank defaults

Files likely affected:

- migration for `client_anchor_lift.source`
- migration for `exercise_load_estimation_family_config.rank_default_loads_json`
- `anchorLiftService`
- `guidelineLoadService`

Changes:

1. add source metadata to anchors
2. add rank defaults to family config
3. update precedence logic in guideline load service

## Phase 2: Fitness test mode

Likely affected:

- mobile Step 2b screen
- optional `reference-data` enrichment for mode metadata

Changes:

1. add mode switch
2. add test-mode flow
3. submit resulting anchors with `source = fitness_test`

## Phase 3: History import backend

Likely affected:

- new import route
- CSV parser
- alias/mapping service
- import tracking tables

Changes:

1. accept supported CSV
2. normalize and map rows
3. derive anchors
4. upsert into `client_anchor_lift`

## Phase 4: History import UX

Likely affected:

- mobile Step 2b import tab
- file picker
- import result summary UI

---

## 9. Testing Plan

## 9.1 Backend tests

### Source precedence tests

Add cases for:

- manual anchor beats imported anchor
- fitness test anchor beats imported anchor
- exact logged history beats all anchor/default sources
- rank default used only when no better source exists

### Import route tests

Add cases for:

- valid Hevy CSV derives anchors
- unsupported source rejected with `400`
- malformed CSV rejected with `400`
- unmapped rows produce warnings but not total failure
- only last-90-day rows count
- best working set heuristic chooses correct row

### Alias mapping tests

Add cases for:

- exact alias match
- canonical exercise-name match
- unmapped row warning path

### Guideline load tests

Add cases for:

- source reported as `rank_default`
- default loads vary by fitness rank
- non-estimatable exercises still return null

## 9.2 Mobile tests

Add:

- Step 2b mode switch
- test-mode partial completion
- import mode success state
- import mode failure state
- skipping Step 2b after failed import
- guideline hint rendering for default-estimate source

---

## 10. Rollout Plan

### Stage 1

- add source tracking and rank-default backend support

### Stage 2

- ship test mode in Step 2b

### Stage 3

- ship Hevy-only history import

### Stage 4

- add more source-app import support if demand exists

This phased rollout keeps the first value slice small and leverages the cold-start architecture already in place.

---

## 11. Open Questions

1. Should rank-default loads be available for beginners only, or for all ranks when no better data exists?
2. Should imported anchor lifts overwrite existing manual anchors automatically, or require explicit confirmation?
3. Should test mode support bodyweight-only families differently than weighted families?
4. Should the import pipeline eventually write into a real historical activity table, or remain anchor-only forever?
5. Which source should be supported second after Hevy: Strong or another export format?

---

## 12. Recommended First Delivery Slice

The best first delivery slice is:

1. extend `client_anchor_lift` with source tracking
2. add rank-default loads to family config
3. update `guidelineLoadService` precedence
4. add `Test mode` to the existing Step 2b screen

That slice delivers immediate cold-start improvement without waiting for CSV import complexity. After that, the next best slice is Hevy-only import into anchors.
