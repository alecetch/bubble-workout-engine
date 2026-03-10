# Codex Implementation Prompts — Pipeline Multi-Type Refactor

Four sequential prompts. Each must be executed and verified before the next begins.
The full spec is in `docs/pipeline-multi-type-spec.md`.
The design rationale is in `docs/pipeline-multi-type-design.md`.

---

## Prompt 6 — Config Management Admin Panel

### Context

You are working in the `bubble-workout-engine` Node/Express API codebase.
The codebase uses ESM (`import`/`export`) throughout. No CommonJS.
The database is Postgres, accessed via a shared `pg.Pool` exported from `api/src/db.js`.

You are building a **laptop-only admin panel** for editing `program_generation_config` rows without touching SQL. The full design spec is in `docs/architecture.md §9`.

The admin panel has two parts:
1. **Five new API routes** mounted at `/admin/*` in `api/server.js`, guarded by the existing `requireInternalToken` middleware from `api/src/middleware/auth.js`.
2. **A single-page frontend** at `admin/index.html` (a plain HTML + vanilla JS file in the repo root's `admin/` directory). It runs in a browser pointed at `http://localhost:3000` and calls the API routes via `fetch`.

---

### Files to read before writing anything

- `api/server.js` — understand how routers are imported and mounted; note the pattern for `app.use("/api", someRouter)`.
- `api/src/middleware/auth.js` — understand `requireInternalToken`; it checks the `x-internal-token` or `x-engine-key` header.
- `api/src/routes/importEmitter.js` — use this as the canonical example for creating a new route file (imports, router export, error handling pattern).
- `api/src/db.js` — understand the shared pool export.
- `migrations/R__seed_program_generation_config.sql` — understand the exact column names and the shape of `program_generation_config_json` JSONB.

---

### Part 1 — API routes

**Create `api/src/routes/adminConfigs.js`**

Export `adminConfigsRouter` from this file. All routes are guarded by `requireInternalToken`.

Implement these five routes:

**`GET /admin/configs`**
Query:
```sql
SELECT id, config_key, program_type, schema_version, is_active, updated_at
FROM public.program_generation_config
ORDER BY program_type ASC, config_key ASC
```
Return `{ configs: rows }`.

**`GET /admin/configs/:key`**
Query:
```sql
SELECT id, config_key, program_type, schema_version, is_active,
       total_weeks_default, notes,
       program_generation_config_json,
       progression_by_rank_json,
       week_phase_config_json,
       updated_at
FROM public.program_generation_config
WHERE config_key = $1
```
Return `{ config: row }`. 404 if not found.

**`PUT /admin/configs/:key`**
Body: `{ program_generation_config_json, progression_by_rank_json?, week_phase_config_json?, total_weeks_default?, notes?, is_active? }`

Validate that `program_generation_config_json` is a non-null object (not a string, not an array). Return 400 with `{ error: "program_generation_config_json must be a non-null object" }` if invalid.

Run a single UPDATE:
```sql
UPDATE public.program_generation_config
SET
  program_generation_config_json = $1,
  progression_by_rank_json       = COALESCE($2, progression_by_rank_json),
  week_phase_config_json         = COALESCE($3, week_phase_config_json),
  total_weeks_default            = COALESCE($4, total_weeks_default),
  notes                          = COALESCE($5, notes),
  is_active                      = COALESCE($6, is_active),
  updated_at                     = now()
WHERE config_key = $7
RETURNING id, config_key, program_type, is_active, updated_at
```
Return `{ ok: true, config: returning_row }`. 404 if no row was updated.

**`POST /admin/configs`**
Body: `{ source_key, new_key }` — duplicate an existing row under a new key.

Validate: `source_key` and `new_key` must be non-empty strings. Return 400 if either is missing. Return 409 if `new_key` already exists.

```sql
INSERT INTO public.program_generation_config
  (config_key, program_type, schema_version, is_active, notes,
   program_generation_config_json, progression_by_rank_json,
   week_phase_config_json, total_weeks_default, updated_at)
SELECT
  $2, program_type, schema_version, false,
  'Duplicated from ' || config_key,
  program_generation_config_json, progression_by_rank_json,
  week_phase_config_json, total_weeks_default, now()
FROM public.program_generation_config
WHERE config_key = $1
RETURNING id, config_key, program_type, is_active
```
Return `{ ok: true, config: returning_row }`. 404 if `source_key` not found.

**`PATCH /admin/configs/:key/activate`**
Body: `{ is_active: boolean }` — toggle active flag.

```sql
UPDATE public.program_generation_config
SET is_active = $1, updated_at = now()
WHERE config_key = $2
RETURNING id, config_key, program_type, is_active, updated_at
```
Return `{ ok: true, config: returning_row }`. 404 if not found.

All routes must return JSON. All DB errors must be caught and returned as `{ ok: false, error: err.message }` with status 500.

---

**Modify `api/server.js`**

Add the import and mount — in the same style as all other route mounts:
```js
import { adminConfigsRouter } from "./src/routes/adminConfigs.js";
// ...
app.use("/admin", adminConfigsRouter);
```
Place the `app.use` line with the other route mounts (before the error handlers).

Also add a line to serve the admin frontend as a static directory:
```js
app.use("/admin-ui", express.static(join(__dirname, "../admin")));
```
Place this immediately after the existing `/assets/media-assets` static serve line.

---

### Part 2 — Frontend

**Create `admin/index.html`**

A single HTML file. No build step, no npm dependencies. Uses vanilla JS (ES modules via `<script type="module">`) and inline `<style>`. Must work when opened at `http://localhost:3000/admin-ui/index.html`.

The `INTERNAL_API_TOKEN` value is read from a `<input id="token-input">` field that the user fills in once on load. All API calls include the header `x-internal-token: <value from that field>`. Store the token in `sessionStorage` so it persists across refreshes but not across browser sessions.

#### Layout

Two-column layout: narrow left sidebar (config list) + wide right editor panel.

**Left sidebar:**
- Heading: "Config Admin"
- List of config rows showing `config_key`, `program_type`, and a green dot (●) or grey dot (○) for `is_active`.
- Clicking a row loads it into the editor.
- A "+ New (duplicate)" button at the bottom of the list — prompts for `source_key` and `new_key` using `window.prompt`, then calls `POST /admin/configs`.

**Right editor panel — five collapsible sections:**

Each section is a `<details><summary>` element so it collapses natively.

**Header (always visible, above sections):**
- Config key (read-only text)
- Program type (read-only text)
- Active status toggle: checkbox labelled "Active"

**Section 1 — Builder: sets & budget**

A 5-row × 4-column table:
- Column headers: blank, "40 min", "50 min", "60 min"
- Rows: "Block A sets", "Block B sets", "Block C sets", "Block D sets", "Block budget"
- Each cell (except the label column) is a `<input type="number" min="0" max="20">`.
- Values read from / write to `config.builder.sets_by_duration` and `config.builder.block_budget`.

**Section 2 — Builder: day templates**

A tab strip. Each tab represents one day template from `config.builder.day_templates`. Tabs show `day_key`. A "+ Add day" button appends a new empty day.

Within each tab:
- "Day key" text input (editable)
- "Focus" text input (editable)
- A slot table with columns: #, Slot, sw2, sw, mp, requirePref (select), Loadable (checkbox), Fallback slot, and action buttons [↑] [↓] [✕].
- Each table row is one entry from `ordered_slots`. All fields are editable inputs/selects.
- "requirePref" is a `<select>` with options: `(none)`, `strength_main`, `hypertrophy_secondary`.
- Loadable is a checkbox for `preferLoadable`.
- [↑] / [↓] buttons move the row up/down in the array.
- [✕] removes the row.
- An "+ Add slot" button appends a new empty slot row.

**Section 3 — Segmentation**

A table of block letter rows (A, B, C, D — and any others present in the data). Columns: Block letter, Segment type (select: single/superset/giant_set), Purpose (select: main/secondary/accessory).
A "+ Add block" button appends a new row with an editable block letter input.

**Section 4 — Progression**

A table of fitness rank rows (beginner, intermediate, advanced, elite). Columns: Rank, Weekly set step (number input), Max extra sets (number input).

Below the table: "Apply progression to" — three checkboxes labelled "main", "secondary", "accessory". Values read from / write to `config.progression.apply_to_purposes`.

**Section 5 — Raw JSON** (collapsed by default)

A `<textarea>` showing the full `program_generation_config_json` as pretty-printed JSON. Editing this textarea and saving uses the raw value, overriding the structured sections. Include a "Format JSON" button that pretty-prints the current textarea content.

**Save / Discard buttons** (sticky at the bottom of the editor panel, always visible):
- **Save**: reads all structured section values plus the raw JSON textarea (if it has been edited), merges them into a single `program_generation_config_json` object, and calls `PUT /admin/configs/:key`. Also sends updated `progression_by_rank_json` and any `is_active` change in the same PUT body. On success, shows a brief "Saved ✓" indicator and refreshes the config list. On failure, shows the error message in red.
- **Discard**: reloads the current config from the API, discarding all unsaved changes.

#### Merging structured sections back to JSON on Save

When Save is clicked, build the final `program_generation_config_json` by:
1. Start from the current raw JSON (in case the user edited the raw textarea).
2. Overwrite `builder.sets_by_duration` from Section 1 inputs.
3. Overwrite `builder.block_budget` from Section 1 inputs.
4. Overwrite `builder.day_templates` from Section 2 (all day tabs, their focus, and their ordered_slots arrays).
5. Overwrite `segmentation.block_semantics` from Section 3.
6. Overwrite `progression.apply_to_purposes` from Section 4 checkboxes.
7. Build the `progression_by_rank_json` object separately (outside the main JSONB) from Section 4 rank rows and include it as a top-level PUT body field.

The raw textarea reflects the current in-memory JSON and is updated whenever a structured field changes (live sync). This means the raw textarea always shows what will be saved.

---

### Constraints

- All new API code must be ESM (`import`/`export`). No CommonJS.
- `admin/index.html` must be self-contained — no separate `.js` or `.css` files. All JS in `<script type="module">`, all styles in `<style>`.
- Do not modify any existing route files other than `api/server.js`.
- Do not modify any existing tests.
- Do not add npm dependencies to `api/package.json`.
- The frontend does not need to work without a running API — it is a developer tool.
- Keep the frontend functional over decorative. Clean, readable layout is sufficient.

---

### Deliver

1. Full content of `api/src/routes/adminConfigs.js`.
2. The exact diff for `api/server.js` (two lines added: one import, two `app.use` lines).
3. Full content of `admin/index.html`.
4. Brief description of any decisions made where the spec was ambiguous.

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

### Prerequisite fix — update `api/engine/resolveCompiledConfig.js`

The Phase 0 implementation hardcodes `dayTemplates: null`, `setsByDuration: null`, `blockBudget: null` in the `builder` section instead of reading from the parsed JSONB. Fix this now so that when Prompt 3 populates the seed, the values flow through automatically without a second change to this file.

Replace the `builder` section of the returned object:
```js
// WAS (hardcoded nulls):
builder: {
  dayTemplates:           null,
  setsByDuration:         null,
  blockBudget:            null,
  slotDefaults:           {},
  excludeMovementClasses: pgcJson?.builder?.exclude_movement_classes ?? ["cardio", "conditioning", "locomotion"],
},

// NOW (reads from pgcJson, falls back to null if key absent):
builder: {
  dayTemplates:           pgcJson?.builder?.day_templates    ?? null,
  setsByDuration:         pgcJson?.builder?.sets_by_duration ?? null,
  blockBudget:            pgcJson?.builder?.block_budget     ?? null,
  slotDefaults:           pgcJson?.builder?.slot_defaults    ?? {},
  excludeMovementClasses: pgcJson?.builder?.exclude_movement_classes ?? ["cardio", "conditioning", "locomotion"],
},
```

All values will still be `null` until the seed is updated in Prompt 3. This change has no effect on current behaviour.

---

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
- `api/engine/steps/01_buildProgramFromDefinition.js` — three bugs found during Prompt 2 review must be fixed before adding seed data.

### Prerequisite fixes (apply before any other changes)

Three bugs were identified in the Prompt 2 output. Apply them first.

---

**Fix 1 — Showstopper: `extractSlotsFromTemplate` reads wrong key**

In `api/engine/steps/01_buildProgramFromDefinition.js`, the function reads `template.slots` but the seed config uses `ordered_slots`. This means every day returns zero slots and zero blocks once the seed is populated.

```js
// WRONG (current code):
function extractSlotsFromTemplate(template) {
  if (Array.isArray(template)) return template;
  if (!template || typeof template !== "object") return [];
  if (Array.isArray(template.slots)) return template.slots;
  return [];
}

// CORRECT:
function extractSlotsFromTemplate(template) {
  if (Array.isArray(template)) return template;
  if (!template || typeof template !== "object") return [];
  if (Array.isArray(template.ordered_slots)) return template.ordered_slots;
  return [];
}
```

---

**Fix 2 — Hardcoded `"hypertrophy_secondary"` in slot loop**

In `api/engine/steps/01_buildProgramFromDefinition.js`, the slot processing loop contains a hardcoded override that sets `requirePref = "hypertrophy_secondary"` for all C and D blocks. This overrides the `applySlotDefaults` result and breaks program types (e.g. strength) that define different `requirePref` values in their `slot_defaults` config.

Remove these lines entirely — the `slot_defaults` config (applied via `applySlotDefaults`) already handles this for hypertrophy:

```js
// REMOVE these lines:
if ((blockLetter === "C" || blockLetter === "D") && !slotDef.requirePref) {
  slotDef.requirePref = "hypertrophy_secondary";
}
```

---

**Fix 3 — `resolveCompiledConfig.js` hardcodes `blockSemantics: null`**

In `api/engine/resolveCompiledConfig.js`, the `segmentation` section of the returned object hardcodes `blockSemantics: null` instead of reading from the parsed JSONB. Once the seed is populated the value will never flow through.

```js
// WRONG (current code):
segmentation: {
  blockSemantics: null,
},

// CORRECT:
segmentation: {
  blockSemantics: pgcJson?.segmentation?.block_semantics ?? null,
},
```

---

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

**Bug fix required:** The Phase 0 implementation validates `blockSemantics` as an array (`!Array.isArray(...)`), but `blockSemantics` is an object keyed by block letter (`{ "A": {...}, "B": {...} }`). The array check will throw the wrong error when the seed is populated. Fix the validation to treat `blockSemantics` as a plain object and iterate its entries with `Object.entries()`:

```js
// WRONG (Phase 0 code):
if (!Array.isArray(config.segmentation.blockSemantics)) {
  details.push("segmentation.blockSemantics must be an array when provided");
} else {
  for (let i = 0; i < config.segmentation.blockSemantics.length; i++) { ... }
}

// CORRECT:
if (typeof config.segmentation.blockSemantics !== "object" || Array.isArray(config.segmentation.blockSemantics)) {
  details.push("segmentation.blockSemantics must be a non-empty object");
} else if (Object.keys(config.segmentation.blockSemantics).length === 0) {
  details.push("segmentation.blockSemantics must be a non-empty object");
} else {
  for (const [letter, sem] of Object.entries(config.segmentation.blockSemantics)) {
    if (!sem?.purpose) details.push(`blockSemantics["${letter}"].purpose must be a non-empty string`);
    if (!["single", "superset", "giant_set"].includes(sem?.preferred_segment_type))
      details.push(`blockSemantics["${letter}"].preferred_segment_type must be one of single|superset|giant_set`);
  }
}
```

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

**Important — fixture format for `blockSemantics`**: The Prompt 3 implementation treats `blockSemantics` as a plain object keyed by block letter (not an array). Build fixtures like:
```js
blockSemantics: {
  A: { preferred_segment_type: "single",    purpose: "main" },
  B: { preferred_segment_type: "superset",  purpose: "secondary" },
  C: { preferred_segment_type: "giant_set", purpose: "accessory" },
  D: { preferred_segment_type: "single",    purpose: "accessory" },
}
```

**Important — error message substrings**: Match against these actual strings produced by the Prompt 3 `configValidation.js` implementation (use substring/`includes` checks, not exact equality):

| Description | Input | Expected substring in `details[]` |
|---|---|---|
| Valid hypertrophy config | Full valid config | Does not throw |
| Missing `programType` | `programType: ""` | `"programType must be a non-empty string"` |
| `builder` is null | `builder: null` | `"builder must be a non-null object"` |
| `dayTemplates` is empty | `builder.dayTemplates: []` | `"non-empty array"` |
| Slot block letter not in blockSemantics | Slot `"E:test"` with no `"E"` in semantics | `"missing in segmentation.blockSemantics"` |
| Unknown `selector_strategy` | `selector_strategy: "wizard_mode"` | `"selector_strategy must be one of"` |
| `blockSemantics` has bad `preferred_segment_type` | `{ A: { preferred_segment_type: "tabata", purpose: "main" } }` | `"must be one of single\|superset\|giant_set"` |
| Multiple errors at once | Two bad fields | Both error substrings present in `details[]` |

**`api/engine/__tests__/hypertrophyParity.test.js`**

Test that `buildProgramFromDefinition` produces structurally correct output. The old `buildBasicHypertrophyProgramStep` is NOT imported or compared against — the two steps use different slot definitions (string templates vs rich objects) so exercise picks will differ. "Parity" here means the output shape and structural invariants are preserved.

Setup: build a representative `inputs` object using a subset of exercise catalogue rows (at minimum 20 exercises covering squat_compound, hinge_compound, push_horizontal_compound, pull_horizontal_compound, quad_iso, hamstring_iso, glute_iso, arms swap groups, shoulder_iso, calf_iso). These can be hardcoded test fixtures — no DB connection required.

Build a representative `compiledConfig` with the full hypertrophy builder config (matching the seed values from Prompt 3). Construct this inline — do not import it from anywhere.

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

**Do not call `runPipeline` in these tests** — `runPipeline` requires mocking 5+ DB services (media assets, rep rules, narration templates, program generation config, DB pool). Instead, test `buildProgramFromDefinition` and `segmentProgram` directly with an inline `compiledConfig` built from the strength seed values.

Setup: build a strength `compiledConfig` inline with all required fields (matching the `strength_default_v1` seed added in Part B). Use the same exercise fixture pool as `hypertrophyParity.test.js` — or a subset of it.

Tests:
- `buildProgramFromDefinition` does not throw when called with `programType: "strength"` compiledConfig
- Output has `program.program_type === "strength"`
- Output has `program.schema === "program_strength_v1"`
- `program.days.length` equals the configured `days_per_week`
- Each day has at least one block with a real `ex_id`
- After passing output through `segmentProgram`, all segments have `segment_type === "single"` (strength block semantics are all `"single"`)
- Each day has at least one segment after segmentation

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

---

## Prompt 5 — Tidy Up: Fix Failing Legacy Tests + Audit Unsolicited resolveCompiledConfig Change

### Context

Prompts 1–4 are complete. All new tests pass. However two issues were flagged in the Prompt 4 delivery:

1. **Legacy integration tests are failing.** The strict `validateCompiledConfig` introduced in Prompt 3 changed the behaviour of the no-DB-row path. Existing tests that mock the DB to return empty PGC results (or pass no config_key) are now throwing `ConfigValidationError` where they previously succeeded. These tests were not modified in Prompt 4.

2. **`api/engine/resolveCompiledConfig.js` was modified without being in the spec.** Codex added "hardcoded fallback config JSON (builder/segmentation/progression) so strict validation can still pass in no-row fallback flows." This change was not requested and may be incorrect: if it injects hardcoded hypertrophy day templates as the fallback for ALL program types, a `programType: "strength"` request with no DB row would silently generate a hypertrophy-shaped program instead of failing with a clear error.

Your task is to fix both issues.

### Files you must read before writing anything

- `api/engine/resolveCompiledConfig.js` — read the full current file to understand exactly what was added in Prompt 4.
- Every test file that is currently failing — read each one in full before proposing fixes.
- `api/engine/configValidation.js` — understand what throws and when.

### Fix 1 — Audit and correct `resolveCompiledConfig.js`

Read the current file. Identify what was added to the hardcoded fallback path.

**Expected correct behaviour for the `source = "hardcoded"` path:**

When no DB PGC row is found (and no request override), the `compiledConfig` object should still be returned with `source: "hardcoded"`, but `builder` and `segmentation` fields should remain `null` / empty (as per the original design). `validateCompiledConfig` will then throw a `ConfigValidationError` with a clear message. This is the correct behaviour — fail fast with an explicit error rather than silently producing output using the wrong program type's templates.

**If Codex added a hardcoded hypertrophy builder block to the fallback:**

Remove it. The correct resolution is: if no PGC row is found, `resolveCompiledConfig` returns `source: "hardcoded"` with `builder.dayTemplates: null` and `segmentation.blockSemantics: null`, and `validateCompiledConfig` throws with:
> `"builder.dayTemplates must be a non-empty array"` and `"segmentation.blockSemantics must be a non-empty object"`

This gives the caller a clear signal to seed the DB with a config row for this program type.

**If the added code is scoped to hypertrophy only** (e.g. `if (programType === "hypertrophy") { ... }`), it is still wrong — the DB seed is the correct place for program-type-specific config, not `resolveCompiledConfig.js`. Remove it.

After the fix, verify the change does not break any currently-passing tests.

---

### Fix 2 — Fix failing legacy integration tests

Read every failing test in full. For each failing test, identify the root cause. There are two likely patterns:

**Pattern A — Test mocks DB to return no PGC rows, then calls the pipeline expecting it to work.** These tests were relying on the old silent fallback behaviour. Fix: provide an inline `request.program_generation_config_json` or `request.config_key` override so the test does not depend on the DB returning a PGC row. Use the full hypertrophy config JSON (matching the seed from Prompt 3) as the inline value. Do not change what the test is actually testing — just supply the config it needs.

**Pattern B — Test mocks or stubs `resolveCompiledConfig` / `validateCompiledConfig` and the mock is now stale.** Fix: update the mock to match the current return shape.

**Do not change test assertions** unless they are asserting something that the refactor intentionally changed (document any such cases). The goal is passing tests with minimal diff.

---

### Constraints

- Do not modify any currently-passing test.
- Do not add new test cases in this prompt — only fix failing ones.
- Do not introduce any new shared utilities or abstractions.
- All ESM.

### Deliver

1. The exact diff / full content of every file changed.
2. Full test run output showing zero failures.
3. A description of what was in the unsolicited `resolveCompiledConfig.js` change and what you did with it.
