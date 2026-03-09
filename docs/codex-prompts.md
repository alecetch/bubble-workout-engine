# Codex Implementation Prompts — Pipeline Multi-Type Refactor

Four sequential prompts. Each must be executed and verified before the next begins.
The full spec is in `docs/pipeline-multi-type-spec.md`.
The design rationale is in `docs/pipeline-multi-type-design.md`.

---

## Prompt 1 — Phase 0: Plumbing Only

### Context

You are working in the `bubble-workout-engine` Node/Express API codebase.
The codebase uses ESM (`import`/`export`) throughout. No CommonJS.
The pipeline entry point is `api/engine/runPipeline.js`.
The current pipeline only supports hypertrophy and has an explicit guard that throws for any other program type.

Your task is Phase 0 only: plumbing changes that remove the guard and wire in compiled config resolution. The existing hypertrophy step files (`01_buildBasicHypertrophyProgram.js`, `02_segmentHypertrophy.js`) must remain in use and unmodified. Hypertrophy generation must work identically after this change.

### Files you must read before writing anything

- `api/engine/runPipeline.js` — understand the full flow before touching it
- `api/src/services/programGenerationConfig.js` — understand `fetchProgramGenerationConfigs` and `fetchProgramGenerationConfigByKey`

### Files to create

**`api/engine/resolveCompiledConfig.js`**

Implement `export async function resolveCompiledConfig(dbClient, { programType, schemaVersion, request })`.

Resolution priority:
1. If `request.config_key` is set: call `fetchProgramGenerationConfigByKey(dbClient, request.config_key)`. Throw if not found.
2. Else if `request.program_generation_config_json` is set: parse it and build a synthetic PGC row (same logic that already exists inline in `runPipeline.js` for this case — extract it, do not duplicate it).
3. Else: call `fetchProgramGenerationConfigs(dbClient, programType, schemaVersion)` and pick the best row using the `pickPreferredConfigRow` logic that already exists inline in `runPipeline.js` — extract it, do not duplicate it.

Return a `compiledConfig` object with this exact shape:
```js
{
  programType,          // string
  schemaVersion,        // number
  configKey,            // string — from row or "hardcoded_{programType}_v{schemaVersion}"
  source,               // "db" | "request" | "hardcoded"

  builder: {
    dayTemplates:           null,   // populated in Phase 1 from pgcJson.builder.day_templates
    setsByDuration:         null,
    blockBudget:            null,
    slotDefaults:           {},
    excludeMovementClasses: pgcJson?.builder?.exclude_movement_classes ?? ["cardio", "conditioning", "locomotion"],
  },

  segmentation: {
    blockSemantics: null,           // populated in Phase 3 from pgcJson.segmentation.block_semantics
  },

  progression: {
    progressionByRank:    pgcRow?.progression_by_rank_json   ?? {},
    weekPhaseConfig:      pgcRow?.week_phase_config_json     ?? {},
    totalWeeksDefault:    pgcRow?.total_weeks_default        ?? 4,
    applyToPurposes:      pgcJson?.progression?.apply_to_purposes ?? ["main", "secondary", "accessory"],
  },

  raw: {
    programGenerationConfigRow:  pgcRow,   // the full DB row or null
    programGenerationConfigJson: pgcJson,  // parsed JSONB object or {}
  },
}
```

If no PGC row is found at all (DB returned nothing, no request override), `source` is `"hardcoded"`, `pgcRow` is `null`, `pgcJson` is `{}`. Do not throw — let validation handle it.

`safeJsonParse` should handle both already-parsed objects and raw JSON strings, returning `{}` on failure.

---

**`api/engine/configValidation.js`**

Implement `export function validateCompiledConfig(config)`.

This function throws `ConfigValidationError` (a custom `Error` subclass you define in the same file) with `this.code = "config_validation_error"` and `this.details = string[]` if config is invalid.

**Phase 0 rules only** — validation is intentionally lenient because the old steps do not need `builder` or `segmentation` yet:

- `config.programType` must be a non-empty string.
- `config.schemaVersion` must be a positive finite number.
- If `config.builder.dayTemplates` is present (non-null), it must be a non-empty array. (It will be null in Phase 0 — that is acceptable.)
- If `config.segmentation.blockSemantics` is present (non-null), each entry must have `preferred_segment_type` in `["single", "superset", "giant_set"]` and a non-empty `purpose`. (It will be null in Phase 0 — that is acceptable.)

Collect all errors before throwing (do not throw on first error). Export `ConfigValidationError` as a named export.

---

### Files to modify

**`api/engine/runPipeline.js`**

Make only these targeted changes:

1. **Remove lines 112–114** — the explicit `if (programType !== "hypertrophy") throw` guard.

2. **Add imports** at the top:
   ```js
   import { resolveCompiledConfig } from "./resolveCompiledConfig.js";
   import { validateCompiledConfig } from "./configValidation.js";
   ```

3. **Add `compiledConfig` resolution** immediately after `const dbClient = db || pool;`:
   ```js
   const compiledConfig = await resolveCompiledConfig(dbClient, { programType, schemaVersion: 1, request });
   validateCompiledConfig(compiledConfig);
   ```
   Where `schemaVersion` is the existing `const schemaVersion = 1` already in this file — use that variable.

4. **Fix hardcoded `"hypertrophy"` in Step 3 call** (currently at roughly line 258):
   Change `programType: "hypertrophy"` to `programType`.

5. **Deduplicate the PGC fetch**: Step 3 currently fetches PGC rows from DB again. Replace the DB fetch block in Step 3 with `compiledConfig.raw.programGenerationConfigRow` when it is non-null and source is `"db"` or `"hardcoded"`. Preserve the request override path unchanged (it was already handled in `resolveCompiledConfig`). The `pgcSelectedRow` local variable in Step 3 should be set to `compiledConfig.raw.programGenerationConfigRow ?? hardcodedProgramGenerationConfigRow(programType, schemaVersion)`.

6. **Do not change anything else.** Step 1 and Step 2 remain as `buildBasicHypertrophyProgramStep` and `segmentHypertrophyProgram`. The `compiledConfig` object is resolved and validated but not yet passed to any step.

---

### Constraints

- Do not modify `01_buildBasicHypertrophyProgram.js` or `02_segmentHypertrophy.js`.
- Do not create or modify any seed migration files.
- Do not add any new dependencies.
- All new files use ESM (`import`/`export`), no `require()`.
- `safeJsonParse` / `deepClone` and similar small utilities should be defined inline where needed — do not create a shared utils file.

### Deliver

1. All new/modified file contents.
2. A concise list of every file changed and what changed.
3. Any assumptions you made.
4. A TODO list of exactly what Prompt 2 will need to finish.

---

## Prompt 2 — Generic Step 01 + Selector Utilities

### Context

Phase 0 is complete. `runPipeline.js` resolves a `compiledConfig` object before calling any steps, and `configValidation.js` validates it. The old hypertrophy steps are still wired in.

Your task is to implement the generic Step 01 (`buildProgramFromDefinition`) and the selector utilities it depends on. The new step reads its structural definitions from `compiledConfig.builder` instead of hardcoding them.

The output contract of the new Step 01 must be identical to the old Step 01 — specifically `program.days[].blocks[]` shape — so that the existing `02_segmentHypertrophy.js` continues to work unchanged in Step 2.

### Files you must read before writing anything

- `api/engine/steps/01_buildBasicHypertrophyProgram.js` — read it in full. Every helper function matters.
- `api/engine/runPipeline.js` — understand how `inputs` is structured; how `allowed_exercise_ids` is provided; how the catalog is available.
- `api/engine/resolveCompiledConfig.js` — the `compiledConfig.builder` shape you'll consume.

### Important details from reading Step 01

The following functions in the existing Step 01 contain the core selection logic that must be preserved exactly:

- `pickBest(allowedSet, byId, sel, usedSet, usedRegionsSet)` — scoring: sw2=+12, sw=+10, mp=+4, den=+0.2, cx=+0.05; avoidSw2 skip; requirePref hard filter; preferLoadable/preferIsolation/preferCompound bonuses. Do not alter this scoring.
- `pickWithFallback(allowedSet, byId, sel, usedWeek, stats, usedSw2Set, usedRegionsSet)` — multi-pass fallback chain: sw2+pref → sw+pref → mp+pref → sw2 relaxed → sw relaxed → mp relaxed → allow duplicates.
- `pickSeedExerciseForSlot(allowedSet, byId, sel)` — fallback when the day has no real exercise yet.
- `hasPref(ex, pref)`, `isConditioning(ex)`, `isLoadable(ex)`, `regionsUsedToday(blocks, byId)`, `sw2UsedToday(blocks)`, `buildIndex(cat)`, `dayHasRealExercise(blocks)`.
- `buildCatalogJsonFromBubble(exercises)` — maps DB exercise rows to compact catalog format.
- `applyFillAddSets(blocks, targetSlot, addSets)`.

### Files to create

**`api/engine/exerciseSelector.js`**

Extract the following functions verbatim from `01_buildBasicHypertrophyProgram.js` into this shared module and export them:

- `buildIndex`
- `buildCatalogJsonFromBubble`
- `hasPref`
- `isConditioning`
- `isLoadable`
- `dayHasRealExercise`
- `regionsUsedToday`
- `sw2UsedToday`
- `pickBest`
- `pickSeedExerciseForSlot`
- `pickWithFallback`
- `applyFillAddSets`

Any local utility functions they depend on (`toStr`, `normalizeCmp`, `safeJsonParse`, etc.) must be defined in `exerciseSelector.js` as well. Do not import them from anywhere else — keep this file self-contained.

Do not modify `01_buildBasicHypertrophyProgram.js`. It will continue to define its own local copies of these functions.

---

**`api/engine/selectorStrategies.js`**

Implement:

```js
export function resolveStrategy(name)   // returns strategy function or throws Error
export function fillSlot(slotDef, catalogIndex, state)  // dispatches to strategy, returns ex or null
```

Strategy registry (Phase 2 only):

- `"best_match_by_movement"` — calls `pickWithFallback` from `exerciseSelector.js`. This is the default strategy when `selector_strategy` is absent from the slot definition.

`state` object shape:
```js
{
  usedIdsWeek:      Set,     // exercise IDs used anywhere this week
  usedSw2Today:     Set,     // sw2 values used in current day's blocks so far
  usedRegionsToday: Set,     // target regions used in current day's blocks so far
  stats:            object,  // mutable stats object passed through from Step 01
}
```

`catalogIndex` shape:
```js
{ byId: object, allowedSet: Set }
```

`slotDef` shape (from config):
```js
{
  slot:               string,   // "A:squat"
  selector_strategy:  string,   // optional, defaults to "best_match_by_movement"
  mp:                 string|null,
  sw:                 string|null,
  swAny:              string[]|null,
  sw2:                string|null,
  requirePref:        string|null,
  preferLoadable:     boolean,
  fill_fallback_slot: string|null,
}
```

Inside `bestMatchByMovement`, build the `sel` object for `pickWithFallback` from `slotDef`:
```js
{
  mp:              slotDef.mp   || null,
  sw:              slotDef.sw   || null,
  swAny:           slotDef.swAny || null,
  sw2:             slotDef.sw2  || null,
  requirePref:     slotDef.requirePref || null,
  preferLoadable:  !!slotDef.preferLoadable,
  preferIsolation: slotDef.slot?.[0] === "C",
  preferCompound:  slotDef.slot?.[0] === "A",
}
```

---

**`api/engine/steps/01_buildProgramFromDefinition.js`**

Implement `export async function buildProgramFromDefinition({ inputs, request, compiledConfig })`.

This function must produce output with the same shape as `buildBasicHypertrophyProgramStep`:
```js
{
  program: {
    program_type:  string,   // from compiledConfig.programType
    schema:        string,   // `program_${programType}_v1`
    duration_mins: number,
    days_per_week: number,
    days: [
      {
        day_index:    number,   // 1-based
        day_type:     string,   // == programType
        duration_mins: number,
        blocks: [
          { block, slot, ex_id, ex_name, sets },    // real exercise block
          { block, slot, fill, target_slot, add_sets }  // fill block
        ]
      }
    ]
  },
  debug: object
}
```

Note: `program_type` is a new field not present in the old Step 01's output. It must be added. Steps 03 and 04 already read `program.program_type` or `program.programType` — this fills the field they were already looking for.

Implementation rules:

**Duration clamping**: Replicate the existing `clampInt(duration_mins, 40, 60, 50)` behaviour. Then resolve `setsByDuration` and `blockBudget` by matching to the nearest key. Keys in config are strings (`"40"`, `"50"`, `"60"`). Logic: clamp incoming duration to the nearest available key — find the smallest key ≥ duration, fall back to largest key.

**Days per week clamping**: `clampInt(days_per_week, 1, 6, 3)`. Then iterate `compiledConfig.builder.dayTemplates` from index 0 to `daysPerWeek - 1`. If `dayTemplates.length < daysPerWeek`, stop at the last available template.

**Slot defaults**: Before processing each slot, apply block-letter defaults from `compiledConfig.builder.slotDefaults`. Slot-level values take precedence:
```js
function applySlotDefaults(slotDef, slotDefaults) {
  const letter = slotDef.slot[0];
  const defaults = slotDefaults?.[letter] ?? {};
  return { ...defaults, ...slotDef };
}
```

**Per-slot processing loop**:
1. Call `applySlotDefaults`.
2. Build `catalogIndex = { byId, allowedSet }`.
3. Call `fillSlot(slotDef, catalogIndex, builderState)` from `selectorStrategies.js`.
4. If returned `ex` is excluded by `isConditioning` check (using `compiledConfig.builder.excludeMovementClasses`), set `ex = null`.
5. If `ex === null` and day has no real exercise yet (`!dayHasRealExercise(blocks)`): call `pickSeedExerciseForSlot(allowedSet, byId, slotDef)` from `exerciseSelector.js`.
6. If `ex` found: add to `usedIdsWeek`; update `builderState.usedSw2Today` and `builderState.usedRegionsToday`; push real block with `block`, `slot`, `ex_id`, `ex_name`, `sets`, `ex_sw`, `ex_sw2`.
7. If `ex` still null: resolve `fill_fallback_slot` (from slotDef, or call `findFirstRealSlot(blocks)` to get the first real block's slot as fallback, or `"A:squat"` as last resort); call `applyFillAddSets`; push fill block.

**After each day's block loop**: strip `ex_sw` and `ex_sw2` from all real blocks (same as existing Step 01 line 625–630).

**`builderState`** is constructed fresh for each day:
```js
{
  usedIdsWeek,       // shared across days for the whole week
  usedSw2Today:     new Set(),
  usedRegionsToday: new Set(),
  stats,
}
```

**`stats` object** must include all the same keys as in the existing Step 01 (`picked_sw2_pref`, `picked_sw_pref`, `picked_mp_pref`, `picked_sw2_relaxed`, `picked_sw_relaxed`, `picked_mp_relaxed`, `picked_allow_dup`, `avoided_repeat_sw2`, `fills_add_sets`, `fill_failed`, `region_penalty_active`, `movement_class_bias_active`, `notes`) plus:
- `source: compiledConfig.source`
- `config_key: compiledConfig.configKey`

**Inputs resolution** — read from `inputs` in this priority order, exactly matching existing Step 01:

| Value | Source |
|---|---|
| `duration_mins` | `request.duration_mins` → `request.durationMins` → `clientProfile.duration_mins` → `clientProfile.minutes_per_session` → 50 |
| `days_per_week` | `request.days_per_week` → `request.daysPerWeek` → `clientProfile.days_per_week` → `clientProfile.preferred_days_count` → 3 |
| exercises | `inputs.exercises.response.results ?? []` |
| allowed_exercise_ids | `inputs.allowed_exercise_ids` if present, else all exercise IDs in catalog |

---

### Files to modify

**`api/engine/runPipeline.js`**

Replace the Step 1 call. Add import for `buildProgramFromDefinition`. Change:
```js
// WAS:
const step1 = await buildBasicHypertrophyProgramStep({ inputs, request });

// NOW:
const step1 = await buildProgramFromDefinition({ inputs, request, compiledConfig });
```

Keep the Step 2 call as `segmentHypertrophyProgram` — unchanged.

Keep the import of `buildBasicHypertrophyProgramStep` if it is used elsewhere, or remove it if it is now unused.

---

### Constraints

- Do not modify `01_buildBasicHypertrophyProgram.js`.
- Do not modify `02_segmentHypertrophy.js`.
- Do not modify any seed migration files.
- The new Step 01 must produce output that `segmentHypertrophyProgram` can consume unchanged.
- Prioritise correctness and parity with the existing hypertrophy implementation over code elegance.
- If you find any ambiguity in replicating existing behaviour, replicate it faithfully and note it in your assumptions.

### Deliver

1. All new/modified file contents.
2. A concise list of every file changed and what changed.
3. Any assumptions you made — especially any cases where the new implementation diverges from the old.
4. A TODO list of exactly what Prompt 3 will need to finish.

---

## Prompt 3 — Generic Step 02 + Hypertrophy Config Seed

### Context

Phase 0 and Phase 1 (generic Step 01) are complete. The pipeline now uses `buildProgramFromDefinition` for Step 1 and still uses `segmentHypertrophyProgram` for Step 2. The `compiledConfig` object exists but `compiledConfig.segmentation.blockSemantics` is currently `null` (no seed data yet).

Your task is to:
1. Update the seed migration to add `builder` and `segmentation` config to the hypertrophy row.
2. Make `configValidation.js` enforce `builder` and `segmentation` as required (now that the seed provides them).
3. Implement generic Step 02 and wire it into `runPipeline.js`.

After this prompt, the full hypertrophy path runs on the new architecture end-to-end.

### Files you must read before writing anything

- `api/engine/steps/02_segmentHypertrophy.js` — read it in full.
- `migrations/R__seed_program_generation_config.sql` — understand the existing seed structure before modifying it.
- `api/engine/configValidation.js` — review the Phase 0 validation rules you need to tighten.
- `api/engine/resolveCompiledConfig.js` — confirm how `segmentation.blockSemantics` is populated from the parsed JSON.

### Files to modify

**`migrations/R__seed_program_generation_config.sql`**

Extend the `program_generation_config_json` JSONB for the `hypertrophy_default_v1` row. The current seed builds `program_generation_config_json` with a `jsonb_build_object` call. Extend that call to include `'builder'` and `'segmentation'` keys.

The values must be exactly as follows.

**`builder` section:**

```sql
'builder', jsonb_build_object(
  'day_templates', jsonb_build_array(
    jsonb_build_object(
      'day_key', 'day1',
      'focus', 'lower',
      'ordered_slots', jsonb_build_array(
        jsonb_build_object('slot', 'A:squat',          'sw2', 'squat_compound',            'requirePref', 'strength_main'),
        jsonb_build_object('slot', 'B:lunge',          'mp',  'lunge',       'sw', 'quad_iso_unilateral'),
        jsonb_build_object('slot', 'C:quad',           'swAny', jsonb_build_array('quad_iso_unilateral', 'quad_iso_squat'), 'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'A:squat'),
        jsonb_build_object('slot', 'C:calves',         'sw',  'calf_iso',                  'requirePref', 'hypertrophy_secondary', 'preferLoadable', true, 'fill_fallback_slot', 'B:lunge'),
        jsonb_build_object('slot', 'D:core',           'mp',  'anti_extension', 'sw', 'core',            'fill_fallback_slot', 'B:lunge'),
        jsonb_build_object('slot', 'C:hinge_accessory','sw',  'hamstring_iso', 'sw2', 'hinge_compound',  'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'A:squat')
      )
    ),
    jsonb_build_object(
      'day_key', 'day2',
      'focus', 'upper',
      'ordered_slots', jsonb_build_array(
        jsonb_build_object('slot', 'A:push_horizontal',  'sw2', 'push_horizontal_compound',  'requirePref', 'strength_main'),
        jsonb_build_object('slot', 'B:pull_horizontal',  'sw2', 'pull_horizontal_compound',  'requirePref', 'hypertrophy_secondary'),
        jsonb_build_object('slot', 'B:secondary_press',  'sw',  'push_horizontal_db', 'sw2', 'push_horizontal_compound', 'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'B:pull_horizontal'),
        jsonb_build_object('slot', 'C:arms',             'sw',  'arms',                      'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'B:secondary_press'),
        jsonb_build_object('slot', 'C:rear_delt',        'sw',  'shoulder_iso',              'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'B:pull_horizontal'),
        jsonb_build_object('slot', 'C:arms2',            'sw',  'arms',                      'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'C:arms')
      )
    ),
    jsonb_build_object(
      'day_key', 'day3',
      'focus', 'posterior',
      'ordered_slots', jsonb_build_array(
        jsonb_build_object('slot', 'A:hinge',           'sw2', 'hinge_compound',   'requirePref', 'strength_main'),
        jsonb_build_object('slot', 'B:secondary_lower', 'sw2', 'squat_compound',   'requirePref', 'hypertrophy_secondary'),
        jsonb_build_object('slot', 'C:hamstring_iso',   'sw',  'hamstring_iso',    'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'A:hinge'),
        jsonb_build_object('slot', 'C:glute',           'sw',  'glute_iso',        'requirePref', 'hypertrophy_secondary', 'fill_fallback_slot', 'A:hinge'),
        jsonb_build_object('slot', 'D:core',            'mp',  'anti_extension', 'sw', 'core',   'fill_fallback_slot', 'B:secondary_lower'),
        jsonb_build_object('slot', 'C:calves',          'sw',  'calf_iso',         'requirePref', 'hypertrophy_secondary', 'preferLoadable', true, 'fill_fallback_slot', 'B:secondary_lower')
      )
    )
  ),
  'sets_by_duration', jsonb_build_object(
    '40', jsonb_build_object('A', 3, 'B', 3, 'C', 2, 'D', 2),
    '50', jsonb_build_object('A', 4, 'B', 3, 'C', 3, 'D', 2),
    '60', jsonb_build_object('A', 5, 'B', 4, 'C', 3, 'D', 3)
  ),
  'block_budget', jsonb_build_object('40', 4, '50', 5, '60', 6),
  'slot_defaults', jsonb_build_object(
    'C', jsonb_build_object('requirePref', 'hypertrophy_secondary'),
    'D', jsonb_build_object('requirePref', 'hypertrophy_secondary')
  ),
  'exclude_movement_classes', jsonb_build_array('cardio', 'conditioning', 'locomotion')
)
```

**`segmentation` section:**

```sql
'segmentation', jsonb_build_object(
  'block_semantics', jsonb_build_object(
    'A', jsonb_build_object('preferred_segment_type', 'single',    'purpose', 'main'),
    'B', jsonb_build_object('preferred_segment_type', 'superset',  'purpose', 'secondary'),
    'C', jsonb_build_object('preferred_segment_type', 'giant_set', 'purpose', 'accessory'),
    'D', jsonb_build_object('preferred_segment_type', 'single',    'purpose', 'accessory')
  )
)
```

**`progression` section** (add alongside builder/segmentation):

```sql
'progression', jsonb_build_object(
  'apply_to_purposes', jsonb_build_array('main', 'secondary', 'accessory')
)
```

This is a Flyway repeatable migration (`R__*.sql`). The `ON CONFLICT (config_key) DO UPDATE` block already covers the `program_generation_config_json` column — confirm it is included in the update set. The migration will re-run automatically when the file checksum changes.

---

**`api/engine/configValidation.js`**

Upgrade from Phase 0 lenient rules to full validation. Replace the Phase 0 "null is acceptable" rules with enforced presence:

- `config.builder` must be non-null object (Phase 0 already required this structurally, but `null` was allowed).
- `config.builder.dayTemplates` must be a non-empty array. **Required, not optional.**
- Each template must have `day_key` (non-empty, unique) and `ordered_slots` (non-empty array).
- Each slot must have `slot` matching `/^[A-Z]:.+/`.
- Each slot's block letter must exist in `config.segmentation.blockSemantics`.
- Each slot's `selector_strategy`, if present, must be in the known strategies set (`["best_match_by_movement"]`).
- `config.builder.setsByDuration` must be non-null non-empty object.
- `config.builder.blockBudget` must be non-null non-empty object.
- `config.segmentation.blockSemantics` must be non-null non-empty object. **Required, not optional.**
- Each `blockSemantics` entry must have `preferred_segment_type` in `["single", "superset", "giant_set"]` and non-empty `purpose`.

Keep collecting all errors before throwing.

---

### Files to create

**`api/engine/steps/02_segmentProgram.js`**

Implement `export async function segmentProgram({ program, compiledConfig })`.

Output shape must match the output of `segmentHypertrophyProgram` exactly, because Steps 03–06 consume the same structure:
```js
{
  program: {
    schema:        `program_${programType}_v1_segmented`,
    duration_mins: number,
    days_per_week: number,
    days: [
      {
        day_index:     number,
        day_type:      string,
        duration_mins: number,
        segments: [
          {
            segment_index: number,  // 1-based within day
            segment_type:  string,  // "single" | "superset" | "giant_set"
            purpose:       string,  // "main" | "secondary" | "accessory"
            rounds:        number,
            items: [
              { ex_id, ex_name, slot, sets }
            ]
          }
        ]
      }
    ]
  },
  debug: object
}
```

Implementation:

Read `compiledConfig.segmentation.blockSemantics` to drive grouping.

Group blocks by block letter. For each letter group, apply these rules (identical to existing `segmentHypertrophy.js` semantics — preserve them exactly):

- `preferred_segment_type === "single"`: each exercise becomes its own `single` segment, all at `rounds: <from_config_or_1>`. Take all exercises, no limit. Purpose from semantics.
- `preferred_segment_type === "superset"`: if count === 1, single segment. If count ≥ 2, take first two as `superset`; remaining become individual `single` accessory segments. `rounds = max(item.sets)` of the pair, then set `item.sets = 1`.
- `preferred_segment_type === "giant_set"`: if count === 1, single segment. If count ≥ 2, take first three (max) as `giant_set`; remaining become individual `single` accessory segments. `rounds = max(item.sets)` of the group, then set `item.sets = 1`.

For `"single"` segments in a group: preserve `rounds = item.sets` (set on the segment level, not derived).

Only include blocks that have `ex_id` and `ex_name` (skip fill blocks).

The `fill` / `add_sets` handling from `02_segmentHypertrophy.js` (the `resolveFillsAndMissing` function) applies before block grouping. Replicate this logic in the new Step 02. If a fill block's `target_slot` exists as a real block in the day, add its `add_sets` to that block's `sets` count before grouping. This is the same `resolveFillsAndMissing` function from the existing Step 02 — replicate it verbatim.

`segment_index` is 1-based per day, incrementing across all letter groups in insertion order.

`day_type` fallback: `day.day_type || compiledConfig.programType || "unknown"` (not hardcoded `"hypertrophy"`).

---

### Files to modify

**`api/engine/runPipeline.js`**

Replace the Step 2 call:
```js
// WAS:
const step2 = await segmentHypertrophyProgram({
  program: step1.program,
  default_single_rounds: ...,
  default_superset_rounds: ...,
  default_giant_rounds: ...,
});

// NOW:
const step2 = await segmentProgram({ program: step1.program, compiledConfig });
```

Add import for `segmentProgram`. Remove import of `segmentHypertrophyProgram` if now unused.

---

### Run after completing this prompt

```bash
docker compose run --rm flyway migrate
```

Then verify hypertrophy generation works end-to-end:
```bash
# POST /api/program/generate with a valid hypertrophy payload
```

---

### Constraints

- Do not modify `02_segmentHypertrophy.js`.
- The only behaviour change relative to Phase 2 is: Step 02 is now config-driven. All output values must be identical to what `segmentHypertrophyProgram` would have produced.
- All ESM.

### Deliver

1. All new/modified file contents.
2. A concise list of every file changed.
3. Any assumptions or deviations from the spec.
4. Confirmation that the Flyway migration was applied and hypertrophy generation produces valid output.
5. A TODO list for Prompt 4.

---

## Prompt 4 — Tests + Strength First Pass

### Context

The full refactored pipeline is now running on the new architecture for hypertrophy. The old step files remain in the repo but are no longer imported by `runPipeline.js`.

Your task is to:
1. Write tests to lock in the refactor.
2. Add the strength program type as the first proof that multi-type support works.

### Files you must read before writing anything

- `api/engine/steps/01_buildProgramFromDefinition.js`
- `api/engine/steps/02_segmentProgram.js`
- `api/engine/configValidation.js`
- `api/engine/resolveCompiledConfig.js`
- `migrations/R__seed_program_generation_config.sql` — understand the existing pattern before adding a row
- Any existing test files in `api/__tests__/` or `api/engine/__tests__/` — match their style and test runner

### Part A — Tests

**`api/engine/__tests__/configValidation.test.js`**

Test `validateCompiledConfig` directly. Pass in hand-constructed `compiledConfig` objects.

Required test cases:

| Description | Input | Expected |
|---|---|---|
| Valid hypertrophy config | Full valid config | Does not throw |
| Missing `programType` | `programType: ""` | Throws with `"programType is required"` in details |
| `builder` is null | `builder: null` | Throws with `"builder is required"` |
| `dayTemplates` is empty | `builder.dayTemplates: []` | Throws with `"non-empty array"` |
| Slot block letter not in blockSemantics | Slot `"E:test"` with no `"E"` in semantics | Throws with `"block letter"` |
| Unknown `selector_strategy` | `selector_strategy: "wizard_mode"` | Throws with `"Unknown selector_strategy"` |
| `blockSemantics` has bad `preferred_segment_type` | `preferred_segment_type: "tabata"` | Throws with `"must be one of"` |
| Multiple errors at once | Two bad fields | Throws with both errors in `details[]` |

**`api/engine/__tests__/hypertrophyParity.test.js`**

Test that the new `buildProgramFromDefinition` produces equivalent output to `buildBasicHypertrophyProgramStep`.

Setup: build a representative `inputs` object using a subset of exercise catalogue rows (at minimum 20 exercises covering squat_compound, hinge_compound, push_horizontal_compound, pull_horizontal_compound, quad_iso, hamstring_iso, glute_iso, arms swap groups, shoulder_iso, calf_iso). These can be hardcoded test fixtures — no DB connection required.

Build a representative `compiledConfig` with the full hypertrophy builder config (matching the seed values from Prompt 3).

Tests:
- Output has `program.program_type === "hypertrophy"`
- Output has `program.schema === "program_hypertrophy_v1"`
- `program.days.length === 3` for `days_per_week: 3`
- Each day has `blocks.length >= 1`
- Each day has at least one block with a real `ex_id` (not a fill block)
- Day 1 first block has `block === "A"` and `slot` starting with `"A:"`
- `fills_add_sets` in debug is a number (may be 0)
- The step does not throw with a minimal but valid exercise pool

**`api/engine/__tests__/strengthGeneration.test.js`** (depends on Part B completing first)

Tests:
- `runPipeline` does not throw the old hypertrophy guard when called with `programType: "strength"`
- Output has `program.program_type === "strength"`
- All segments have `segment_type === "single"` (all-single block semantics for strength)
- `program.days.length` equals the configured `days_per_week`
- Each day has at least one segment

---

### Part B — Strength program type

**`migrations/R__seed_program_generation_config.sql`**

Add a second seed row: `config_key = "strength_default_v1"`, `program_type = "strength"`, `schema_version = 1`.

Strength structural config requirements:
- 3-day program split: day1 = lower strength (squat, hinge, accessories), day2 = upper push/pull strength, day3 = full body or posterior chain
- All `block_semantics` use `preferred_segment_type: "single"` — strength does not use supersets or giant sets
- `requirePref` values use `"strength_main"` for A-block compound slots
- Set allocations are lower than hypertrophy (strength uses fewer total sets): suggested `sets_by_duration: { "40": { "A": 4, "B": 3, "C": 2 }, "50": { "A": 5, "B": 3, "C": 2 }, "60": { "A": 5, "B": 4, "C": 3 } }`
- Block budget same or slightly lower than hypertrophy
- `progression_by_rank_json`: same structure as hypertrophy (weekly_set_step, max_extra_sets) — keep conservative defaults
- `week_phase_config_json`: same structure, same phase labels

Day template slot suggestions (use existing catalogue swap groups where possible):

day1 (lower strength):
- `A:squat` — `sw2: "squat_compound"`, `requirePref: "strength_main"`
- `B:hinge` — `sw2: "hinge_compound"`, `requirePref: "strength_main"`
- `C:lunge` — `mp: "lunge"`, `sw: "quad_iso_unilateral"`
- `C:hamstring_iso` — `sw: "hamstring_iso"`, `requirePref: "hypertrophy_secondary"`
- `D:core` — `mp: "anti_extension"`, `sw: "core"`

day2 (upper strength):
- `A:push_horizontal` — `sw2: "push_horizontal_compound"`, `requirePref: "strength_main"`
- `B:pull_horizontal` — `sw2: "pull_horizontal_compound"`, `requirePref: "strength_main"`
- `C:push_vertical` — `mp: "push_vertical"`, `sw: "push_vertical"`, `requirePref: "strength_main"`
- `C:pull_vertical` — `mp: "pull_vertical"`, `sw: "pull_vertical"`
- `D:core` — `mp: "anti_extension"`, `sw: "core"`

day3 (posterior strength):
- `A:hinge` — `sw2: "hinge_compound"`, `requirePref: "strength_main"`
- `B:squat` — `sw2: "squat_compound"`, `requirePref: "strength_main"`
- `C:glute` — `sw: "glute_iso"`, `requirePref: "hypertrophy_secondary"`
- `C:calves` — `sw: "calf_iso"`, `preferLoadable: true`
- `D:core` — `mp: "anti_extension"`, `sw: "core"`

These are suggestions based on existing catalogue swap groups. Adjust slot key names to avoid collision with the hypertrophy slot keys that share the same block+key string (they exist in separate day template arrays, so collision is not a code problem — just avoid confusing naming).

**Rep rules** (`migrations/R__seed_rep_rules.sql` — if this file exists):

Add strength-specific rules with `program_type = 'strength'`. Minimum required rules:
- A-block main: `rep_low: 3`, `rep_high: 5`, `reps_unit: "reps"`, `rir_target: 2`, `rest_after_set_sec: 180`
- B-block secondary: `rep_low: 4`, `rep_high: 6`, `rir_target: 2`, `rest_after_set_sec: 150`
- C/D accessory: `rep_low: 8`, `rep_high: 12`, `rir_target: 3`, `rest_after_set_sec: 90`

If `R__seed_rep_rules.sql` does not exist, note it as a TODO and skip.

**Narration templates** (`migrations/R__seed_narration_templates.sql` — if this file exists):

Add minimal strength narration templates with `program_type = 'strength'`. At minimum one row per phase (BASELINE, BUILD, CONSOLIDATE). If this file does not exist, note it as a TODO and skip.

---

### Run after completing Part B

```bash
docker compose run --rm flyway migrate
```

Then run tests.

---

### Constraints

- Tests must not require a database connection. Mock the DB or use hardcoded fixture data.
- Match the existing test runner and assertion style used elsewhere in the project.
- Do not modify any existing passing tests.
- Do not add unnecessary test fixtures — inline small fixture data directly in the test file.

### Deliver

1. All new/modified file contents.
2. Test run output showing all tests passing.
3. Confirmation that `POST /api/program/generate` with `programType: "strength"` succeeds.
4. A list of any TODOs deferred to future prompts (e.g. conditioning, Hyrox, missing rep rules file).
