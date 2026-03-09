# Pipeline Multi-Type Implementation Spec

> Precise implementation spec for Codex.
> Based on full code audit of `01_buildBasicHypertrophyProgram.js`, `02_segmentHypertrophy.js`, `03_applyProgression.js`, `04_applyRepRules.js`, `runPipeline.js`, and supporting services.
>
> Claude writes this spec. Codex implements it.

---

## A. Code Audit Findings — Exact Hypertrophy Assumptions

### A.1 `runPipeline.js`

**Line 112–114** — Hard guard rejecting all non-hypertrophy types:
```js
if (programType !== "hypertrophy") {
  throw new Error(`Unsupported programType: ${programType}`);
}
```
Remove entirely.

**Line 258** — `programType` variable is in scope but "hypertrophy" is hardcoded:
```js
await applyProgression({ ..., programType: "hypertrophy", ... })
```
Change to `programType`.

**Lines 156–161** — Step 2 is called as `segmentHypertrophyProgram`. Replace with generic call.

---

### A.2 `01_buildBasicHypertrophyProgram.js`

**A — Day template definitions (line 516–520):**
```js
const templates = {
  day1: ["A:squat", "B:lunge", "C:quad", "C:calves", "D:core", "C:hinge_accessory"],
  day2: ["A:push_horizontal", "B:pull_horizontal", "B:secondary_press", "C:arms", "C:rear_delt", "C:arms2"],
  day3: ["A:hinge", "B:secondary_lower", "C:hamstring_iso", "C:glute", "D:core", "C:calves"],
};
```
These are the complete slot lists. All three must be expressed exactly in config.

**B — Slot-to-selector mappings (`slotToSelector`, line 228–281):**

| slot key | mp | sw | sw2 | swAny | requirePref | preferLoadable |
|---|---|---|---|---|---|---|
| `squat` | — | — | `squat_compound` | — | `strength_main` | — |
| `hinge` | — | — | `hinge_compound` | — | `strength_main` | — |
| `lunge` | `lunge` | `quad_iso_unilateral` | — | — | — | — |
| `quad` | — | — | — | `[quad_iso_unilateral, quad_iso_squat]`* | `hypertrophy_secondary` | — |
| `hamstring_iso` | — | `hamstring_iso` | — | — | `hypertrophy_secondary` | — |
| `glute` | — | `glute_iso` | — | — | `hypertrophy_secondary` | — |
| `calves` | — | `calf_iso` | — | — | `hypertrophy_secondary` | `true` |
| `core` | `anti_extension` | `core` | — | — | — | — |
| `push_horizontal` | — | — | `push_horizontal_compound` | — | `strength_main` | — |
| `pull_horizontal` | — | — | `pull_horizontal_compound` | — | `hypertrophy_secondary` | — |
| `push_vertical` | `push_vertical` | `push_vertical` | — | — | `strength_main` | — |
| `pull_vertical` | `pull_vertical` | `pull_vertical` | — | — | `hypertrophy_secondary` | — |
| `secondary_press` | — | `push_horizontal_db` | `push_horizontal_compound` | — | `hypertrophy_secondary` | — |
| `rear_delt` | — | `shoulder_iso` | — | — | `hypertrophy_secondary` | — |
| `arms` | — | `arms` | — | — | `hypertrophy_secondary` | — |
| `arms2` | — | `arms` | — | — | `hypertrophy_secondary` | — |
| `secondary_lower` | — | — | `squat_compound` | — | `hypertrophy_secondary` | — |
| `hinge_accessory` | — | `hamstring_iso` | `hinge_compound` | — | `hypertrophy_secondary` | — |

\* The `quad` slot's `swAny` is dynamically derived from the B:lunge pick at runtime. In the static config it is expressed as the full list `["quad_iso_unilateral", "quad_iso_squat"]`. The existing `usedSw2Today` + region deduplication in `pickWithFallback` handles variety organically. This is an acceptable approximation and removes the inter-slot runtime dependency.

**C — Auto-applied C/D `requirePref` (line 562):**
```js
if ((sel.block === "C" || sel.block === "D") && !sel.requirePref) sel.requirePref = "hypertrophy_secondary";
```
This auto-assigns `hypertrophy_secondary` to any C/D slot that has no explicit `requirePref`. Express in config as `slot_defaults`:
```json
"slot_defaults": {
  "C": { "requirePref": "hypertrophy_secondary" },
  "D": { "requirePref": "hypertrophy_secondary" }
}
```

**D — `fillTargetForKey` (line 283–294):**
```js
const map = {
  quad: "A:squat",
  calves: "B:lunge",
  hamstring_iso: "A:hinge",
  core: "B:lunge",
  rear_delt: "B:pull_horizontal",
  arms: "B:secondary_press",
  arms2: "C:arms",
};
```
Express as `fill_fallback_slot` in each slot definition in config (see §C).

**E — `setsByDuration` (line 198–205):**
```js
{ 40: { A:3, B:3, C:2, D:2 }, 50: { A:4, B:3, C:3, D:2 }, 60: { A:5, B:4, C:3, D:3 } }
```

**F — `blockBudget` (line 207–210):**
```js
{ 40: 4, 50: 5, 60: 6 }
```

**G — Hardcoded output tags (line 634, 645):**
```js
day_type: "hypertrophy"
schema: "program_hypertrophy_v1"
```
Replace with `day_type: compiledConfig.programType` and `schema: \`program_${compiledConfig.programType}_v1\``.

**H — `isConditioning` exclusion heuristic (line 86–100):**
```js
function isConditioning(ex) {
  if (mp === "conditioning" || mp === "cardio" || mp === "locomotion") return true;
  if (sw.includes("engine") || sw2.includes("engine")) return true;
  if (name.includes("bike") || name.includes("row") ...) return true;
}
```
Currently used to exclude conditioning exercises from hypertrophy slots. In the generic builder, `requirePref` filtering is the correct mechanism. `isConditioning` should be superseded by explicit `requirePref` values and not ported to the new builder. The fallback `pickSeedExerciseForSlot` still uses it — this is acceptable as a safety net, expressed as a configurable `exclude_movement_classes` array defaulting to `["cardio", "conditioning", "locomotion"]`.

---

### A.3 `02_segmentHypertrophy.js`

**Block semantics (line 128–248 in `segmentDayFromBlocks`):**

| Block | Behavior (hardcoded) |
|---|---|
| A | always `single`, purpose `main`, takes first A item only |
| B (count 1) | `single`, purpose `secondary` |
| B (count 2+) | `superset`, purpose `secondary`; extras become `single, accessory` |
| C (count 1) | `single`, purpose `accessory` |
| C (count 2+) | `giant_set`, purpose `accessory`, max 3; extras become `single, accessory` |
| D | always `single`, purpose `accessory`, all items individually |

Express as `block_semantics` in config (see §C). The "fall back to single if count < 2" behavior stays as generic code logic.

**Hardcoded schema/day_type strings (line 270, 291):**
```js
schema: "program_hypertrophy_v1_segmented"
day_type: toStr(day.day_type) || "hypertrophy"
```
Replace with `schema: \`program_${programType}_v1_segmented\`` and `day_type: day.day_type || programType`.

---

### A.4 `03_applyProgression.js`

**Line 44:** `programType = s(programType) || "hypertrophy"` — this fallback to `"hypertrophy"` is a safe default for missing data. No change required. The real fix is passing the correct `programType` from `runPipeline.js`.

No other structural changes required in Step 03.

---

### A.5 `04_applyRepRules.js`

**Line 292:** `s(out.program_type || out.programType || "hypertrophy")` — fallback to `"hypertrophy"` if neither field is set. Once Step 01 sets `program.program_type` correctly, this fallback is never reached. No code change needed in Step 04.

---

## B. Final Target Design

### B.1 Boundary: config vs code

**Config declares:**
- Ordered slot lists per day (day templates)
- Per-slot selector hints: `mp`, `sw`, `sw2`, `swAny`, `requirePref`, `preferLoadable`
- Per-slot selector strategy name (default: `"best_match_by_movement"`)
- Per-slot fill fallback target
- Block-letter default overrides (`slot_defaults`)
- Set allocation by duration (`sets_by_duration`)
- Block budget by duration (`block_budget`)
- Block letter → segment semantics (`block_semantics`)
- Progression parameters (`progression_by_rank_json`, `week_phase_config_json`, `apply_to_purposes`)

**Code handles:**
- Exercise pool construction from `inputs`
- Calling the named selector strategy
- `pickBest` scoring logic (sw2=+12, sw=+10, mp=+4, den=+0.2, cx=+0.05)
- Region accumulation and penalty
- `sw2` deduplication within a day
- Used-this-week exclusion
- `requirePref` filtering in `pickBest`
- Multi-pass fallback chain (relaxing `requirePref`, allowing duplicates)
- Seed fallback for days with no real exercise
- Fill/add_sets creation when no exercise found
- Compile-time config validation before Step 01 runs
- B/C grouping into superset/giant_set when count ≥ 2 (stays in Step 02 code)

### B.2 Invariant output contract

The output of new Step 01 (`buildProgramFromDefinition`) must match the shape consumed by Steps 02–06:

```js
{
  program: {
    program_type: string,        // NEW: was missing; Steps 04+ already read this
    schema: string,              // e.g. "program_hypertrophy_v1"
    duration_mins: number,
    days_per_week: number,
    days: [
      {
        day_index: number,       // 1-based
        day_type: string,        // == program_type
        duration_mins: number,
        blocks: [
          {
            block: string,       // "A" | "B" | "C" | "D"
            slot: string,        // "A:squat"
            ex_id: string,       // exercise_id
            ex_name: string,
            sets: number,
          },
          // OR fill block:
          {
            block: string,
            slot: string,
            fill: "add_sets",
            target_slot: string,
            add_sets: number,
          }
        ]
      }
    ]
  },
  debug: object
}
```

`ex_sw` and `ex_sw2` are present on blocks during Step 01 construction but stripped before the day is pushed to `days[]` (as the current code does at line 625–630). Preserve this.

---

## C. Final Config Schema

### C.1 `program_generation_config_json` extended shape

The `program_generation_config_json` JSONB column is extended with three new top-level keys: `builder`, `segmentation`, `progression`. Existing keys are preserved unchanged.

```json
{
  "config_key": "hypertrophy_default_v1",
  "program_type": "hypertrophy",
  "schema_version": 1,
  "is_active": true,
  "total_weeks_default": 4,
  "progression_by_rank_json": { ... },
  "week_phase_config_json": { ... },

  "builder": {
    "day_templates": [ ... ],
    "sets_by_duration": { ... },
    "block_budget": { ... },
    "slot_defaults": { ... },
    "exclude_movement_classes": ["cardio", "conditioning", "locomotion"]
  },

  "segmentation": {
    "block_semantics": { ... }
  },

  "progression": {
    "apply_to_purposes": ["main", "secondary", "accessory"]
  }
}
```

---

### C.2 `builder.day_templates` — full hypertrophy definition

Each template has a `day_key` (matched by index position 1..N for `days_per_week`), a `focus` label (for narration/metadata), and an `ordered_slots` array.

Each slot:
- `slot` — string in format `"BLOCK:key"`, e.g. `"A:squat"`. Block letter must exist in `block_semantics`.
- `selector_strategy` — string, defaults to `"best_match_by_movement"` if absent.
- `mp` — movement_pattern_primary hint. Optional.
- `sw` — swap_group_id_1 hint. Optional.
- `sw2` — swap_group_id_2 hint. Optional.
- `swAny` — array of sw values tried in order. Optional. If present, overrides `sw`.
- `requirePref` — value that must appear in exercise's `pref` array. Optional. Null means no pref filter.
- `preferLoadable` — boolean. Optional, defaults false.
- `fill_fallback_slot` — which slot to add sets to if no exercise is found. Optional, defaults to first real block in day.

```json
"day_templates": [
  {
    "day_key": "day1",
    "focus": "lower",
    "ordered_slots": [
      { "slot": "A:squat",         "sw2": "squat_compound",           "requirePref": "strength_main" },
      { "slot": "B:lunge",         "mp": "lunge", "sw": "quad_iso_unilateral" },
      { "slot": "C:quad",          "swAny": ["quad_iso_unilateral", "quad_iso_squat"], "requirePref": "hypertrophy_secondary", "fill_fallback_slot": "A:squat" },
      { "slot": "C:calves",        "sw": "calf_iso", "requirePref": "hypertrophy_secondary", "preferLoadable": true, "fill_fallback_slot": "B:lunge" },
      { "slot": "D:core",          "mp": "anti_extension", "sw": "core", "fill_fallback_slot": "B:lunge" },
      { "slot": "C:hinge_accessory", "sw": "hamstring_iso", "sw2": "hinge_compound", "requirePref": "hypertrophy_secondary", "fill_fallback_slot": "A:squat" }
    ]
  },
  {
    "day_key": "day2",
    "focus": "upper",
    "ordered_slots": [
      { "slot": "A:push_horizontal",  "sw2": "push_horizontal_compound", "requirePref": "strength_main" },
      { "slot": "B:pull_horizontal",  "sw2": "pull_horizontal_compound", "requirePref": "hypertrophy_secondary" },
      { "slot": "B:secondary_press",  "sw": "push_horizontal_db", "sw2": "push_horizontal_compound", "requirePref": "hypertrophy_secondary", "fill_fallback_slot": "B:pull_horizontal" },
      { "slot": "C:arms",             "sw": "arms", "requirePref": "hypertrophy_secondary", "fill_fallback_slot": "B:secondary_press" },
      { "slot": "C:rear_delt",        "sw": "shoulder_iso", "requirePref": "hypertrophy_secondary", "fill_fallback_slot": "B:pull_horizontal" },
      { "slot": "C:arms2",            "sw": "arms", "requirePref": "hypertrophy_secondary", "fill_fallback_slot": "C:arms" }
    ]
  },
  {
    "day_key": "day3",
    "focus": "posterior",
    "ordered_slots": [
      { "slot": "A:hinge",          "sw2": "hinge_compound",    "requirePref": "strength_main" },
      { "slot": "B:secondary_lower","sw2": "squat_compound",    "requirePref": "hypertrophy_secondary" },
      { "slot": "C:hamstring_iso",  "sw": "hamstring_iso",      "requirePref": "hypertrophy_secondary", "fill_fallback_slot": "A:hinge" },
      { "slot": "C:glute",          "sw": "glute_iso",          "requirePref": "hypertrophy_secondary", "fill_fallback_slot": "A:hinge" },
      { "slot": "D:core",           "mp": "anti_extension", "sw": "core", "fill_fallback_slot": "B:secondary_lower" },
      { "slot": "C:calves",         "sw": "calf_iso",           "requirePref": "hypertrophy_secondary", "preferLoadable": true, "fill_fallback_slot": "B:secondary_lower" }
    ]
  }
]
```

---

### C.3 `builder.sets_by_duration`, `block_budget`, `slot_defaults`

```json
"sets_by_duration": {
  "40": { "A": 3, "B": 3, "C": 2, "D": 2 },
  "50": { "A": 4, "B": 3, "C": 3, "D": 2 },
  "60": { "A": 5, "B": 4, "C": 3, "D": 3 }
},

"block_budget": {
  "40": 4,
  "50": 5,
  "60": 6
},

"slot_defaults": {
  "C": { "requirePref": "hypertrophy_secondary" },
  "D": { "requirePref": "hypertrophy_secondary" }
},

"exclude_movement_classes": ["cardio", "conditioning", "locomotion"]
```

Note: duration keys are strings in JSON. The resolver must coerce the incoming `duration_mins` integer to the nearest key (40/50/60) using the same `clampInt(v, 40, 60, 50)` logic as today.

---

### C.4 `segmentation.block_semantics`

```json
"block_semantics": {
  "A": { "preferred_segment_type": "single",    "purpose": "main"      },
  "B": { "preferred_segment_type": "superset",  "purpose": "secondary" },
  "C": { "preferred_segment_type": "giant_set", "purpose": "accessory" },
  "D": { "preferred_segment_type": "single",    "purpose": "accessory" }
}
```

`preferred_segment_type` is the target type when count ≥ threshold. Code determines actual type:
- `"single"` → always single regardless of count
- `"superset"` → superset if count ≥ 2; single if count === 1
- `"giant_set"` → giant_set if count ≥ 2 (max 3); single if count === 1

The max-items-per-group rule (B takes 2, C takes ≤3) stays hardcoded in Step 02 code unless future types require different limits. Do not expose it in config yet.

---

### C.5 Selector strategy references

`selector_strategy` is a string that references a named function in `selectorStrategies.js`. Config may name any registered strategy; unrecognised names fail validation.

Strategies for Phase 1:

| Name | Description |
|---|---|
| `"best_match_by_movement"` | Current `pickWithFallback` algorithm. Default. Works for hypertrophy and strength. |
| `"fixed_exercise"` | Future. Requires `exercise_id` field. Always returns that exercise. For Hyrox stations. |

Do not implement `"fixed_exercise"` in Phase 1. The validation check must reject it as "strategy registered but not yet available" or "unknown strategy".

---

### C.6 `progression` section

```json
"progression": {
  "apply_to_purposes": ["main", "secondary", "accessory"]
}
```

Step 03 already reads `apply_to_purposes` from the PGC row's `program_generation_config_json`. This key just ensures it's explicit in the config. No change to Step 03 code is needed beyond fixing the hardcoded `programType` passed from `runPipeline`.

---

## D. Validation Rules

`configValidation.js` exports `validateCompiledConfig(config)`. It throws a `ConfigValidationError` (custom error class with `code: "config_validation_error"` and `details: string[]`) before Step 01 runs.

### D.1 Top-level

- `config.programType` must be a non-empty string.
- `config.schemaVersion` must be a positive integer.
- `config.builder` must be an object (not null).
- `config.segmentation` must be an object (not null).

### D.2 `builder` section

- `builder.dayTemplates` must be a non-empty array.
- Each template must have `day_key` (non-empty string) and `ordered_slots` (non-empty array).
- `day_key` values must be unique within `dayTemplates`.
- Each slot must have `slot` (non-empty string).
- Each slot `slot` must match `/^[A-Z]:.+$/` (block letter colon key).
- Each slot's block letter (character before `:`) must exist as a key in `segmentation.blockSemantics`.
- Each slot's `selector_strategy`, if present, must be a key in the registered strategies map.
- `builder.setsByDuration` must be an object with at least one key; values must be objects with at least one letter key mapping to a positive integer.
- `builder.blockBudget` must be an object with at least one key; values must be positive integers.

### D.3 `segmentation` section

- `segmentation.blockSemantics` must be an object with at least one key.
- Each block semantics entry must have `preferred_segment_type` (one of: `"single"`, `"superset"`, `"giant_set"`) and `purpose` (non-empty string).

### D.4 Fail-fast rule

If validation fails, `runPipeline` must throw before calling Step 01. The error must include all validation failures in `details[]`, not just the first one.

---

## E. Refactor Plan — Ordered File-by-File

### E.0 Phase 0 — plumbing (no behaviour change)

These changes are safe to land independently. Hypertrophy generation uses new plumbing but existing step files.

**E.0.1 Create `api/engine/resolveCompiledConfig.js`**
- Implement `resolveCompiledConfig(dbClient, { programType, schemaVersion, request })`
- Reuse existing `fetchProgramGenerationConfigs` / `fetchProgramGenerationConfigByKey` (no new DB queries)
- Parse `program_generation_config_json` JSONB blob
- Construct `compiledConfig` object (see §F.1)
- If `builder` / `segmentation` keys are absent from the DB row's JSON, set them to `null` — do not throw here; validation handles it
- Deduplicate with existing PGC fetch in `runPipeline` (see E.0.4)

**E.0.2 Create `api/engine/configValidation.js`**
- Implement `validateCompiledConfig(config)` per §D
- Implement `ConfigValidationError extends Error`

**E.0.3 Create `api/engine/selectorStrategies.js`**
- Implement `STRATEGY_REGISTRY` map
- Implement `bestMatchByMovement(slotDef, catalogIndex, allowedSet, builderState)` — wraps the existing `pickWithFallback` logic (imported from shared utils or inlined)
- Implement `resolveStrategy(name)` — returns function or throws

**E.0.4 Modify `api/engine/runPipeline.js`**
- Remove lines 112–114 (hypertrophy guard)
- Import `resolveCompiledConfig`, `validateCompiledConfig`
- After `dbClient` is set, call `resolveCompiledConfig` and `validateCompiledConfig`
- Deduplicate PGC fetch: pass `compiledConfig._pgcRow` into the Step 3 `programGenerationConfigs` array instead of fetching again
- Fix line 258: `programType: "hypertrophy"` → `programType`
- Keep calling `buildBasicHypertrophyProgramStep` and `segmentHypertrophyProgram` for now (unchanged for Phase 0)
- Pass `compiledConfig` through — it is available but not yet used by steps

**E.0.5 Verify**
- Hypertrophy generation produces identical output to pre-refactor
- Pipeline runs without errors when `builder` / `segmentation` are absent from DB row (because old steps are still used)

---

### E.1 Phase 1a — re-express hypertrophy in config (seed + new steps)

**E.1.1 Update `migrations/R__seed_program_generation_config.sql`**
- Extend the `program_generation_config_json` JSONB construction for `hypertrophy_default_v1` to include `builder`, `segmentation`, and `progression` keys
- Use the exact values from §C.2–C.5
- Flyway repeatable migration: checksum changes → re-runs on next `flyway migrate`

**E.1.2 Create `api/engine/steps/01_buildProgramFromDefinition.js`**
- See §F.4 for full interface and pseudocode
- Reads `compiledConfig.builder.*` exclusively — no hardcoded day templates
- Uses `selectorStrategies.js` for slot filling
- Produces identical output contract to existing Step 01

**E.1.3 Create `api/engine/steps/02_segmentProgram.js`**
- See §F.5 for full interface and pseudocode
- Reads `compiledConfig.segmentation.blockSemantics`
- Applies same grouping logic as current Step 02 (single/superset/giant_set based on count and `preferred_segment_type`)

**E.1.4 Modify `api/engine/runPipeline.js` (second pass)**
- Replace `buildBasicHypertrophyProgramStep` import with `buildProgramFromDefinition`
- Replace `segmentHypertrophyProgram` import with `segmentProgram`
- Pass `compiledConfig` to both new steps
- Now validation in Phase 0 is active and meaningful

**E.1.5 Verify hypertrophy parity**
- Run `POST /api/program/generate` with hypertrophy
- Compare `counts` (weeks, days, segments, exercises) to pre-refactor baseline
- Day structure must contain the same block letters in the same positions
- See §G for test plan

---

### E.2 Phase 2 — add strength

**E.2.1 Add to `migrations/R__seed_program_generation_config.sql`**
- New row: `config_key = "strength_default_v1"`, `program_type = "strength"`
- Full `builder` + `segmentation` config (different day templates, all-`single` block semantics)
- Strength `block_semantics`: all letters map to `"single"` segment type

**E.2.2 Add to `migrations/R__seed_rep_rules.sql`**
- Strength rep rules with `program_type = 'strength'`
- Lower rep ranges (3–5, 4–6), higher RIR targets, longer rest

**E.2.3 Add to `migrations/R__seed_narration_templates.sql`**
- Strength narration templates with `program_type = 'strength'`

**E.2.4 Verify strength end-to-end**
- `POST /api/program/generate` with `programType: "strength"` must not throw
- Output structure is valid (correct counts, all segments present)

---

## F. Pseudocode / Interface Definitions

### F.1 `resolveCompiledConfig.js`

```js
// api/engine/resolveCompiledConfig.js

import {
  fetchProgramGenerationConfigByKey,
  fetchProgramGenerationConfigs,
} from "../src/services/programGenerationConfig.js";

/**
 * @typedef {Object} CompiledConfig
 * @property {string} programType
 * @property {number} schemaVersion
 * @property {string} configKey
 * @property {"db"|"request"|"hardcoded"} source
 * @property {{ dayTemplates, setsByDuration, blockBudget, slotDefaults, excludeMovementClasses }} builder
 * @property {{ blockSemantics }} segmentation
 * @property {{ progressionByRank, weekPhaseConfig, totalWeeksDefault, applyToPurposes }} progression
 * @property {{ programGenerationConfigRow, programGenerationConfigJson }} raw
 */

export async function resolveCompiledConfig(dbClient, { programType, schemaVersion = 1, request }) {
  programType = String(programType || "").trim();
  schemaVersion = Number.isFinite(Number(schemaVersion)) ? Number(schemaVersion) : 1;

  let pgcRow = null;
  let source = "hardcoded";

  // Priority 1: explicit config_key in request
  if (request?.config_key) {
    pgcRow = await fetchProgramGenerationConfigByKey(dbClient, request.config_key);
    if (!pgcRow) throw new Error(`No active ProgramGenerationConfig found for config_key=${request.config_key}`);
    source = "db";
  }
  // Priority 2: request override JSON (pass-through; no DB fetch)
  else if (request?.program_generation_config_json) {
    // parse and wrap as synthetic pgcRow — matches existing runPipeline behaviour
    const parsed = safeJsonParse(request.program_generation_config_json);
    pgcRow = buildSyntheticPgcRow(parsed, programType, schemaVersion);
    source = "request";
  }
  // Priority 3: DB fetch by programType + schemaVersion
  else {
    const rows = await fetchProgramGenerationConfigs(dbClient, programType, schemaVersion);
    if (rows && rows.length > 0) {
      pgcRow = pickPreferredRow(rows, schemaVersion);
      source = "db";
    }
  }

  const pgcJson = safeJsonParse(pgcRow?.program_generation_config_json, {});

  return {
    programType,
    schemaVersion,
    configKey: pgcRow?.config_key ?? `hardcoded_${programType}_v${schemaVersion}`,
    source,

    builder: {
      dayTemplates:             pgcJson?.builder?.day_templates               ?? null,
      setsByDuration:           pgcJson?.builder?.sets_by_duration            ?? null,
      blockBudget:              pgcJson?.builder?.block_budget                ?? null,
      slotDefaults:             pgcJson?.builder?.slot_defaults               ?? {},
      excludeMovementClasses:   pgcJson?.builder?.exclude_movement_classes    ?? ["cardio", "conditioning", "locomotion"],
    },

    segmentation: {
      blockSemantics: pgcJson?.segmentation?.block_semantics ?? null,
    },

    progression: {
      progressionByRank:    pgcRow?.progression_by_rank_json   ?? {},
      weekPhaseConfig:      pgcRow?.week_phase_config_json     ?? {},
      totalWeeksDefault:    pgcRow?.total_weeks_default        ?? 4,
      applyToPurposes:      pgcJson?.progression?.apply_to_purposes ?? ["main", "secondary", "accessory"],
    },

    raw: {
      programGenerationConfigRow:  pgcRow,
      programGenerationConfigJson: pgcJson,
    },
  };
}
```

---

### F.2 `configValidation.js`

```js
// api/engine/configValidation.js

export class ConfigValidationError extends Error {
  constructor(details) {
    super(`Config validation failed: ${details.join("; ")}`);
    this.code = "config_validation_error";
    this.details = details;
  }
}

const KNOWN_SEGMENT_TYPES = new Set(["single", "superset", "giant_set"]);
const KNOWN_STRATEGIES    = new Set(["best_match_by_movement"]);  // extend as strategies are added

/**
 * Throws ConfigValidationError with all failures if config is invalid.
 * @param {CompiledConfig} config
 */
export function validateCompiledConfig(config) {
  const errors = [];

  if (!config.programType)                errors.push("programType is required");
  if (!Number.isFinite(config.schemaVersion)) errors.push("schemaVersion must be a finite integer");

  // builder
  const b = config.builder;
  if (!b || typeof b !== "object")        errors.push("builder is required");
  else {
    if (!Array.isArray(b.dayTemplates) || b.dayTemplates.length === 0)
      errors.push("builder.dayTemplates must be a non-empty array");
    else {
      const seenKeys = new Set();
      b.dayTemplates.forEach((tmpl, ti) => {
        if (!tmpl.day_key)                errors.push(`builder.dayTemplates[${ti}].day_key is required`);
        else if (seenKeys.has(tmpl.day_key)) errors.push(`builder.dayTemplates[${ti}].day_key "${tmpl.day_key}" is duplicate`);
        else seenKeys.add(tmpl.day_key);

        if (!Array.isArray(tmpl.ordered_slots) || tmpl.ordered_slots.length === 0)
          errors.push(`builder.dayTemplates[${ti}] must have non-empty ordered_slots`);
        else {
          tmpl.ordered_slots.forEach((slot, si) => {
            if (!slot.slot)               errors.push(`dayTemplates[${ti}].ordered_slots[${si}] missing slot`);
            else if (!/^[A-Z]:.+/.test(slot.slot))
              errors.push(`dayTemplates[${ti}].ordered_slots[${si}].slot "${slot.slot}" must be "LETTER:key" format`);
            else {
              const letter = slot.slot[0];
              const sem = config.segmentation?.blockSemantics;
              if (sem && !sem[letter])    errors.push(`Slot "${slot.slot}" uses block letter "${letter}" not in block_semantics`);
            }
            if (slot.selector_strategy && !KNOWN_STRATEGIES.has(slot.selector_strategy))
              errors.push(`Unknown selector_strategy "${slot.selector_strategy}" in slot "${slot.slot}"`);
          });
        }
      });
    }

    if (!b.setsByDuration || typeof b.setsByDuration !== "object" || Object.keys(b.setsByDuration).length === 0)
      errors.push("builder.setsByDuration must be a non-empty object");
    if (!b.blockBudget || typeof b.blockBudget !== "object" || Object.keys(b.blockBudget).length === 0)
      errors.push("builder.blockBudget must be a non-empty object");
  }

  // segmentation
  const seg = config.segmentation;
  if (!seg || typeof seg !== "object")    errors.push("segmentation is required");
  else {
    if (!seg.blockSemantics || typeof seg.blockSemantics !== "object" || Object.keys(seg.blockSemantics).length === 0)
      errors.push("segmentation.blockSemantics must be a non-empty object");
    else {
      Object.entries(seg.blockSemantics).forEach(([letter, sem]) => {
        if (!KNOWN_SEGMENT_TYPES.has(sem.preferred_segment_type))
          errors.push(`blockSemantics["${letter}"].preferred_segment_type must be one of: ${[...KNOWN_SEGMENT_TYPES].join(", ")}`);
        if (!sem.purpose)
          errors.push(`blockSemantics["${letter}"].purpose is required`);
      });
    }
  }

  if (errors.length > 0) throw new ConfigValidationError(errors);
}
```

---

### F.3 `selectorStrategies.js`

```js
// api/engine/selectorStrategies.js
//
// Strategy registry. Config names a strategy by string key.
// Implementations live here — not in config.

/**
 * @typedef {Object} SlotDef
 * @property {string} slot
 * @property {string} [selector_strategy]
 * @property {string|null} [mp]
 * @property {string|null} [sw]
 * @property {string[]|null} [swAny]
 * @property {string|null} [sw2]
 * @property {string|null} [requirePref]
 * @property {boolean} [preferLoadable]
 * @property {string|null} [fill_fallback_slot]
 */

/**
 * @typedef {Object} BuilderState
 * @property {Set<string>} usedIdsWeek     — exercise IDs used anywhere in this week
 * @property {Set<string>} usedSw2Today    — sw2 values used in current day
 * @property {Set<string>} usedRegionsToday — target_regions used in current day
 * @property {Object[]} blocksSoFar        — blocks filled so far this day
 */

/**
 * Main strategy: best-match-by-movement.
 * Runs the pickWithFallback algorithm from the current Step 01.
 * @param {SlotDef} slotDef
 * @param {Object} catalogIndex  — { byId: Map<id, ex>, allowedSet: Set<id> }
 * @param {BuilderState} state
 * @returns {{ ex: Object, statKey: string }|null}
 */
function bestMatchByMovement(slotDef, catalogIndex, state) {
  const sel = {
    mp:             slotDef.mp   || null,
    sw:             slotDef.sw   || null,
    swAny:          slotDef.swAny || null,
    sw2:            slotDef.sw2  || null,
    requirePref:    slotDef.requirePref || null,
    preferLoadable: !!slotDef.preferLoadable,
    preferIsolation: slotDef.slot?.[0] === "C",
    preferCompound:  slotDef.slot?.[0] === "A",
  };

  // Delegate to pickWithFallback (extracted from Step 01 as a shared utility).
  // Returns exercise object or null.
  return pickWithFallback(
    catalogIndex.allowedSet,
    catalogIndex.byId,
    sel,
    state.usedIdsWeek,
    state.stats,
    state.usedSw2Today,
    state.usedRegionsToday
  );
}

const STRATEGY_REGISTRY = {
  "best_match_by_movement": bestMatchByMovement,
  // "fixed_exercise": fixedExercise,  -- Phase 3+
};

/**
 * Returns the strategy function for the given name, or throws.
 */
export function resolveStrategy(name) {
  const fn = STRATEGY_REGISTRY[name || "best_match_by_movement"];
  if (!fn) throw new Error(`Unknown selector strategy: "${name}"`);
  return fn;
}

/**
 * Fills a slot using the appropriate strategy.
 * Returns the selected exercise object, or null if no match.
 */
export function fillSlot(slotDef, catalogIndex, state) {
  const strategyFn = resolveStrategy(slotDef.selector_strategy);
  return strategyFn(slotDef, catalogIndex, state);
}
```

---

### F.4 `01_buildProgramFromDefinition.js`

```js
// api/engine/steps/01_buildProgramFromDefinition.js

import { fillSlot } from "../selectorStrategies.js";

export async function buildProgramFromDefinition({ inputs, request, compiledConfig }) {
  const { programType, builder } = compiledConfig;
  const { dayTemplates, setsByDuration, blockBudget, slotDefaults, excludeMovementClasses } = builder;

  // -- 1. Resolve duration and daysPerWeek (same precedence as today)
  const clientProfile = inputs?.clientProfile?.response ?? {};
  const duration = clampDuration(
    request?.duration_mins ?? clientProfile.duration_mins ?? clientProfile.minutes_per_session ?? 50
  );
  const daysPerWeek = clampInt(
    request?.days_per_week ?? clientProfile.days_per_week ?? clientProfile.preferred_days_count ?? 3,
    1, 6, 3
  );

  // -- 2. Build catalog index (same as today using inputs.exercises)
  const exercises = inputs?.exercises?.response?.results ?? [];
  const catalog_json = buildCatalogJsonFromExercises(exercises);  // equivalent to buildCatalogJsonFromBubble
  const cat = safeJsonParse(catalog_json);
  const byId = buildIndex(cat);   // { id -> ex }

  // -- 3. Build allowedSet
  const allowedIds = inputs?.allowed_exercise_ids ?? exercises.map(r => r.exercise_id || r.id);
  const allowedSet = new Set(allowedIds.filter(Boolean));

  // -- 4. Derive sets and budget
  const setsMap = resolveSetsMap(duration, setsByDuration);     // { A: 4, B: 3, C: 3, D: 2 }
  const budget  = resolveBudget(duration, blockBudget);         // integer e.g. 5
  const excludeMc = new Set((excludeMovementClasses || []).map(s => s.toLowerCase()));

  const stats = initStats(duration, budget, allowedIds.length);
  const usedIdsWeek = new Set();
  const days = [];

  // -- 5. Iterate day templates (up to daysPerWeek)
  for (let dayNum = 1; dayNum <= daysPerWeek; dayNum++) {
    const tmpl = dayTemplates[dayNum - 1];
    if (!tmpl) break;   // fewer templates than daysPerWeek: stop

    const take = Math.min(budget, tmpl.ordered_slots.length);
    const blocks = [];

    const builderState = {
      usedIdsWeek,
      usedSw2Today:     new Set(),
      usedRegionsToday: new Set(),
      blocksSoFar:      blocks,
      stats,
    };

    for (let i = 0; i < take; i++) {
      const rawSlotDef = tmpl.ordered_slots[i];
      const slotDef = applySlotDefaults(rawSlotDef, slotDefaults);

      const catalogIndex = { byId, allowedSet };
      let ex = fillSlot(slotDef, catalogIndex, builderState);

      // Exclude conditioning exercises (same guard as today)
      if (ex && isExcluded(ex, excludeMc)) {
        ex = null;
        stats.excluded_mc++;
      }

      if (ex) {
        // Seed fallback: if day has no real exercise yet, re-try with pickSeedExerciseForSlot
        // (same logic as today's `if (!ex && !dayHasRealExercise(blocks))`)
      }

      if (ex) {
        usedIdsWeek.add(ex.id);
        updateBuilderState(builderState, ex, byId);

        const blkLetter = slotDef.slot[0];
        const sets = setsMap[blkLetter] ?? 2;

        blocks.push({
          block:    blkLetter,
          slot:     slotDef.slot,
          ex_id:    ex.id,
          ex_name:  ex.n,
          sets:     sets,
          ex_sw:    ex.sw || "",   // stripped after loop
          ex_sw2:   ex.sw2 || "",  // stripped after loop
        });
      } else {
        // FILL block — add sets to fallback slot
        const targetSlot = slotDef.fill_fallback_slot ?? findFallbackTarget(blocks);
        applyFillAddSets(blocks, targetSlot, 1);
        blocks.push({
          block:        slotDef.slot[0],
          slot:         slotDef.slot,
          fill:         "add_sets",
          target_slot:  targetSlot,
          add_sets:     1,
        });
        stats.fills_add_sets++;
      }
    }

    // Strip ex_sw / ex_sw2 (same as today)
    for (const b of blocks) {
      if (b.ex_id) { delete b.ex_sw; delete b.ex_sw2; }
    }

    days.push({
      day_index:    dayNum,
      day_type:     programType,
      duration_mins: duration,
      blocks,
    });
  }

  stats.unique_used_week = usedIdsWeek.size;

  return {
    program: {
      program_type:  programType,
      schema:        `program_${programType}_v1`,
      duration_mins: duration,
      days_per_week: daysPerWeek,
      days,
    },
    debug: stats,
  };
}

// -- Helpers

function applySlotDefaults(slotDef, slotDefaults) {
  const letter = slotDef.slot[0];
  const defaults = slotDefaults?.[letter] ?? {};
  return {
    ...defaults,
    ...slotDef,  // slot-level values take precedence over block-letter defaults
  };
}

function resolveSetsMap(duration, setsByDuration) {
  const key = clampToKey(duration, Object.keys(setsByDuration).map(Number), 50);
  return setsByDuration[String(key)] ?? setsByDuration[key] ?? { A: 4, B: 3, C: 3, D: 2 };
}

function resolveBudget(duration, blockBudget) {
  const key = clampToKey(duration, Object.keys(blockBudget).map(Number), 50);
  return blockBudget[String(key)] ?? blockBudget[key] ?? 5;
}

function clampToKey(value, keys, fallback) {
  const sorted = [...keys].sort((a, b) => a - b);
  for (const k of sorted) if (value <= k) return k;
  return sorted[sorted.length - 1] ?? fallback;
}
```

**Key notes for Codex:**
- `pickWithFallback`, `pickBest`, `pickSeedExerciseForSlot`, `buildIndex`, `hasPref`, `regionsUsedToday`, `sw2UsedToday` are extracted to a shared internal utility module (e.g. `api/engine/exerciseSelector.js`). Both the new `01_buildProgramFromDefinition.js` and the old `01_buildBasicHypertrophyProgram.js` can import from it, or the old file is kept as-is and the new file re-implements the same logic. Codex should choose whichever minimises diff while keeping the old file unmodified.
- `buildCatalogJsonFromExercises` in the new step is identical to `buildCatalogJsonFromBubble` in the old step. Extract to shared utility or duplicate.
- `updateBuilderState` updates `usedSw2Today` and `usedRegionsToday` from the selected exercise.

---

### F.5 `02_segmentProgram.js`

```js
// api/engine/steps/02_segmentProgram.js

export async function segmentProgram({ program, compiledConfig }) {
  const programType = program.program_type ?? compiledConfig.programType ?? "unknown";
  const blockSemantics = compiledConfig.segmentation.blockSemantics;

  if (!Array.isArray(program.days)) throw new Error("segmentProgram: program.days missing");

  const out = {
    schema:        `program_${programType}_v1_segmented`,
    duration_mins: program.duration_mins,
    days_per_week: program.days_per_week ?? program.days.length,
    days: [],
  };

  const dbg = { days_out: 0, circuit_rounds_promoted: 0 };

  for (const day of program.days) {
    if (!day) continue;
    const segs = segmentDayFromBlocks(day, blockSemantics, dbg);
    out.days.push({
      day_index:    day.day_index,
      day_type:     day.day_type || programType,
      duration_mins: day.duration_mins ?? out.duration_mins,
      segments: segs,
    });
  }

  dbg.days_out = out.days.length;
  return { program: out, debug: dbg };
}

function segmentDayFromBlocks(day, blockSemantics, dbg) {
  const blocks = (day.blocks || []).filter(b => b && b.ex_id && b.ex_name);

  // Group by block letter, preserve insertion order
  const byLetter = new Map();
  for (const b of blocks) {
    const letter = String(b.slot || "")[0] || "?";
    if (!byLetter.has(letter)) byLetter.set(letter, []);
    byLetter.get(letter).push(b);
  }

  const segments = [];
  let segIndex = 1;

  for (const [letter, exs] of byLetter) {
    const sem = blockSemantics[letter] ?? { preferred_segment_type: "single", purpose: "accessory" };
    const { preferred_segment_type, purpose } = sem;

    if (preferred_segment_type === "single") {
      for (const b of exs) {
        segments.push({
          segment_index: segIndex++,
          segment_type:  "single",
          purpose,
          rounds: 1,
          items:  [mkItem(b)],
        });
      }
    }

    else if (preferred_segment_type === "superset") {
      if (exs.length === 1) {
        segments.push({ segment_index: segIndex++, segment_type: "single", purpose, rounds: 1, items: [mkItem(exs[0])] });
      } else {
        const pair = exs.slice(0, 2).map(mkItem);
        const rounds = deriveRounds(pair, 1);
        dbg.circuit_rounds_promoted++;
        segments.push({ segment_index: segIndex++, segment_type: "superset", purpose, rounds, items: pair });
        for (const overflow of exs.slice(2)) {
          segments.push({ segment_index: segIndex++, segment_type: "single", purpose: "accessory", rounds: 1, items: [mkItem(overflow)] });
        }
      }
    }

    else if (preferred_segment_type === "giant_set") {
      if (exs.length === 1) {
        segments.push({ segment_index: segIndex++, segment_type: "single", purpose, rounds: 1, items: [mkItem(exs[0])] });
      } else {
        const group = exs.slice(0, 3).map(mkItem);
        const rounds = deriveRounds(group, 1);
        dbg.circuit_rounds_promoted++;
        segments.push({ segment_index: segIndex++, segment_type: "giant_set", purpose, rounds, items: group });
        for (const overflow of exs.slice(3)) {
          segments.push({ segment_index: segIndex++, segment_type: "single", purpose: "accessory", rounds: 1, items: [mkItem(overflow)] });
        }
      }
    }
  }

  return segments;
}

function mkItem(b) {
  return { ex_id: b.ex_id, ex_name: b.ex_name, slot: b.slot, sets: b.sets ?? 0 };
}

function deriveRounds(items, fallback) {
  let max = 0;
  for (const it of items) { if ((it.sets ?? 0) > max) max = it.sets; }
  const rounds = max > 0 ? max : (fallback || 1);
  for (const it of items) { it.sets = 1; }
  return rounds;
}
```

---

### F.6 `runPipeline.js` — targeted changes summary

```js
// ADD imports:
import { buildProgramFromDefinition } from "./steps/01_buildProgramFromDefinition.js";
import { segmentProgram } from "./steps/02_segmentProgram.js";
import { resolveCompiledConfig } from "./resolveCompiledConfig.js";
import { validateCompiledConfig } from "./configValidation.js";

// REMOVE (lines 112–114):
// if (programType !== "hypertrophy") { throw new Error(...); }

// ADD after dbClient is set, before Step 1:
const compiledConfig = await resolveCompiledConfig(dbClient, { programType, schemaVersion, request });
validateCompiledConfig(compiledConfig);

// REPLACE Step 1 call:
// WAS: const step1 = await buildBasicHypertrophyProgramStep({ inputs, request });
const step1 = await buildProgramFromDefinition({ inputs, request, compiledConfig });

// REPLACE Step 2 call:
// WAS: const step2 = await segmentHypertrophyProgram({ program: step1.program, ... });
const step2 = await segmentProgram({ program: step1.program, compiledConfig });

// FIX Step 3 call (line 258):
// WAS: programType: "hypertrophy",
// NOW:
programType,

// DEDUPLICATE PGC fetch (Step 3 currently re-fetches):
// Pass compiledConfig.raw.programGenerationConfigRow directly into programGenerationConfigs
// when source === "db", avoiding a second fetchProgramGenerationConfigs call.
// Preserve request override path (source === "request") unchanged.
```

---

## G. Test Plan

### G.1 Hypertrophy parity (regression)

**Purpose:** Verify the new generic step 01 + step 02 produce materially equivalent output to the old hypertrophy-specific steps.

**Test:** Call `runPipeline` twice with identical inputs (same exercises, same profile, same seed) — once before refactor, once after. Compare:
- `counts.days` == days_per_week (e.g. 3)
- `counts.segments` is within ±2 of baseline (small variance allowed for seed differences)
- Each day has at least 1 segment with purpose `"main"`
- Each day has segment types from set `["single", "superset", "giant_set"]`
- `program.program_type === "hypertrophy"`
- `program.schema === "program_hypertrophy_v1"`
- Day 1 block letters begin with `A`, contain `B`, `C` entries

**Test file:** `api/engine/__tests__/hypertrophyParity.test.js`

### G.2 Config validation failure cases

**Purpose:** Verify bad configs are caught before generation begins.

| Test case | Expected error |
|---|---|
| `builder` key absent from compiled config | `builder is required` |
| `builder.dayTemplates` is empty array | `must be a non-empty array` |
| Slot uses block letter `"E"` not in `block_semantics` | `block letter "E" not in block_semantics` |
| Slot has `selector_strategy: "unknown_thing"` | `Unknown selector_strategy "unknown_thing"` |
| `segmentation.blockSemantics` has `preferred_segment_type: "tabata"` | `must be one of: single, superset, giant_set` |
| `builder.setsByDuration` is empty object | `must be a non-empty object` |

**Test file:** `api/engine/__tests__/configValidation.test.js`

### G.3 Strength first-pass

**Purpose:** Verify strength config produces a valid program structure.

**Prerequisite:** Strength PGC seed row exists with valid `builder` + `segmentation` config.

**Test:**
- `programType === "strength"` does not throw the old guard error
- Output has `program.program_type === "strength"`
- Each day segment has `segment_type === "single"` (strength uses all-single block semantics)
- Rep rules with `program_type = 'strength'` are applied (check `rep_rule_id` populated on items)

**Test file:** `api/engine/__tests__/strengthGeneration.test.js`

### G.4 FILL block handling

**Purpose:** Verify graceful degradation when exercises can't be found.

**Test:** Run with `allowed_exercise_ids: []` (empty pool). Verify:
- Step 01 does not throw
- All blocks are FILL blocks (`fill: "add_sets"`)
- `fill_fallback_slot` references are valid (slot exists in same day)
- Step 02 produces zero segments (no real exercises to group)
- Pipeline completes without error

### G.5 Unknown program type

**Purpose:** Verify that a valid but unconfigured program type fails loudly.

**Test:** `programType === "powerlifting"` where no PGC row exists → `resolveCompiledConfig` returns `null` builder/segmentation → `validateCompiledConfig` throws `ConfigValidationError` with `builder is required`.

### G.6 `runPipeline` no longer throws on non-hypertrophy

**Purpose:** Confirm the explicit guard is gone.

**Test:** `programType === "strength"` with valid strength config → pipeline runs to completion (or throws only from validation if config is incomplete, not from the old explicit guard).

---

## Notes for Codex

1. **Old files stay**: Do not delete `01_buildBasicHypertrophyProgram.js` or `02_segmentHypertrophy.js`. They are no longer imported by `runPipeline.js` after Phase 1b but are preserved for reference and rollback safety.

2. **Shared utility extraction**: `pickWithFallback`, `pickBest`, `buildIndex`, `hasPref`, `isConditioning`, `regionsUsedToday`, `sw2UsedToday`, `buildCatalogJsonFromBubble` should either be extracted to `api/engine/exerciseSelector.js` and imported by the new Step 01, OR be re-implemented in the new Step 01 file. Prefer extraction to avoid duplication. Do not modify the old Step 01 file to import from the shared module (that would change a stable file unnecessarily).

3. **ESM throughout**: All new files use `import`/`export`. No `require()`.

4. **No Zod**: The project does not currently use Zod. `configValidation.js` uses plain JS validation as shown in §F.2.

5. **Stats object**: The `stats` debug object in Step 01 should include the same keys as today plus a `source: compiledConfig.source` field. This preserves observability.

6. **`schemaVersion` variable**: This is currently hardcoded as `const schemaVersion = 1` in `runPipeline.js` at line 177. It should remain as a constant for now. The resolver reads it from there.

7. **Seed migration**: The `R__seed_program_generation_config.sql` update must use `jsonb_build_object` nested calls to construct the new `builder` and `segmentation` sections inline. The file format is Flyway SQL. The `ON CONFLICT (config_key) DO UPDATE` pattern already covers idempotency. After the file changes, `docker compose run --rm flyway migrate` must be run.
