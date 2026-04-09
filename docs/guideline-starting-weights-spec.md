# Guideline Starting Weights — Implementation Spec

> **Target audience:** Codex / backend + mobile implementation.
> **Source of truth:** `docs/architecture.md` — all architectural references in this spec cite sections from that document.
> **Status:** Ready for implementation.

> **Relationship to enhanced progression spec:** The anchor lift entries collected on `Step2bBaselineLoadsScreen` are also used to seed `exercise_progression_state` (Layer B) for the athlete's first program. See `docs/enhanced-progression-system-spec.md §10` — specifically the "Baseline loads cold-start" section. The `progressionSeedService` reads the anchor lift data and writes initial progression state rows so that Layer C can apply a starting load override from week 1, not just from week 2 onwards.

> **Schema cross-checks (verified against actual migrations):**
> - `client_profile.id` — UUID PK ✓ (V5)
> - `client_profile.fitness_rank` — INT 0–3 (0=beginner, 1=intermediate, 2=advanced, 3=elite) ✓ (`mapFitnessRank` in `generateProgramV2.js:53`)
> - `segment_exercise_log` has **no `exercise_id` column** — only `program_exercise_id` FK → `program_exercise.exercise_id` (V1). History suppression queries must JOIN through `program_exercise`.
> - Next available migration number is **V54** (V36–V53 already exist).

---

## 1. Executive Summary

### The problem

When an intermediate or advanced athlete arrives for their first workout in a newly generated program, they have no logged history in the system. Every exercise shows a blank weight field. The athlete must either guess their load or do an ad-hoc warm-up discovery set — both are friction, especially in a structured program that prescribes specific rep ranges, tempos, and RIR targets.

### What this feature does

During onboarding, for athletes who self-identify as **intermediate, advanced, or elite** (`fitness_rank >= 1`), we collect a small set of self-reported **anchor lifts** — known working loads for a handful of canonical exercises. We persist these anchors on the backend tied to the user's `client_profile`.

When the athlete opens a day for the first time, the day read route (`GET /api/day/:id/full`) applies an estimation service to annotate each exercise with a `guideline_load` — a conservative recommended starting load with a confidence band and an immediate calibration instruction for set 1.

The estimation logic is driven by **metadata on `exercise_catalogue`** (estimation family, conversion factor, unilateral flag) and a small companion config table for family-level cross-conversion rules — not by fuzzy exercise name matching.

Once the athlete has logged real sets for an exercise, their history supersedes the anchor-based estimate. The guideline load disappears or becomes secondary after the first logged session.

### Recommended architecture approach

| Concern | Approach |
|---|---|
| Anchor data capture | New `client_anchor_lift` table (not columns on `client_profile`) |
| Estimation config | New `load_estimation_metadata` JSONB column on `exercise_catalogue` + new `exercise_load_estimation_family_config` seed table |
| Estimation execution | Dynamic: computed on the read path at `GET /api/day/:id/full` |
| Source precedence | Logged history > anchor same exercise > anchor same family via config > conservative default |
| Pipeline isolation | Generation pipeline (Steps 01–06) is **not touched** — fully pure, no weight estimation |
| Mobile surface | New optional onboarding screen inserted between Equipment (Step 2) and Schedule (Step 3) |

---

## 2. Recommended Product Flow

### Where in onboarding

The current onboarding flow (architecture doc §5, `docs/mobile-screens.md`):

```
Step 1 — Goals (includes fitnessLevel, injuryFlags)
Step 2 — Equipment (equipmentPreset, equipmentItemCodes)
Step 3 — Schedule & Metrics
Program Review
```

**Recommendation: insert after Step 2 (Equipment), before Step 3 (Schedule).**

**Why after Step 2 and not after Step 1:**

Equipment determines which anchor exercises to offer. If the user has no barbell, asking about their back squat 1RM is irrelevant and confusing. The new step must know the equipment set so it can filter anchor exercise candidates to only those physically available to the user. Step 2 has already written `equipmentItemCodes` to `client_profile` via `PATCH /api/client-profiles/:id` before the user moves forward.

**Why not after Step 3:**

Step 3 collects schedule and biometrics — non-blocking data. Baseline loads are more closely related to fitness identity (Step 1) and equipment (Step 2). Inserting here maintains logical grouping.

**Proposed revised flow:**

```
Step 1 — Goals (fitnessLevel, goals, injuryFlags)
Step 2 — Equipment (equipmentPreset, equipmentItemCodes)
Step 2b — Baseline Loads  ← NEW (only shown if fitness_rank >= 1)
Step 3 — Schedule & Metrics
Program Review
```

**Fitness rank gate:** Show the step if and only if the user's `fitnessLevel` (from Step 1) maps to `fitness_rank >= 1`.

```
fitness_rank mapping — DB column client_profile.fitness_rank (0–3):
  beginner     → 0  → SKIP step entirely
  intermediate → 1  → show
  advanced     → 2  → show
  elite        → 3  → show

Source: mapFitnessRank() in api/src/routes/generateProgramV2.js:53.
Note: GET /reference-data returns fitnessLevels with a display-only "rank" field
starting at 1 (beginner=1). That is NOT the DB fitness_rank value. The DB value
is 0-indexed as above.
```

Beginners are unlikely to know their training loads, and the system has no reliable conservative base for beginner estimates that wouldn't risk overshooting. Skip the step silently for rank 0.

---

## 3. Mobile UX Spec

### Screen: Onboarding Step 2b — Baseline Loads

**Route name:** `OnboardingBaselineLoads`

**Shown for:** `fitness_rank >= 1` (intermediate, advanced, elite)

**Skipped for:** `fitness_rank === 0` (beginner) — navigate directly to Step 3

**API calls:**
- `GET /reference-data` (already called in Step 2; baseline anchor metadata should be included here — see §5)
- `PATCH /api/client-profiles/:id` with `anchorLifts[]` payload on CTA

---

#### Screen copy

**Title:** "Help us calibrate your first workout"

**Subtitle / body copy:**
> "Tell us a recent working weight for a few key lifts — not your max, just a weight you've used for solid working sets. We'll use these to suggest starting loads for your first session.
>
> If you don't know a lift or haven't trained it recently, just skip it."

---

#### Screen structure

```
┌─────────────────────────────────────────────────────┐
│  ← Back         [2b / 3]            Next / Finish → │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Help us calibrate your first workout               │
│  [subtitle copy]                                    │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Squat                                       │  │
│  │  [Exercise selector dropdown]                │  │
│  │  Which squat exercise do you know?           │  │
│  │                                              │  │
│  │  ○ Load:  [  42.5 kg  ]  Reps:  [  8  ]     │  │
│  │    (optional) RIR / Effort:  [ Easy / ~2 ]   │  │
│  │                                              │  │
│  │  ☑  I don't know / haven't done this recently│  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Hinge (Deadlift / RDL)                      │  │
│  │  [Exercise selector dropdown]                │  │
│  │  ...                                         │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Horizontal Press (Bench / Push)             │  │
│  │  ...                                         │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Vertical Press (Overhead)                   │  │
│  │  ...                                         │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Horizontal Pull (Row)                       │  │
│  │  ...                                         │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Vertical Pull (Pulldown / Pull-up)          │  │
│  │  ...                                         │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  ☑  Skip this step entirely                  │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  [Continue]                                         │
└─────────────────────────────────────────────────────┘
```

---

#### Per-anchor card spec

Each estimation family produces one card. Cards are shown in the order: `squat`, `hinge`, `horizontal_press`, `vertical_press`, `horizontal_pull`, `vertical_pull`. Cards for families that have no eligible anchor exercises in the user's equipment set are **hidden entirely** (e.g., if user has bodyweight only, the squat card shows bodyweight squat options; barbell-only exercises are excluded from the dropdown).

**Card fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| Family label | Static text | — | "Squat", "Hinge (Deadlift / RDL)", etc. |
| Exercise selector | Dropdown / select | Required if entering data | Populated from `referenceData.anchorExercises` filtered to this family and the user's equipment set |
| Load | Numeric input | Required if not "don't know" | kg or lb depending on user preference; decimal allowed (e.g. 42.5) |
| Reps | Numeric input | Required if not "don't know" | Integer 1–30 |
| RIR / Effort | Single-select segmented | Optional | Options: "Max effort (0 RIR)", "Hard (~1 RIR)", "Moderate (~2–3 RIR)", "Easy (4+ RIR)" — maps to 0, 1, 2.5, 4 internally |
| "I don't know / skip" toggle | Checkbox or switch | — | Ticking this disables and clears Load, Reps, RIR fields; pre-ticked by default so no data entry is required |

**Default state:** All "I don't know" toggles are pre-checked. The user only enters data for anchors they know.

**Exercise selector population:** The `GET /reference-data` response includes an `anchorExercises` array (see §5). The mobile client filters this by:
1. `estimation_family` matching the card family
2. `equipment_items_slugs` is a subset of the user's current `equipmentItemCodes`

The resulting options are shown in the dropdown, sorted by `anchor_priority` ascending (best anchor first).

**Equipment behaviour:**

| User equipment profile | Squat card shows | Horizontal press card shows |
|---|---|---|
| Commercial gym (full) | Back squat, Hack squat, Leg press, Front squat | Barbell bench press, Dumbbell bench press, Machine chest press |
| Minimal (dumbbells) | Goblet squat, DB front squat | Dumbbell bench press |
| Bodyweight | Bodyweight squat (for reference only — marked low confidence) | Push-up variations |

If the filtered list for a card is empty (e.g., no squat-family exercises available with the user's equipment), hide the card entirely.

---

#### CTA / navigation

| Action | Behaviour |
|---|---|
| **Continue** | Saves the completed anchor cards (skipping "don't know" entries) via `PATCH /api/client-profiles/:id`. Navigates to Step 3. Never blocks on missing data — the step is fully optional. |
| **Back** | Navigate to Step 2 (Equipment). No save. |
| **Skip this step entirely** | Single checkbox at the bottom. Ticking it pre-checks all "I don't know" toggles and disables all input fields. On Continue, sends `anchorLiftsSkipped: true` with an empty `anchorLifts[]`. |

**Validation:** No blocking validation. If Load is entered but Reps is empty (or vice versa), show an inline card-level hint: "Please enter both load and reps, or skip this lift." Do not block navigation — just show the hint.

**Partial completion:** Fully acceptable. If the user fills in 2 of 6 families, those 2 anchors are saved. The system works with partial input.

**Weight unit:** Respect the `weightUnit` preference from the profile (kg default). The label on the Load field updates accordingly.

---

## 4. Data Model Changes

### Decision: dedicated table vs. columns on `client_profile`

**Verdict: new dedicated table `client_anchor_lift`.**

**Why not columns on `client_profile`:**

There are 6 estimation families, each needing 5–6 columns (exercise_id, load, reps, rir, skipped, timestamp). That is 30+ nullable columns on `client_profile`. `client_profile` already has ~25+ columns (V26, V27–V33 per architecture §6). Stuffing another 30 nullable columns for an entirely separate concern makes the table unmaintainable and semantically wrong.

**Why a dedicated table:**

- Clean separation of concerns: anchor lift data is a separate concept from profile configuration.
- One row per family per profile — easy to query, update, and extend.
- Allows a future `updated_at` per anchor for staleness detection.
- Mirrors how `segment_exercise_log` and `estimated_1rm` are handled — related data in their own tables.
- The `PATCH /api/client-profiles/:id` route can still accept `anchorLifts[]` in the body and delegate to a service that writes to this table — transparent to the mobile client.

---

### Schema: `client_anchor_lift`

```sql
CREATE TABLE client_anchor_lift (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id       UUID NOT NULL REFERENCES client_profile(id) ON DELETE CASCADE,

  -- Which estimation family this row covers
  estimation_family       TEXT NOT NULL,
  -- CHECK: one of ('squat','hinge','horizontal_press','vertical_press',
  --               'horizontal_pull','vertical_pull')

  -- The specific exercise the user reported
  exercise_id             TEXT REFERENCES exercise_catalogue(exercise_id),
  -- NULL if the user skipped this family or selected "don't know"

  -- The reported load
  load_kg                 NUMERIC(6,2),
  -- NULL if skipped

  -- The reported rep count
  reps                    SMALLINT,
  -- NULL if skipped

  -- The reported RIR / effort (0, 1, 2.5, or 4 — mapped from segmented control)
  rir_estimate            NUMERIC(3,1),
  -- NULL if not reported; 0 = max effort, 4 = very easy

  -- Whether the user explicitly skipped this family
  skipped                 BOOLEAN NOT NULL DEFAULT false,
  -- true = user said "I don't know / skip"

  -- Source of the data
  source                  TEXT NOT NULL DEFAULT 'onboarding',
  -- 'onboarding' | 'manual_update' (future: user can update later)

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One row per family per profile (upsert target)
  UNIQUE (client_profile_id, estimation_family)
);

CREATE INDEX ON client_anchor_lift (client_profile_id);
```

**Rationale for key decisions:**

- `UNIQUE (client_profile_id, estimation_family)` — enables clean upsert semantics when the user re-runs onboarding or updates anchors later.
- `ON DELETE CASCADE` — consistent with other `client_profile`-keyed tables (e.g., per architecture §6, `program.user_id` uses `ON DELETE CASCADE` as of V34).
- `load_kg` — always store in kg internally. The `weightUnit` preference is a display concern only. Same pattern as `weightKg` on `client_profile`.
- `rir_estimate NUMERIC(3,1)` — allows 0.0, 1.0, 2.5, 4.0 from the UI segmented control.
- `skipped BOOLEAN` — explicit skip signal. Important: a row with `skipped = true` is semantically different from a missing row (no row = user never saw this step; skipped row = user saw it and chose not to enter data).

---

### `client_profile` changes

Add one column to track whether the entire baseline-loads step was explicitly skipped:

```sql
ALTER TABLE client_profile
  ADD COLUMN anchor_lifts_skipped BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN anchor_lifts_collected_at TIMESTAMPTZ;
```

`anchor_lifts_skipped = true` means the user tapped "Skip this step entirely". `anchor_lifts_collected_at` is set when the user submits the step (even with partial data). This is used to detect stale anchors in the future.

---

### `exercise_catalogue` changes

Add a JSONB metadata column for load estimation properties:

```sql
ALTER TABLE exercise_catalogue
  ADD COLUMN load_estimation_metadata JSONB;
```

**Shape of `load_estimation_metadata`:**

```jsonc
{
  "estimation_family": "horizontal_press",
  // One of: squat | hinge | horizontal_press | vertical_press |
  //         horizontal_pull | vertical_pull | null (not estimatable)

  "is_anchor_eligible": true,
  // true = this exercise can be offered as an anchor lift in onboarding

  "anchor_priority": 1,
  // 1 = best / most canonical anchor for this family (e.g. barbell bench press = 1)
  // Higher number = less preferred anchor (e.g. cable chest press = 5)
  // Only meaningful when is_anchor_eligible = true

  "family_conversion_factor": 1.0,
  // This exercise's load relative to the canonical anchor for the family.
  // Example: incline dumbbell press = 0.85 (user lifts ~85% of their flat BB bench as total DB load)
  // Example: back squat canonical = 1.0; goblet squat = 0.45
  // Used when THIS exercise is the TARGET (we know the anchor, we want to estimate this exercise)

  "is_unilateral": false,
  // true = exercise is performed per-limb (e.g. single-arm row, Bulgarian split squat)
  // When true, the output load is per-limb; the conversion from bilateral anchor applies the
  // unilateral_factor below

  "unilateral_factor": null,
  // Only relevant when is_unilateral = true.
  // Fraction of the bilateral anchor load to use per limb.
  // E.g. single-arm dumbbell row: unilateral_factor = 0.55 (55% of bilateral row anchor per arm)
  // E.g. Bulgarian split squat: unilateral_factor = 0.40 (40% of bilateral squat anchor per side)
  // Null = use family default from load_estimation_family_config

  "stability_penalty": 0.0,
  // Additional percentage discount for stability demand beyond the family norm.
  // 0.0–0.15. E.g. cable fly = 0.05; ring push-up = 0.12

  "complexity_penalty": 0.0,
  // Additional percentage discount for technical complexity beyond the family norm.
  // 0.0–0.15. E.g. hang clean = 0.15; Romanian deadlift = 0.0

  "equipment_type": "barbell",
  // "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight" | "kettlebell"
  // Used for rounding logic (barbell → plate increments; dumbbell → fixed pairs; etc.)

  "not_estimatable": false
  // true = skip estimation entirely for this exercise (e.g. highly machine-specific, no reliable
  //        conversion). The read path returns null guideline_load for these exercises.
}
```

**Why JSONB on `exercise_catalogue` rather than a separate table:**

See §8 for the full tradeoff discussion. Short answer: estimation family and conversion metadata are per-exercise properties. They belong on the catalogue row in the same way `hyrox_role` and `strength_equivalent` are per-exercise boolean flags. The admin panel exercise edit drawer already supports arbitrary field inspection. A JSONB column keeps the data model simple without requiring an additional join on every day read.

Cross-exercise conversion rules (family → family) live in a separate lightweight seed table (§8).

---

### New seed table: `exercise_load_estimation_family_config`

```sql
CREATE TABLE exercise_load_estimation_family_config (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_family             TEXT NOT NULL,
  to_family               TEXT NOT NULL,
  -- cross-family conversion: if we have a horizontal_press anchor but need a vertical_press target
  -- this factor is applied as a last-resort cross-family conversion
  cross_family_factor     NUMERIC(4,3) NOT NULL,
  -- base unilateral factor for this family (can be overridden per exercise)
  default_unilateral_factor NUMERIC(4,3),
  notes                   TEXT,
  UNIQUE (from_family, to_family)
);
```

Seeded in `R__seed_load_estimation_family_config.sql`. Example rows:

| from_family | to_family | cross_family_factor | notes |
|---|---|---|---|
| horizontal_press | vertical_press | 0.72 | OHP is typically ~70–75% of bench |
| horizontal_press | horizontal_pull | 0.90 | row typically close to bench |
| squat | hinge | 0.75 | deadlift typically ~75% of squat anchor |
| hinge | squat | 1.20 | squat from deadlift anchor |
| vertical_pull | vertical_press | 0.95 | pulldown typically close to OHP |

Cross-family conversion is a last resort (confidence: low). It is used only when no same-family anchor exists.

---

## 5. API Changes

### `GET /reference-data` — extend response

Architecture §2 describes `GET /reference-data` as returning `equipmentItems` and config lookups for mobile onboarding screens. Extend it to also return anchor exercise metadata.

**New field: `anchorExercises[]`**

```jsonc
// GET /reference-data response — new field added alongside existing equipmentItems
{
  "equipmentItems": [...],          // existing
  "equipmentPresets": [...],        // existing
  "anchorExercises": [
    {
      "exercise_id": "barbell_back_squat",
      "name": "Barbell Back Squat",
      "estimation_family": "squat",
      "anchor_priority": 1,
      "equipment_items_slugs": ["barbell", "squat_rack"],
      "is_unilateral": false
    },
    {
      "exercise_id": "goblet_squat",
      "name": "Goblet Squat",
      "estimation_family": "squat",
      "anchor_priority": 3,
      "equipment_items_slugs": ["dumbbells"],
      "is_unilateral": false
    }
    // ... all exercises where load_estimation_metadata->>'is_anchor_eligible' = 'true'
  ]
}
```

The mobile client uses `anchorExercises` to populate the exercise selector dropdowns on the Baseline Loads screen, filtered client-side by the user's equipment and family.

**Backend query (conceptual):**

```sql
SELECT
  exercise_id,
  name,
  load_estimation_metadata->>'estimation_family' AS estimation_family,
  (load_estimation_metadata->>'anchor_priority')::int AS anchor_priority,
  equipment_items_slugs,
  (load_estimation_metadata->>'is_unilateral')::boolean AS is_unilateral
FROM exercise_catalogue
WHERE is_archived = false
  AND (load_estimation_metadata->>'is_anchor_eligible')::boolean = true
ORDER BY estimation_family, anchor_priority;
```

No auth required — same access level as existing `reference-data`.

---

### `PATCH /api/client-profiles/:id` — accept anchor lifts

The mobile client already uses this endpoint to save each onboarding step (architecture §5). Extend it to accept anchor lift data in the same call.

**New accepted fields in PATCH body:**

```jsonc
{
  // existing fields still accepted unchanged
  "fitnessLevel": "intermediate",

  // new fields
  "anchorLiftsSkipped": false,
  // true if user tapped "Skip this step entirely"

  "anchorLifts": [
    {
      "estimationFamily": "squat",
      "exerciseId": "barbell_back_squat",
      "loadKg": 100.0,
      "reps": 8,
      "rirEstimate": 2.0,
      "skipped": false
    },
    {
      "estimationFamily": "hinge",
      "exerciseId": null,
      "loadKg": null,
      "reps": null,
      "rirEstimate": null,
      "skipped": true
      // user said "I don't know" for this family
    }
  ]
}
```

**Backend handling:**

In `server.js` (where `PATCH /api/client-profiles/:id` is currently defined inline — architecture §2), add `anchorLifts` and `anchorLiftsSkipped` to the accepted patch key set. Delegate anchor lift writes to a new service function `anchorLiftService.upsertAnchorLifts(db, clientProfileId, anchorLifts)`.

The service upserts into `client_anchor_lift` using `ON CONFLICT (client_profile_id, estimation_family) DO UPDATE`. Skipped families are upserted with `skipped = true` and null load/reps/rir. Missing families (not in the payload) are not touched — allows partial updates.

Also update `client_profile.anchor_lifts_skipped` and `client_profile.anchor_lifts_collected_at` in the same transaction.

---

### `GET /api/day/:id/full` — inject guideline loads

This route currently returns day info, segments, and exercises (architecture §2, `readProgram.js`). Extend it to inject `guideline_load` onto each exercise object.

**New field on each exercise in the response:**

```jsonc
// Inside each exercise row in the day response
{
  "exercise_id": "incline_dumbbell_bench_press",
  "name": "Incline Dumbbell Bench Press",
  "sets": 3,
  "rep_range": "8-12 reps",
  "tempo": "3-1-1",
  "rir": 2,
  // ... existing fields unchanged ...

  // NEW: nullable — null if no estimation is possible or user has sufficient logged history
  "guideline_load": {
    "value": 26.0,
    "unit": "kg_per_hand",
    // unit: "kg" | "kg_per_hand" | "kg_per_side" | "bodyweight" | "assistance_kg"
    "confidence": "medium",
    // "high" | "medium" | "low" | null
    "source": "anchor_family",
    // "exact_history" | "anchor_same_exercise" | "anchor_same_family" |
    // "anchor_cross_family" | "fallback_default" | null
    "anchor_exercise_id": "barbell_bench_press",
    "anchor_load_kg": 80.0,
    "anchor_reps": 8,
    "anchor_rir": 2.0,
    "reasoning": [
      "Used horizontal_press family anchor (barbell bench press)",
      "Applied flat-to-incline dumbbell conversion factor (0.85)",
      "Applied hypertrophy repeatability adjustment (0.97)",
      "Rounded down to nearest 2kg dumbbell increment"
    ],
    "set_1_rule": "If set 1 feels easier than 4 RIR, increase 2 kg per hand. If below 1 RIR, reduce 2–4 kg per hand."
  }
}
```

**When `guideline_load` is null (suppressed):**
- The user has logged this exercise in the current program with `>= 1` valid set (sufficient history — see §9).
- The exercise has `load_estimation_metadata->>'not_estimatable' = 'true'` (machine-specific, no conversion).
- The exercise is bodyweight with no load component (e.g. unweighted pull-up, not yet loaded).
- The user has no anchor data and no history and no fallback exists.
- The program day is **not the first training day** of the program AND the user has at least 1 completed day logged. (After the first day, suppress guideline loads for subsequent days until logged history is available.)

**Program day gate:** Only inject guideline loads when `program_day.week_number = 1 AND program_day.day_number = 1`, OR when the exercise has no logged history yet in this program. This prevents stale anchors from appearing weeks into a program.

---

### No separate guideline-load endpoint

There is no need for a standalone `GET /api/guideline-load` endpoint. The day read route is the correct and only consumer. Keeping estimation logic in one place (the day read route / service) avoids duplication.

---

## 6. Where the Estimation Logic Should Run

### Confirmed recommendation: read path at `GET /api/day/:id/full`

The user's instinct is correct. Here is the full rationale:

**Why NOT in the generation pipeline (Steps 01–06):**

The pipeline is a pure, stateless, config-driven function (architecture §3, §8 Key Decision 4). Steps do not query the DB. Steps 01–06 produce a program structure with exercises, reps, tempo, and RIR — they are explicitly not designed to produce per-exercise load recommendations. Step 04 (`applyRepRules`) is the earliest point where reps/tempo/RIR exist, but even then:
- Pipeline output is persisted as pipe-delimited emitter rows (architecture §3, §8 Key Decision 5). There is no `guideline_load` column in the current emitter schema (EX rows have 26 columns — see §3). Adding it would require schema changes to `program_exercise` and emitter format changes.
- Anchor data lives in `client_anchor_lift`, which is not a pipeline input and would violate the pipeline's self-contained design.
- Guideline loads go stale as soon as the user starts logging. Baking them in at generation time means serving stale data on subsequent reads.

**Why the read path is right:**

- `GET /api/day/:id/full` already assembles a rich view from Postgres joins.
- At read time, the exercises, reps, tempo, RIR, and program type are all known.
- Logged history (`segment_exercise_log`) can be checked dynamically to suppress stale recommendations.
- The estimation is a pure function: `(anchorLifts, exerciseMetadata, exerciseLogs, repRules) → guidelineLoad`. No side effects.
- The route already fetches the `user_id` from ownership checks — trivial to also fetch `client_anchor_lift` rows.

**Caching / persistence:**

Do not cache or persist guideline loads. The computation is lightweight (6 anchor rows + 1 catalogue metadata fetch + 1 history check). The data changes frequently (history accumulates; user may update anchors). Caching would add complexity for negligible performance gain. If profiling later reveals this is a bottleneck, the anchor + catalogue data can be memoized per-request.

**Already-logged workouts:**

When `segment_exercise_log` contains records for the target `exercise_id` within the current program, the `guideline_load` is suppressed (`null`) and the mobile client should instead show the user's last logged weight + reps as the pre-fill for the weight field. This is existing UX behaviour and does not require new development — the mobile client's set logger already pre-fills from logged history.

**Stale recommendation handling:**

`guideline_load` appears only when `source != "exact_history"` AND the current program day has no logged sets for this exercise. As soon as the user logs set 1, the next read of this day returns `null` for `guideline_load` on that exercise (or switches to `source: "exact_history"` with the user's actual last weight). After the first week, anchor-based recommendations should not be shown at all.

---

### Service ownership

New service: `api/src/services/guidelineLoadService.js`

Exposed function:
```
annotateExercisesWithGuidelineLoads(db, { exercises, clientProfileId, programType, weekNumber })
→ exercises[] (with guideline_load field added or null)
```

Called by `readProgram.js` in the `GET /api/day/:id/full` handler after existing exercise assembly. Fully opt-in — if `clientProfileId` is unavailable or anchor data fetch fails, the handler falls back gracefully with `guideline_load: null` on all exercises.

---

## 7. Revised Estimation Logic

### Core design principles

The original pseudocode relied heavily on fuzzy exercise-name matching (`classify_relationship`, `close_variant_multiplier` with hardcoded string comparisons). This approach is fragile — it breaks when exercise IDs change, adds exercises, or renames variants. The replacement design uses:

1. **`estimation_family`** on `exercise_catalogue.load_estimation_metadata` — categorises every exercise into one of 6 canonical families. Comparison is exact.
2. **`family_conversion_factor`** on the target exercise — the conversion from the family's canonical anchor to this specific exercise. Stored in catalogue config, not in code.
3. **`anchor_priority`** on anchor-eligible exercises — selects the best anchor within a family, not by name, but by config rank.
4. Only heuristic fallback: cross-family conversion via `exercise_load_estimation_family_config` (last resort, confidence: low).

---

### Estimation families

```
squat              — bilateral lower body knee-dominant patterns
hinge              — bilateral lower body hip-dominant patterns
horizontal_press   — horizontal push patterns (bench, push-up variants)
vertical_press     — overhead / incline push patterns
horizontal_pull    — horizontal pull patterns (row variants)
vertical_pull      — vertical pull patterns (pulldown, pull-up variants)
```

Exercises with `estimation_family = null` or `not_estimatable = true` receive no guideline load.

---

### Pseudocode: `annotateExercisesWithGuidelineLoads`

```
FUNCTION annotateExercisesWithGuidelineLoads(db, { exercises, clientProfileId, programType, weekNumber }):

  IF weekNumber > 1:
    // After week 1, only annotate exercises with no logged history
    // (Handled per-exercise below)

  anchorLifts = db.query(
    SELECT * FROM client_anchor_lift
    WHERE client_profile_id = clientProfileId
      AND skipped = false
      AND exercise_id IS NOT NULL
      AND load_kg IS NOT NULL
  )
  // Map to: { [estimation_family]: anchorLift }
  anchorByFamily = index anchorLifts by estimation_family

  exerciseIds = exercises.map(e => e.exercise_id)

  // Batch fetch estimation metadata for all exercises in this day
  catalogueMetadata = db.query(
    SELECT exercise_id, load_estimation_metadata, equipment_items_slugs
    FROM exercise_catalogue
    WHERE exercise_id = ANY(exerciseIds)
  )
  metaById = index catalogueMetadata by exercise_id

  // Batch fetch exercise history for this user (any program, last 90 days)
  // Note: segment_exercise_log has no exercise_id; must join through program_exercise.
  recentHistory = db.query(
    SELECT DISTINCT ON (pe.exercise_id)
      pe.exercise_id, sel.weight_kg, sel.reps, sel.created_at
    FROM segment_exercise_log sel
    JOIN program_exercise pe ON pe.id = sel.program_exercise_id
    JOIN program_day pd ON pd.id = pe.program_day_id
    JOIN program p ON p.id = pd.program_id
    WHERE p.user_id = (SELECT user_id FROM client_profile WHERE id = clientProfileId)
      AND sel.created_at >= now() - interval '90 days'
      AND sel.weight_kg IS NOT NULL
    ORDER BY pe.exercise_id, sel.created_at DESC
  )
  historyByExercise = index recentHistory by exercise_id (keeping most recent entry per exercise)

  // Fetch family config for cross-family conversions (small table, could be cached)
  familyConfig = db.query(SELECT * FROM exercise_load_estimation_family_config)
  familyConfigMap = index by (from_family, to_family)

  FOR EACH exercise IN exercises:

    meta = metaById[exercise.exercise_id]
    IF meta is null OR meta.load_estimation_metadata is null:
      exercise.guideline_load = null
      CONTINUE

    lem = meta.load_estimation_metadata  // shorthand

    IF lem.not_estimatable == true:
      exercise.guideline_load = null
      CONTINUE

    // Check for exact logged history — supersedes all estimation
    exactHistory = historyByExercise[exercise.exercise_id]
    IF exactHistory is not null:
      // User has already logged this exercise — suppress guideline load
      // (mobile client uses last-logged weight pre-fill instead)
      exercise.guideline_load = null
      CONTINUE

    family = lem.estimation_family
    IF family is null:
      exercise.guideline_load = null
      CONTINUE

    // Attempt to find best anchor
    anchor = NULL
    anchorSource = NULL

    // Priority 1: same exercise as an anchor
    anchorLift = anchorByFamily[family]
    IF anchorLift is not null AND anchorLift.exercise_id == exercise.exercise_id:
      anchor = anchorLift
      anchorSource = "anchor_same_exercise"

    // Priority 2: same family anchor (different exercise)
    ELSE IF anchorLift is not null:
      anchor = anchorLift
      anchorSource = "anchor_same_family"

    // Priority 3: cross-family anchor (last resort)
    ELSE:
      FOR EACH (fam, lift) IN anchorByFamily:
        IF familyConfigMap[(fam, family)] exists:
          anchor = lift
          anchorSource = "anchor_cross_family"
          crossFamilyFactor = familyConfigMap[(fam, family)].cross_family_factor
          BREAK  // use first available cross-family anchor

    // No anchor at all → return null (no fallback conservative default for now)
    IF anchor is null:
      exercise.guideline_load = null
      CONTINUE

    exercise.guideline_load = computeGuidelineLoad(
      anchor, anchorSource, crossFamilyFactor,
      exercise, lem, programType, familyConfig
    )

  RETURN exercises


FUNCTION computeGuidelineLoad(anchor, anchorSource, crossFamilyFactor, exercise, lem, programType, familyConfig):

  // Step 1: Normalize anchor load to target reps/RIR
  anchorLoad = normalizeAnchorLoad(
    anchorLoad   = anchor.load_kg,
    anchorReps   = anchor.reps,
    anchorRir    = anchor.rir_estimate ?? 2.0,  // assume moderate if not provided
    targetReps   = midpoint(exercise.rep_range),
    targetRir    = exercise.rir ?? 2
  )

  // Step 2: Apply family conversion factor from catalogue config
  estimatedLoad = anchorLoad * lem.family_conversion_factor

  // Step 3: Apply cross-family factor if applicable
  IF anchorSource == "anchor_cross_family":
    estimatedLoad = estimatedLoad * crossFamilyFactor

  // Step 4: Unilateral adjustment
  IF lem.is_unilateral == true:
    unilateralFactor = lem.unilateral_factor
      ?? familyConfig.forFamily(lem.estimation_family).default_unilateral_factor
      ?? 0.50
    estimatedLoad = estimatedLoad * unilateralFactor
    // Output unit becomes "kg_per_hand" or "kg_per_side"

  // Step 5: Stability and complexity penalties
  estimatedLoad = estimatedLoad * (1.0 - lem.stability_penalty)
  estimatedLoad = estimatedLoad * (1.0 - lem.complexity_penalty)

  // Step 6: Program type adjustment
  programFactor = SWITCH programType:
    "strength"      → 1.00  // no adjustment for strength; let anchor speak
    "hypertrophy"   → 0.97  // slight conservative bias for moderate rep ranges
    "conditioning"  → 0.88  // repeatable sub-max
    "hyrox"         → 0.85  // race-sustainability
    DEFAULT         → 0.97

  estimatedLoad = estimatedLoad * programFactor

  // Step 7: Tempo adjustment
  tempoFactor = computeTempoFactor(exercise.tempo)
  estimatedLoad = estimatedLoad * tempoFactor

  // Step 8: Conservative floor (never estimate below 5 kg for barbell, 2 kg per hand for DB)
  estimatedLoad = max(estimatedLoad, minimumLoad(lem.equipment_type))

  // Step 9: Round down to nearest practical increment
  roundedLoad = roundDown(estimatedLoad, lem.equipment_type)

  // Step 10: Determine output unit
  unit = resolveUnit(lem.is_unilateral, lem.equipment_type)

  // Step 11: Confidence
  confidence = scoreConfidence(anchorSource, anchor)

  // Step 12: Reasoning trace
  reasoning = buildReasoningTrace(...)

  RETURN {
    value: roundedLoad,
    unit: unit,
    confidence: confidence,
    source: anchorSource,
    anchor_exercise_id: anchor.exercise_id,
    anchor_load_kg: anchor.load_kg,
    anchor_reps: anchor.reps,
    anchor_rir: anchor.rir_estimate,
    reasoning: reasoning,
    set_1_rule: set1Rule(confidence, exercise)
  }


FUNCTION normalizeAnchorLoad(anchorLoad, anchorReps, anchorRir, targetReps, targetRir):

  // Adjust load for rep delta (conservative — 2% per rep, asymmetric)
  repDelta = targetReps - anchorReps
  IF repDelta > 0:
    load = anchorLoad * (1 - 0.02 * repDelta)   // more reps → lighter
  ELSE IF repDelta < 0:
    load = anchorLoad * (1 + 0.015 * abs(repDelta))  // fewer reps → heavier, but asymmetrically conservative
  ELSE:
    load = anchorLoad

  // Adjust load for RIR delta
  rirDelta = targetRir - anchorRir
  IF rirDelta > 0:
    load = load * (1 - 0.02 * rirDelta)   // more reserve → lighter
  ELSE IF rirDelta < 0:
    load = load * (1 + 0.015 * abs(rirDelta))  // less reserve → heavier, asymmetric
  
  RETURN load


FUNCTION computeTempoFactor(tempo):
  IF tempo is null OR tempo == "0-0-0-0" OR tempo == "1-0-1":
    RETURN 1.0

  parsed = parseTempo(tempo)
  // tempo format: "eccentric-pause_bottom-concentric-pause_top"

  factor = 1.0

  IF parsed.eccentric >= 3:
    factor = factor * 0.93   // slow eccentric meaningfully reduces max load

  IF parsed.pause_bottom >= 2 OR parsed.pause_top >= 2:
    factor = factor * 0.96   // pause reduces load tolerance

  RETURN factor


FUNCTION roundDown(load, equipmentType):
  SWITCH equipmentType:
    "barbell":
      // Round to nearest 2.5 kg (smallest plate increment for most gyms)
      RETURN floor(load / 2.5) * 2.5
    "dumbbell":
      // Round to nearest 2 kg (standard dumbbell pair step)
      RETURN floor(load / 2) * 2
    "machine":
      // Round to nearest 5 kg (typical weight stack step)
      RETURN floor(load / 5) * 5
    "cable":
      // Round to nearest 2.5 kg
      RETURN floor(load / 2.5) * 2.5
    "kettlebell":
      // Round to nearest 4 kg (standard KB increments: 8, 12, 16, 20, 24 kg)
      standard_sizes = [8, 12, 16, 20, 24, 28, 32, 40, 48]
      RETURN max(s in standard_sizes where s <= load, 8)
    DEFAULT:
      RETURN floor(load / 2.5) * 2.5


FUNCTION scoreConfidence(anchorSource, anchor):
  score = 0

  SWITCH anchorSource:
    "anchor_same_exercise": score += 50
    "anchor_same_family":   score += 30
    "anchor_cross_family":  score += 10

  // Recency
  daysSinceAnchor = days_since(anchor.created_at)
  // Note: anchor.created_at from client_anchor_lift.created_at is "when user told us"
  // We don't know the original lift date. Treat all onboarding anchors as reasonably recent
  // but apply a mild discount for time since collection.
  IF daysSinceAnchor < 30:  score += 20
  ELSE IF daysSinceAnchor < 90: score += 10
  ELSE: score += 0  // stale anchor

  // Effort quality
  IF anchor.rir_estimate IS NOT NULL: score += 15
  ELSE: score += 5  // rep count alone is still useful

  SWITCH score:
    >= 70: RETURN "high"
    >= 45: RETURN "medium"
    DEFAULT: RETURN "low"


FUNCTION set1Rule(confidence, exercise):
  rir = exercise.rir ?? 2
  SWITCH confidence:
    "high":
      RETURN "Use estimated load for set 1. After set 1: if actual RIR is ≥{rir+2}, increase 2.5–5%; if on target, keep load; if below target, reduce 5–10%."
    "medium":
      RETURN "Use estimated load as your exploratory set 1. Adjust one increment on set 2 if needed. For compounds, avoid overshooting target RIR."
    "low":
      RETURN "Start one increment below estimated load. Treat set 1 as calibration. Increase only if movement quality and RIR clearly allow."
```

---

## 8. Recommended Config Approach

### The question

Where should the per-exercise estimation metadata live?

| Option | Pros | Cons |
|---|---|---|
| New columns on `exercise_catalogue` | Simple schema, each field visible | 6–8 new columns, many nullable, pollutes the exercise table with unrelated concerns |
| JSONB column on `exercise_catalogue` | Single migration, arbitrary shape, admin-readable, zero null-column sprawl | JSONB is opaque in basic SQL views; requires explicit cast to query individual fields |
| New companion table `exercise_load_estimation_config` | Perfect normalisation; joinable | Requires a join on every day read; admin needs a second table to manage; more migration surface |
| Logic in code | No DB changes | Fragile, hardcoded, requires code change per exercise |

**Verdict: JSONB column `load_estimation_metadata` on `exercise_catalogue` + small `exercise_load_estimation_family_config` seed table.**

**Rationale:**

The per-exercise fields (`estimation_family`, `family_conversion_factor`, `is_unilateral`, `stability_penalty`, `complexity_penalty`, `equipment_type`) are intrinsic properties of the exercise. They belong on the catalogue row in the same spirit as `hyrox_role`, `strength_equivalent`, and `min_fitness_rank`. The architecture already uses this pattern — V21 added `hyrox_role` and `hyrox_station_index` as new columns; V23 added `strength_equivalent`. However, a standalone JSONB column is preferable to 6–8 individual columns because:

1. The fields are an optional sub-concern (many exercises may have `null`).
2. They form a cohesive sub-object. Grouping them in JSONB makes the schema intent clearer.
3. The admin panel exercise editor can surface a "Load Estimation" section that reads/writes this field as a structured form, consistent with how `program_generation_config` JSONB is edited.

The cross-family conversion table (`exercise_load_estimation_family_config`) is a separate entity because it describes relationships between families, not properties of individual exercises. It is a small lookup table (~30 rows maximum) and warrants its own home.

**What NOT to do:**

Do not encode conversion factors as hardcoded maps in the service layer. The pattern to avoid is:

```javascript
// BAD — fragile, not admin-editable, requires code change per new exercise
const CONVERSION_TABLE = {
  "barbell_back_squat_to_front_squat": 0.82,
  "barbell_bench_press_to_incline_db_press": 0.85,
  // ...
};
```

The `family_conversion_factor` on each exercise catalogue row is the correct approach. The factor is: "given a load for the canonical anchor of my family, multiply by this to get a starting estimate for me." This is a single lookup during estimation — no table of pairs, no string matching.

**Admin usability:**

The exercise catalogue admin panel (`/admin/exercises`) already supports arbitrary field editing via the edit drawer (architecture §10). The `load_estimation_metadata` JSONB can be surfaced as a collapsible "Load Estimation Config" section in that drawer with typed inputs for each sub-field. This requires no new admin UI work beyond adding the section to `api/admin/exercises.html` and its supporting API endpoint.

**Migration complexity:**

- One Flyway versioned migration: `ALTER TABLE exercise_catalogue ADD COLUMN load_estimation_metadata JSONB`
- One versioned migration: `CREATE TABLE exercise_load_estimation_family_config`
- One repeatable migration update: `R__seed_exercise_catalogue.sql` gains `UPDATE` statements setting `load_estimation_metadata` for each exercise. This is checksum-driven re-seeding — consistent with the existing pattern.

The initial seed needs to populate ~40–50 of the 83 exercises (those belonging to the 6 estimation families). Machine-specific or conditioning exercises can start with `null` or `not_estimatable: true`.

---

## 9. Interaction with Existing History / Logging

### Source precedence order

```
Priority 1 (highest): exact exercise history from segment_exercise_log
  → User has logged this exercise with weight in the current/recent program
  → Use most recent logged weight + reps. Guideline load is suppressed.

Priority 2: anchor same exercise (client_anchor_lift)
  → User provided load for this exact exercise during onboarding
  → Apply normalization for rep/RIR delta only

Priority 3: anchor same family (client_anchor_lift, different exercise)
  → Apply family_conversion_factor from catalogue metadata

Priority 4: anchor cross-family (last resort)
  → Apply family_conversion_factor + cross_family_factor from family config table

Priority 5 (fallback): null
  → No guideline load returned. Mobile shows blank weight field.
  → (Conservative default values per exercise were considered but removed
     as too likely to be wrong for intermediate users — blank is better than a bad estimate)
```

### When to suppress guideline loads

**Trigger: any logged set for this exercise in the last 90 days**

```sql
-- Note: segment_exercise_log has no exercise_id column; join through program_exercise.
SELECT 1
FROM segment_exercise_log sel
JOIN program_exercise pe ON pe.id = sel.program_exercise_id
JOIN program_day pd ON pd.id = pe.program_day_id
JOIN program p ON p.id = pd.program_id
WHERE p.user_id = :userId
  AND pe.exercise_id = :exerciseId
  AND sel.created_at >= now() - interval '90 days'
  AND sel.weight_kg IS NOT NULL
LIMIT 1
```

If this returns a row → return `guideline_load: null` for this exercise.

**The 90-day window is configurable.** If the user takes a long break (>90 days since last log), the system resumes showing anchor-based estimates. This is intentional — a 3-month gap is long enough that previous loads may be stale, so the onboarding anchor (with a staleness discount) is useful again.

### Updating anchor lifts after onboarding

The user may want to update their baseline lifts — for example, after a PR or returning from injury. This is a V2 concern. For V1:

- `PATCH /api/client-profiles/:id` with `anchorLifts[]` is the update mechanism.
- The mobile app should expose an "Update baseline lifts" option in profile/settings (outside of onboarding, for return visitors).
- When anchors are updated, set `client_anchor_lift.source = 'manual_update'` and reset `updated_at`.

### Stale anchor handling

Anchors older than 6 months (`anchor_lifts_collected_at < now() - interval '6 months'`) should receive a staleness discount in confidence scoring:

```
IF days_since_anchor > 180:
  confidence_score -= 15  // drops a "medium" to "low" in most cases
  append to reasoning: "Anchor data is over 6 months old — start extra conservative"
```

This does not block the estimate; it changes the confidence band and the `set_1_rule` message.

---

## 10. Edge Cases

| Edge case | Handling |
|---|---|
| **Beginner user (fitness_rank = 0)** | Baseline Loads screen is skipped entirely. No `client_anchor_lift` rows are created. `guideline_load` is always `null` for these users. |
| **User skips the entire step** | `anchor_lifts_skipped = true` on `client_profile`. No `client_anchor_lift` rows (or rows with `skipped = true`). `guideline_load` is `null` for all exercises. |
| **User knows only 1–2 anchors** | Partial data is valid. `guideline_load` is populated for exercises in families with anchors; `null` for families without. |
| **Bodyweight-only equipment** | Anchor exercise selector for each family is filtered to bodyweight-compatible exercises only. If no anchor exercises exist for a family with bodyweight equipment (e.g., no meaningful barbell squat anchor), the family card is hidden. Confidence for bodyweight anchors is automatically downgraded to "low" for any weighted target exercise. |
| **Machine-specific exercises** | If `load_estimation_metadata->>'not_estimatable' = 'true'` → `guideline_load: null`. Machine loads are too equipment-specific for reliable cross-gym conversion. The user must calibrate set 1. |
| **Unilateral lifts** | `is_unilateral = true` in catalogue metadata. The `unilateral_factor` (or family default) is applied. Output unit is `kg_per_hand` or `kg_per_side`. |
| **Bodyweight pull exercises (pull-ups)** | These are their own category. If the anchor exercise is bodyweight pull-up: `load_kg` is body weight minus assistance, or `null` if unloaded. `guideline_load` for target pull-up exercises returns bodyweight (unit: `bodyweight`) or assistance band level. If the user reports weighted pull-ups, a `load_kg` > 0 represents the added weight. Estimation logic uses `anchorLoad = (bodyweight + added_weight)`. Requires mobile UI to handle `unit: "bodyweight"` display differently. For V1, flag `not_estimatable: true` on bodyweight pull-up family exercises to avoid complexity. |
| **Exercises the user has never performed** | No history, no exact anchor → use same-family or cross-family anchor. Confidence: low–medium. The `set_1_rule` instructs calibration. |
| **Already-logged workouts** | `guideline_load: null` (logged history takes priority — see §9). |
| **No anchor data + no history** | `guideline_load: null`. Do not invent a conservative default — the risk of a bad estimate for an unknown intermediate-user is higher than the benefit. Blank is correct. |
| **Anchor lift for an archived exercise** | The `exercise_id` FK will still exist but `is_archived = true` in catalogue. The estimation service should still process the anchor (the exercise data including `family_conversion_factor` is still in the DB); only exercise selection is blocked by archival. |
| **Cross-family anchor with no config row** | `guideline_load: null`. Do not invent a cross-family conversion factor in code. |
| **Tempo not parseable** | `computeTempoFactor` returns 1.0 (no adjustment). |
| **User provides load in lbs** | Mobile client must convert to kg before sending `PATCH`. The `PATCH` handler validates that `loadKg` is numeric and > 0. Store in kg always. |
| **Rep range is a string** | `midpoint("8-12")` → 10. `midpoint("5")` → 5. `midpoint("AMRAP")` → use 10 as a fallback. |

---

## 11. Implementation Plan

### Phase 1 — Database migrations

> **Migration numbering note:** V36–V53 already exist in this repo. New migrations start at V54.

**File: `migrations/V54__add_client_anchor_lift.sql`**
- Create `client_anchor_lift` table with all columns defined in §4.
- Add index on `client_profile_id`.
- Unique constraint on `(client_profile_id, estimation_family)`.

**File: `migrations/V55__add_anchor_lifts_columns_to_client_profile.sql`**
- `ALTER TABLE client_profile ADD COLUMN anchor_lifts_skipped BOOLEAN NOT NULL DEFAULT false`
- `ALTER TABLE client_profile ADD COLUMN anchor_lifts_collected_at TIMESTAMPTZ`

**File: `migrations/V56__add_load_estimation_metadata_to_exercise_catalogue.sql`**
- `ALTER TABLE exercise_catalogue ADD COLUMN load_estimation_metadata JSONB`

**File: `migrations/V57__add_exercise_load_estimation_family_config.sql`**
- Create `exercise_load_estimation_family_config` table as defined in §4.

**File: `migrations/R__seed_load_estimation_family_config.sql`** (new repeatable)
- Seed ~12–20 rows (6 families × cross-family relationships that make practical sense).

**File: `migrations/R__seed_exercise_catalogue.sql`** (update existing)
- Add `UPDATE exercise_catalogue SET load_estimation_metadata = '...':jsonb WHERE exercise_id = '...'` for all anchor-eligible exercises.
- Prioritise the 6 canonical anchor families first. Aim for full coverage of all exercises in these families before adding estimation for accessory exercises.

---

### Phase 2 — Backend service

**New file: `api/src/services/anchorLiftService.js`**

```
upsertAnchorLifts(db, clientProfileId, anchorLifts[])
  → upserts into client_anchor_lift using ON CONFLICT DO UPDATE

getAnchorLifts(db, clientProfileId)
  → SELECT * FROM client_anchor_lift WHERE client_profile_id = $1 AND skipped = false
```

**New file: `api/src/services/guidelineLoadService.js`**

```
annotateExercisesWithGuidelineLoads(db, { exercises, clientProfileId, programType, weekNumber })
```

Contains the full estimation logic from §7. Depends on:
- `client_anchor_lift` table
- `exercise_catalogue.load_estimation_metadata`
- `exercise_load_estimation_family_config`
- `segment_exercise_log` (for history suppression)

No pipeline step files are modified.

---

### Phase 3 — Route changes

**`api/server.js`** (inline `PATCH /api/client-profiles/:id` handler):
- Add `anchorLifts` and `anchorLiftsSkipped` to the accepted fields list (parallel to existing `profilePatchKeys`).
- If `anchorLifts` is present in body, call `anchorLiftService.upsertAnchorLifts(db, profileId, anchorLifts)` in the same handler.
- Update `client_profile.anchor_lifts_skipped` and `anchor_lifts_collected_at` from the patch payload.

**`api/server.js`** (`GET /reference-data` handler):
- Add query for `anchorExercises` (SQL from §5) to the existing handler.
- Append `anchorExercises` to the JSON response.

**`api/src/routes/readProgram.js`** (`GET /api/day/:id/full` handler):
- After existing exercise assembly, call `guidelineLoadService.annotateExercisesWithGuidelineLoads(...)`.
- Pass `clientProfileId` (resolved from ownership check already in the handler), `programType` (from the program row), `weekNumber` (from the day row).
- Attach `guideline_load` to each exercise object in the response.
- Guard with try/catch: if `annotateExercisesWithGuidelineLoads` throws, log a warning but return the response without guideline loads rather than failing the route.

---

### Phase 4 — Mobile onboarding UI

This is in the separate mobile repo. The spec below defines what Codex should implement there.

**New screen: `OnboardingBaselineLoads`**

- Insert into the navigation stack between `OnboardingEquipment` (Step 2) and `OnboardingSchedule` (Step 3).
- In the onboarding navigator, check `fitnessRank >= 1` before rendering; route directly to Step 3 if rank is 0.
- On screen mount, call `GET /reference-data` (cached from Step 2 if available) to get `anchorExercises[]`.
- Derive available anchor families from the filtered `anchorExercises` by the user's `equipmentItemCodes`. Hide cards for families with no eligible exercises.
- On "Continue", build `anchorLifts[]` from card state. Call `PATCH /api/client-profiles/:id` with payload.
- Resume mechanism: `client_profile.onboarding_step_completed` should include a new step value (e.g., `"baseline_loads"`) so the onboarding entry screen routes correctly on re-open.

**Updated `onboardingStepCompleted` values:**
- `"goals"` → Step 1 done
- `"equipment"` → Step 2 done
- `"baseline_loads"` → Step 2b done (new)
- `"schedule"` → Step 3 done
- `"complete"` → all done

---

### Phase 5 — Day/session rendering changes (mobile)

In the `DayDetail` screen (mobile), the `Exercise Row` component currently shows `name`, `sets × reps`, `tempo`, `RIR`, `rest`.

Extend the `Exercise Row` to:
- Check for `guideline_load` in the exercise object from `GET /api/day/:id/full`.
- If `guideline_load` is not null AND the user has not yet logged any sets for this exercise today:
  - Show a "Suggested start: X kg" badge or inline hint below the exercise name.
  - Show the `confidence` band as a visual indicator (e.g., colour-coded pill: green = high, amber = medium, grey = low).
  - On tapping the hint, show a bottom sheet with `reasoning[]` and `set_1_rule`.
- Pre-fill the weight input in the Set Logger with `guideline_load.value`.
- Once the user logs their first set, suppress the `guideline_load` badge (read from local state, not requiring a re-fetch).

The `unit` field controls display formatting:
- `kg`: "80 kg"
- `kg_per_hand`: "26 kg / hand"
- `kg_per_side`: "40 kg / side"
- `bodyweight`: "Bodyweight" (no numeric value shown)

---

## 12. Testing Plan

### Unit tests — estimation service

**File: `api/src/services/__tests__/guidelineLoadService.test.js`**

Test cases:

| Test | Description |
|---|---|
| same-exercise anchor | Anchor is exact match → only normalizeAnchorLoad applies, conversion factor = 1.0 |
| same-family anchor, different exercise | family_conversion_factor correctly applied |
| cross-family anchor | cross_family_factor from family config applied; confidence = "low" |
| no anchor data | Returns null guideline_load for all exercises |
| unilateral exercise | unilateral_factor applied; unit is "kg_per_hand" |
| slow tempo (3-1-1) | computeTempoFactor applies eccentric discount |
| pause tempo (2-2-1) | pause discount applied |
| program type = conditioning | 0.88 factor applied |
| program type = strength | 1.00 factor (no adjustment) |
| barbell rounding | 42.3 → 42.5 → floor → 42.5 is wrong → floor(42.3/2.5)*2.5 = 40.0 (rounds DOWN correctly) |
| dumbbell rounding | 27.1 → floor(27.1/2)*2 = 26 |
| `not_estimatable = true` | Returns null |
| `estimation_family = null` | Returns null |
| logged history exists for exercise | Returns null (history supersedes) |
| logged history > 90 days old | Anchor-based estimate is returned (history window expired) |
| RIR estimate missing from anchor | Defaults to 2.0 internally |
| rep delta normalization | anchorReps=8, targetReps=12 → load * (1 - 0.02*4) = load * 0.92 |
| RIR delta normalization | anchorRir=0, targetRir=2 → load * (1 - 0.02*2) = load * 0.96 |
| confidence scoring — same exercise, recent, with RIR | score = 50+20+15 = 85 → "high" |
| confidence scoring — cross-family, old, no RIR | score = 10+0+5 = 15 → "low" |

---

### Route tests — `GET /api/day/:id/full`

**File: `api/test/readProgram.route.test.js`** (extend existing)

| Test | Description |
|---|---|
| Day with anchor data → exercises have `guideline_load` | Happy path for intermediate user |
| Day with no anchor data → `guideline_load: null` on all exercises | No anchors = no guideline |
| Day with logged history for exercise → `guideline_load: null` for that exercise | History suppression |
| Day owned by different user → 403 | Ownership check unchanged |
| `guidelineLoadService` throws → route still returns 200 with exercises | Graceful failure |
| Beginner user with no anchor table rows → `guideline_load: null` | Rank-0 bypass |

---

### Route tests — `PATCH /api/client-profiles/:id`

**File: `api/test/clientProfile.route.test.js`** (new or extend)

| Test | Description |
|---|---|
| Valid `anchorLifts[]` payload → upserted rows in `client_anchor_lift` | Happy path |
| `anchorLiftsSkipped: true` → `client_profile.anchor_lifts_skipped = true`, no anchor rows | Skip path |
| `anchorLifts[]` with mixed skipped/non-skipped families | Partial save; skipped rows have `skipped = true` |
| Invalid `loadKg` (negative) → 400 | Validation |
| Invalid `reps` (0) → 400 | Validation |
| `exerciseId` not in `exercise_catalogue` → 400 | FK constraint / service validation |
| Second PATCH with same family → upserts (ON CONFLICT DO UPDATE) | Idempotent re-save |
| Missing `anchorLifts` key entirely → profile fields update without touching anchor table | Backward-compatible PATCH |

---

### Route tests — `GET /reference-data`

**File: `api/test/referenceData.route.test.js`** (new or extend)

| Test | Description |
|---|---|
| Response includes `anchorExercises[]` | New field present |
| All anchor exercises have `is_anchor_eligible = true` in metadata | Correct filter |
| Response still includes `equipmentItems` | Backward compatibility |

---

### Unit tests — `anchorLiftService`

**File: `api/src/services/__tests__/anchorLiftService.test.js`**

| Test | Description |
|---|---|
| Upsert creates new rows | New anchor data |
| Upsert updates existing rows (ON CONFLICT) | Re-onboarding scenario |
| `getAnchorLifts` filters out skipped rows | Skipped = false predicate |

---

### Regression tests

| Test | Description |
|---|---|
| Generate program for user with no anchor data → program generates normally | No regression in pipeline |
| `GET /api/day/:id/full` for user with no `client_anchor_lift` rows → succeeds with `guideline_load: null` | Missing table rows do not break route |
| Existing test suite (all 299 tests) passes without modification | No regressions |

---

## Summary of files likely to change

| File | Change |
|---|---|
| `migrations/V36__*.sql` – `V39__*.sql` | New (4 versioned migrations) |
| `migrations/R__seed_load_estimation_family_config.sql` | New repeatable seed |
| `migrations/R__seed_exercise_catalogue.sql` | UPDATE statements for `load_estimation_metadata` |
| `api/src/services/anchorLiftService.js` | New |
| `api/src/services/guidelineLoadService.js` | New |
| `api/server.js` | Add `anchorLifts`/`anchorLiftsSkipped` to PATCH handler; extend `GET /reference-data` |
| `api/src/routes/readProgram.js` | Inject `guideline_load` via `guidelineLoadService` |
| `api/admin/exercises.html` | Add "Load Estimation Config" section to edit drawer (post-MVP) |
| Mobile: `OnboardingBaselineLoads.tsx` (new) | New screen |
| Mobile: Onboarding navigator | Insert new screen; add step-completed value |
| Mobile: `DayDetail` / `ExerciseRow` component | Render `guideline_load` badge + pre-fill |
| Mobile: `segment-log` API calls | No change |

Pipeline files (`runPipeline.js`, Steps 01–06, `buildInputsFromDevProfile.js`) are **not touched**.
