# Rep Rules Admin — Implementation Spec

## A. Codebase Findings

### A1. Rep Rule Matching Model

**Source of truth:** `api/engine/repRuleMatcher.js` — `ruleMatches()`, `pickBestRule()`, `pickBestRuleWithFallback()`

**Matching dimensions** (all optional on a rule — NULL means "match any"):

| Column | Matching behaviour |
|---|---|
| `program_type` | Required exact match — only field that is never nullable |
| `day_type` | Exact match if set on rule |
| `segment_type` | Exact match if set on rule |
| `purpose` | Exact match if set on rule |
| `movement_pattern` | Exact match if set on rule |
| `swap_group_id_2` | Exact match if set on rule |
| `movement_class` | Exact match if set on rule |
| `equipment_slug` | Exact match if set on rule |
| `target_regions_json` | Overlap check if set on rule |

**Selection algorithm** (`pickBestRule`): filter to matching rules → highest `priority` wins → tie-break by specificity score (count of non-null dimensions) → tie-break lexicographically by `rule_id`.

**Fallback** (`pickBestRuleWithFallback`): first attempts exact item context match; if no rule found, zeroes out `movement_pattern`, `swap_group_id_2`, `movement_class`, `equipment_slug`, `target_regions` and retries. The fallback path is flagged with `viaFallback: true` in debug output.

**Step 04 integration** (`api/engine/steps/04_applyRepRules.js`):

- At line 149: `const dayType = s(day.day_type)` — reads `day_type` from the day object directly
- Passes it to `makeItemContext({ programType, schemaVersion, dayType, purpose, segType, ex })`
- The context propagates through `ruleMatches()` at line 121: `if (rule.day_type && rule.day_type !== ctx.day_type) return false`
- **`day_type` is already fully wired end-to-end.** No code changes are required to the matching engine.

**Key implication:** Rep rules match against the *selected exercise's* taxonomy (`sw2`, `mp`, `equipment_slug`), not the config slot's definition. The connection between a slot and a rep rule is indirect, mediated by the exercise catalogue.

### A2. `day_type` Gap — Simulation Days

The pipeline's `day_type` propagation is complete but currently unused for HYROX simulation days. The simulation day template in the HYROX config has:

```json
{ "day_key": "sim_day_1", "focus": "simulation", "is_ordered_simulation": true }
```

There is no `day_type` field on this template object. As a result `day.day_type` evaluates to `""` in Step 04, and all current HYROX rep rules (which have `day_type = NULL`) match normally. This is correct default behaviour.

To support simulation-specific prescriptions (e.g. full HYROX race distances on a simulation day vs scaled training distances on a regular day), two things are needed:

1. Add `"day_type": "simulation"` to the simulation day template in the config JSON
2. Add seed rep rules with `day_type = 'simulation'` carrying the simulation-specific prescriptions

Both of these are additive. Existing behaviour is unaffected because existing rules have `day_type = NULL`.

### A3. Existing Seed State — HYROX Rules

Relevant rules in `migrations/R__seed_program_rep_rules.sql`:

| rule_id | day_type | sw2 | equipment_slug | rep_low | rep_high | reps_unit | priority | Status |
|---|---|---|---|---|---|---|---|---|
| `hyrx_global_fallback` | NULL | NULL | NULL | 10 | 15 | reps | 1 | keep |
| `hyrx_amrap_run_buy_in` | NULL | `locomotion_compound` | `treadmill` | 400 | 400 | m | 50 | deactivate (shadowed) |
| `hyrx_amrap_run_any_v2` | NULL | `run_interval` | NULL | 400 | 400 | m | 55 | keep |
| `hyrx_amrap_wallball` | NULL | `push_ballistic_compound` | NULL | 15 | 20 | reps | 50 | keep |
| `hyrx_amrap_ski_erg` | NULL | `cyclical_compound` | `ski_erg` | 250 | 300 | m | 55 | deactivate (shadowed by v2) |
| `hyrx_amrap_ski_erg_v2` | NULL | `ski_interval` | `ski_erg` | 250 | 300 | m | 60 | keep |
| `hyrx_amrap_row_erg` | NULL | `cyclical_compound` | `row_erg` | 250 | 300 | m | 55 | deactivate (shadowed by v2) |
| `hyrx_amrap_row_erg_v2` | NULL | `row_interval` | `row_erg` | 250 | 300 | m | 60 | keep |
| `hyrx_amrap_sled_push` | NULL | `sled_compound` | NULL | 20 | 20 | m | 55 | keep |
| `hyrx_amrap_sled_pull` | NULL | `sled_compound` | NULL | 20 | 20 | m | 55 | keep |
| `hyrx_amrap_farmer_carry` | NULL | `carry_compound` | NULL | 50 | 50 | m | 55 | keep |
| `hyrx_amrap_sandbag_lunge` | NULL | various | NULL | varies | varies | reps/m | 55 | keep |
| `hyrx_amrap_burpee` | NULL | various | NULL | varies | varies | reps | 50 | keep |
| Power rules: `hyrx_power_*` | NULL | various | NULL | varies | varies | reps | 60-80 | keep |

**v1/v2 duplicate issue:** `hyrx_amrap_ski_erg` (priority 55, sw2=`cyclical_compound`) is shadowed by `hyrx_amrap_ski_erg_v2` (priority 60, sw2=`ski_interval`) whenever the exercise has `sw2=ski_interval`. However v1 can still fire for exercises with `sw2=cyclical_compound` that are not ski ergs — a silent misprescription risk. Same for row_erg. These should be deactivated. `hyrx_amrap_run_buy_in` with `equipment_slug=treadmill` is shadowed by `hyrx_amrap_run_any_v2` with `sw2=run_interval` at higher priority. Deactivate the treadmill-specific rule.

**Simulation-day rules needed** (new seed rows, `day_type = 'simulation'`, priority 100):

These should prescribe race/simulation distances distinct from the training rules above:

| rule_id | day_type | sw2 | equipment_slug | rep_low | rep_high | reps_unit |
|---|---|---|---|---|---|---|
| `hyrx_sim_run` | simulation | `run_interval` | NULL | 1000 | 1000 | m |
| `hyrx_sim_ski_erg` | simulation | `ski_interval` | `ski_erg` | 1000 | 1000 | m |
| `hyrx_sim_row_erg` | simulation | `row_interval` | `row_erg` | 1000 | 1000 | m |
| `hyrx_sim_sled_push` | simulation | `sled_compound` | NULL | 25 | 25 | m |
| `hyrx_sim_sled_pull` | simulation | `sled_compound` | NULL | 25 | 25 | m |
| `hyrx_sim_farmer_carry` | simulation | `carry_compound` | NULL | 80 | 80 | m |
| `hyrx_sim_sandbag_lunge` | simulation | NULL | `sandbag` | 100 | 100 | m |
| `hyrx_sim_wallball` | simulation | `push_ballistic_compound` | NULL | 100 | 100 | reps |
| `hyrx_sim_burpee` | simulation | NULL | NULL | 1000 | 1000 | m |
| `hyrx_sim_global_fallback` | simulation | NULL | NULL | 10 | 15 | reps |

Note: distances above are illustrative. The admin UI will be the surface for adjusting them once seeded. Seed them at reasonable defaults and adjust via the UI.

**Fallback on substitution:** if a simulation day falls back to a substitute exercise (e.g. ski_erg → slamball), the substitute's taxonomy (`sw2=push_ballistic_compound`) will miss the `hyrx_sim_ski_erg` rule (which requires `sw2=ski_interval`). The matcher falls through to `hyrx_sim_wallball` (100 reps) or the simulation global fallback. This is correct — the prescription follows the selected exercise. The Feature 3 degradation metadata already surfaces this substitution visibly.

### A4. `program_rep_rule` Table Schema

```sql
id                  uuid PRIMARY KEY
rule_id             text UNIQUE NOT NULL        -- human-readable identifier
program_type        text NOT NULL
schema_version      int
is_active           boolean DEFAULT true
day_type            text NULLABLE
purpose             text NULLABLE
segment_type        text NULLABLE
movement_pattern    text NULLABLE
swap_group_id_2     text NULLABLE
equipment_slug      text NULLABLE
rep_low             int
rep_high            int
reps_unit           text
rir_target          int
rir_min             int
rir_max             int
tempo_eccentric     int
tempo_pause_bottom  int
tempo_concentric    int
tempo_pause_top     int
rest_after_set_sec  int
rest_after_round_sec int
logging_prompt_mode text
notes_style         text
priority            int NULLABLE
created_at          timestamptz
updated_at          timestamptz
```

### A5. Existing Admin Route Patterns

| File | Route prefix | Pattern |
|---|---|---|
| `api/src/routes/adminConfigs.js` | `/admin/configs/*` | REST CRUD, direct pool, `requireInternalToken` + `requireTrustedAdminOrigin` |
| `api/src/routes/adminNarration.js` | `/admin/narration/*` | Same pattern; use this as the primary reference |
| `api/src/routes/adminExerciseCatalogue.js` | `/admin/exercises/*` | Same pattern |

All routes use:
```js
import { pool } from "../db.js";
import { requireInternalToken, requireTrustedAdminOrigin } from "../middleware/auth.js";
import { publicInternalError } from "../utils/publicError.js";
import { auditLog } from "../utils/auditLog.js";
import { safeString } from "../utils/validate.js";
```

Nav links live in `api/admin/index.html` `.nav-row` and must be duplicated on each new admin page.

---

## B. Recommended Product Design

### B1. Editing Boundary

**Editable fields** (the prescription — safe to change via UI):

- `rep_low`, `rep_high` (numeric — represents reps, metres, or calories depending on `reps_unit`)
- `reps_unit` (dropdown: `reps`, `m`, `cal`, `seconds`)
- `rest_after_set_sec`, `rest_after_round_sec` (numeric, seconds)
- `logging_prompt_mode` (free text / dropdown of known values)
- `notes_style` (free text)
- `is_active` (toggle)

**Read-only fields** (the matching identity — changing these changes *which exercises the rule fires on*; requires a new seed row):

- `rule_id`, `program_type`, `schema_version`, `priority`, `day_type`, `segment_type`, `purpose`, `movement_pattern`, `swap_group_id_2`, `movement_class`, `equipment_slug`

**Rule creation** is in scope for v1 but guarded: the creation form requires `day_type` to be non-empty. This prevents casual authoring of new base rules (day_type=NULL) whose catalogue-wide implications are hard to reason about from the UI. Simulation-day rules (day_type=`simulation`) are the intended creation path.

### B2. Page Layout

Follow `api/admin/exercises.html` (full-page table, no separate sidebar) rather than `index.html` (sidebar + editor). The exercises page pattern is better suited to a dense reference table.

```
┌─ Header bar ──────────────────────────────────────────────────────────┐
│  Rep Rules    [+ New Simulation Rule]    Internal Token: [___] [Load] │
│  Nav: Config Editor | Health | Coverage | Exercises | Narration | Rep Rules │
├─ Filter bar ──────────────────────────────────────────────────────────┤
│  Program: [All ▼]   Day type: [All ▼]   Active: [Active only ▼]      │
├─ Results table ────────────────────────────────────────────────────── │
│  rule_id | day_type | sw2 | mp | equip | reps | unit | rest | active  │
│  ...     (inline-editable prescription cells)                         │
└───────────────────────────────────────────────────────────────────────┘
```

### B3. Key User Workflows

**Browse:** filter by `program_type` and `day_type`. Simulation rules are visually distinct (blue left border). Inactive rules are greyed.

**Edit prescription:** click a prescription cell (rep_low, rep_high, reps_unit, rest times) to edit inline. Tab moves between editable cells on the same row. A row-level Save button (or auto-save on blur) calls PATCH.

**Toggle active:** checkbox in the `active` column. Fires PATCH immediately with confirmation if deactivating.

**Create simulation rule:** `[+ New Simulation Rule]` button opens a creation drawer. `day_type` is pre-filled with `simulation` and locked. Author fills: `rule_id`, `program_type`, matching dimensions, prescription fields. Save calls POST.

**Inferred rule badge in config editor:** in the slot table of `admin/index.html`, a new "Rep Rule" column shows which rule would fire for that slot's sw2/mp combination in the currently loaded config's program_type. Badge is a link to the Rep Rules page filtered to that rule.

---

## C. Recommended API Design

### New file: `api/src/routes/adminRepRules.js`

Mounted in `server.js`:
```js
import { adminRepRulesRouter } from "./src/routes/adminRepRules.js";
app.use("/admin", adminRepRulesRouter);
app.get("/admin/rep-rules", (_req, res) => res.sendFile(join(__dirname, "admin/rep-rules.html")));
```

All routes protected by `requireInternalToken` + `requireTrustedAdminOrigin`.

### Endpoints

**`GET /admin/rep-rules`**
Query params: `program_type`, `day_type`, `is_active` (`true`/`false`/omit for all)
Returns: `{ rules: [...] }` all columns ordered by `program_type ASC, COALESCE(day_type, '') ASC, priority DESC NULLS LAST, rule_id ASC`

**`PATCH /admin/rep-rules/:rule_id`**
Updates prescription fields only. Server enforces whitelist — any matching-dimension field in the body is silently ignored (not rejected, to allow clients to send full row objects).
Whitelisted: `rep_low`, `rep_high`, `reps_unit`, `rest_after_set_sec`, `rest_after_round_sec`, `logging_prompt_mode`, `notes_style`, `is_active`
Returns: `{ ok: true, rule: {...} }`

**`POST /admin/rep-rules`**
Creates new rule. Requires `day_type` to be non-empty (guarded creation path).
Validates:
- `rule_id`: non-empty, no whitespace, not already existing (409 if duplicate)
- `program_type`: non-empty
- `day_type`: non-empty (enforce the guard)
- `rep_low`, `rep_high`: integers ≥ 0
- `reps_unit`: non-empty
- `priority`: integer ≥ 1 if provided; default 100
Returns: `{ ok: true, rule: {...} }`

---

## D. Incremental Implementation Plan for Codex

Each prompt is independently verifiable. Do not start the next until the previous passes its acceptance criteria.

---

### Prompt R0 — Reference data: seed cleanup and simulation-day rules

**Files to modify:** `migrations/R__seed_program_rep_rules.sql`

**Context:** This is a Flyway repeatable migration (prefix `R__`). It re-runs whenever the file checksum changes. All inserts use `WHERE NOT EXISTS` guards (idempotent for new rows). To deactivate an existing row, add an `UPDATE` statement after the existing `INSERT` block for that rule — use `UPDATE ... SET is_active = false WHERE rule_id = '...' AND is_active = true` so it is also idempotent on re-run.

**Read first:**
- `migrations/R__seed_program_rep_rules.sql` lines 677–820 (the v1/v2 rule pairs)
- `migrations/V14__create_program_config_rep_rules_narration_templates.sql` lines 20–72 (schema reference)

**Part A — Deactivate shadowed v1 rules**

After each of the following existing `INSERT ... WHERE NOT EXISTS` blocks, add an idempotent deactivation statement:

1. After `hyrx_amrap_run_buy_in` insert: deactivate it (shadowed by `hyrx_amrap_run_any_v2`)
2. After `hyrx_amrap_ski_erg` insert (the v1 with `sw2=cyclical_compound`): deactivate it
3. After `hyrx_amrap_row_erg` insert (the v1 with `sw2=cyclical_compound`): deactivate it

Form for each deactivation (add immediately after the WHERE NOT EXISTS block):
```sql
UPDATE public.program_rep_rule
SET is_active = false, updated_at = now()
WHERE rule_id = '<rule_id>' AND is_active = true;
```

**Part B — Add simulation-day rep rules**

Append a new section at the end of the file headed `-- ── HYROX simulation-day rules (day_type = 'simulation') ────────────────────`.

Add the following rules using the same INSERT pattern as the rest of the file. All have:
- `program_type = 'hyrox'`
- `day_type = 'simulation'`
- `schema_version = 1`
- `priority = 100`
- `segment_type = 'amrap'`
- `purpose = NULL`
- `rir_min = 0, rir_max = 0, rir_target = 0`
- `tempo_eccentric = 0, tempo_pause_bottom = 0, tempo_concentric = 0, tempo_pause_top = 0`
- `rest_after_set_sec = 0, rest_after_round_sec = 0`
- `logging_prompt_mode = NULL, notes_style = NULL`

Rules:

| rule_id | movement_pattern | swap_group_id_2 | equipment_slug | rep_low | rep_high | reps_unit |
|---|---|---|---|---|---|---|
| `hyrx_sim_run` | `locomotion` | `run_interval` | NULL | 1000 | 1000 | `m` |
| `hyrx_sim_ski_erg` | `cyclical_engine` | `ski_interval` | `ski_erg` | 1000 | 1000 | `m` |
| `hyrx_sim_row_erg` | `cyclical_engine` | `row_interval` | `row_erg` | 1000 | 1000 | `m` |
| `hyrx_sim_sled_push` | `sled_push` | `sled_compound` | NULL | 25 | 25 | `m` |
| `hyrx_sim_sled_pull` | `sled_pull` | `sled_compound` | NULL | 25 | 25 | `m` |
| `hyrx_sim_farmer_carry` | `carry` | `carry_compound` | NULL | 80 | 80 | `m` |
| `hyrx_sim_sandbag_lunge` | NULL | NULL | `sandbag` | 100 | 100 | `m` |
| `hyrx_sim_wallball` | `push_ballistic` | `push_ballistic_compound` | NULL | 100 | 100 | `reps` |
| `hyrx_sim_burpee` | `locomotion` | NULL | NULL | 80 | 80 | `m` |
| `hyrx_sim_global_fallback` | NULL | NULL | NULL | 10 | 15 | `reps` |

`hyrx_sim_global_fallback` has `priority = 1` (lowest), `segment_type = NULL` — it is the catch-all for any simulation-day exercise not matched by a more specific rule.

**Part C — Add `day_type` field to HYROX simulation day template**

In `api/data/export_Hyrox-ProgramGenerationConfigs-supplement_2026-03-29.csv`, the simulation day template JSON object currently has `"focus":"simulation"` and `"is_ordered_simulation":true` but no `"day_type"` field.

Add `"day_type":"simulation"` alongside `"focus":"simulation"` in each ordered simulation day template object in that CSV.

**Important:** this is a CSV file containing embedded JSON. Edit carefully — the JSON is inside quoted CSV cells. After editing, verify the JSON remains valid by parsing it mentally or with a tool.

**Acceptance criteria:**
- [ ] `docker compose run --rm flyway migrate` completes without error
- [ ] `SELECT rule_id, is_active FROM program_rep_rule WHERE rule_id IN ('hyrx_amrap_run_buy_in', 'hyrx_amrap_ski_erg', 'hyrx_amrap_row_erg')` returns `is_active = false` for all three
- [ ] `SELECT count(*) FROM program_rep_rule WHERE day_type = 'simulation'` returns 10
- [ ] `SELECT rule_id, rep_low, reps_unit FROM program_rep_rule WHERE day_type = 'simulation' ORDER BY rule_id` shows all 10 new rules with correct prescriptions
- [ ] Running `node api/scripts/check_seeds.mjs` passes (update smoke checks if needed — see Part D)

**Part D — Update smoke checks if needed**

Read `api/scripts/sql/smoke_seed_checks.sql`. If it asserts a specific count of HYROX rep rules or active rep rules, update that count to match the new total. Apply the same update to `api/scripts/check_seeds.mjs` if it has hardcoded counts.

---

### Prompt R1 — API routes: PATCH + POST + GET

**Files to create:** `api/src/routes/adminRepRules.js`
**Files to modify:** `api/server.js`

**Read first:**
- `api/src/routes/adminNarration.js` — full file (use as the primary pattern reference)
- `api/src/routes/adminConfigs.js` — for any pattern differences
- `migrations/V14__create_program_config_rep_rules_narration_templates.sql` lines 20–72 (schema)

**Implementation:**

Create `api/src/routes/adminRepRules.js` exporting `adminRepRulesRouter`.

Use the same imports and middleware as `adminNarration.js`:
```js
import express from "express";
import { pool } from "../db.js";
import { requireInternalToken, requireTrustedAdminOrigin } from "../middleware/auth.js";
import { publicInternalError } from "../utils/publicError.js";
import { auditLog } from "../utils/auditLog.js";
import { safeString } from "../utils/validate.js";
```

**Constants:**

```js
const PRESCRIPTION_FIELDS = new Set([
  "rep_low", "rep_high", "reps_unit",
  "rest_after_set_sec", "rest_after_round_sec",
  "logging_prompt_mode", "notes_style", "is_active",
]);

const KNOWN_REPS_UNITS = new Set(["reps", "m", "cal", "seconds"]);
```

**`GET /admin/rep-rules`:**

Query params: `program_type`, `day_type`, `is_active` (`true`/`false`/omit).

Select all columns from `program_rep_rule`. Apply WHERE clauses for each non-empty param. For `day_type`, support the special value `"__none__"` to filter for rows where `day_type IS NULL`.

Order: `program_type ASC, COALESCE(day_type, '') ASC, priority DESC NULLS LAST, rule_id ASC`.

Returns: `{ rules: [...] }`.

**`PATCH /admin/rep-rules/:rule_id`:**

1. Fetch existing row by `rule_id`. 404 if not found.
2. Build update SET clause from request body, including only keys present in `PRESCRIPTION_FIELDS`. If body contains no whitelisted keys, return 400 `"No editable fields provided"`.
3. Validate:
   - `rep_low`, `rep_high`: if present, must be integers ≥ 0
   - `reps_unit`: if present, must be in `KNOWN_REPS_UNITS` (reject unknown values)
   - `rest_after_set_sec`, `rest_after_round_sec`: if present, integers ≥ 0
   - `is_active`: if present, boolean
4. Build parameterised UPDATE, always append `updated_at = now()`.
5. RETURNING all columns.
6. `auditLog` with action `"update"`, entity `"program_rep_rule"`, entityId `rule_id`.
7. Returns `{ ok: true, rule: {...} }`.

**`POST /admin/rep-rules`:**

1. Validate:
   - `rule_id`: non-empty, no whitespace
   - `program_type`: non-empty
   - `day_type`: non-empty (guard — reject with 400 `"day_type is required for new rules (base rules must be added via seed migration)"` if empty or missing)
   - `priority`: integer ≥ 1 if provided; default `100`
   - `rep_low`, `rep_high`: integers ≥ 0
   - `reps_unit`: in `KNOWN_REPS_UNITS`
2. Check for duplicate `rule_id`. 409 if exists.
3. INSERT with all provided fields. Nullable matching dimensions default to NULL if not provided.
4. `auditLog` with action `"create"`.
5. Returns `{ ok: true, rule: {...} }`.

**Mount in `api/server.js`:**

Follow the pattern of the narration router mounting. Add:
```js
import { adminRepRulesRouter } from "./src/routes/adminRepRules.js";
// ...
app.use("/admin", adminRepRulesRouter);
app.get("/admin/rep-rules", (_req, res) => res.sendFile(join(__dirname, "admin/rep-rules.html")));
```

**Acceptance criteria:**
- [ ] `GET /admin/rep-rules` returns all active rules with correct shape (requires valid internal token)
- [ ] `GET /admin/rep-rules?program_type=hyrox&day_type=simulation` returns only the 10 simulation rules
- [ ] `GET /admin/rep-rules?day_type=__none__` returns only rules where day_type IS NULL
- [ ] `PATCH /admin/rep-rules/hyrx_sim_ski_erg` with `{ "rep_low": 500, "rep_high": 500 }` updates successfully and `updated_at` changes
- [ ] `PATCH` with `{ "movement_pattern": "squat" }` returns 400 (no editable fields)
- [ ] `PATCH` with `{ "reps_unit": "invalid" }` returns 400 with validation error
- [ ] `POST` with `day_type` empty/missing returns 400 with the guard message
- [ ] `POST` with valid body including `day_type = "simulation"` creates the row; duplicate `rule_id` returns 409
- [ ] Invalid token returns 401 on all routes

---

### Prompt R2 — Config editor: `day_type` field on day templates

**Files to modify:** `api/admin/index.html`

**Context:** The config editor in `admin/index.html` renders day templates as tabs. Each day tab shows day-level settings followed by a slot table. The existing day-level fields include `is_ordered_simulation` checkbox, `day_selection_mode` dropdown, and `day_key`. This prompt adds `day_type` as a new day-level field.

**Read first:**
- `api/admin/index.html` — search for `is_ordered_simulation` to find the day-level rendering section (the area where the day tab content is built)
- Search for `day_selection_mode` — it sits alongside `is_ordered_simulation` and this new field should be in the same cluster

**Task:**

In the day template editor section (wherever `is_ordered_simulation` and `day_selection_mode` are rendered):

1. Add a new labelled row: **Day Type** with a text `<input>` that reads/writes `day.day_type`.
2. The input should have a `<datalist>` populated from the distinct `day_type` values found in the currently loaded rep rules (if rep rules are available client-side) plus a hardcoded entry for `simulation`. Since rep rules are not loaded in the config editor, hardcode the datalist with at least `simulation` as a suggested value. Keep it extensible (free text input, not a select).
3. When the `is_ordered_simulation` checkbox is toggled ON and the day_type input is currently empty, auto-populate it with `"simulation"`. Do not overwrite a non-empty value.
4. Serialization: when the config editor serializes a day object for save, include `day_type` in the output if non-empty; omit (delete from object) if empty.

**Placement:** directly below or alongside the `is_ordered_simulation` / `day_selection_mode` row, not buried in an advanced section.

**Acceptance criteria:**
- [ ] Day template editor shows a "Day Type" field for each day tab
- [ ] Toggling "ordered simulation" when day_type is empty auto-fills it with `"simulation"`
- [ ] Toggling "ordered simulation" when day_type already has a value does not overwrite it
- [ ] Saving a config with `day_type: "simulation"` on a day and reloading preserves the value
- [ ] Saving a config with an empty day_type field does not persist a `day_type` key on the day object (no empty string in JSON)
- [ ] The datalist suggests `"simulation"` as an option

---

### Prompt R3 — Rep Rules admin page: table with filters

**Files to create:** `api/admin/rep-rules.html`

**Context:** This is a standalone HTML page (no bundler, inline script). Follow `api/admin/exercises.html` as the structural pattern — full-page table, internal token input at top, filter bar, results table.

**Read first:**
- `api/admin/exercises.html` — full file (structural and CSS pattern)
- `api/admin/index.html` — the `.nav-row` block (copy nav links)

**Page structure:**

```html
<!DOCTYPE html>
<html>
<head>
  <title>Rep Rules — Admin</title>
  <!-- same CSS variables and base styles as exercises.html -->
</head>
<body>
  <!-- nav bar (same links as other admin pages, add "Rep Rules" as current) -->
  <!-- header: "Rep Rules" title, [+ New Simulation Rule] button (disabled until loaded) -->
  <!-- token row: Internal token input + [Load] button -->
  <!-- filter bar: Program type dropdown | Day type dropdown | Active filter dropdown -->
  <!-- status/error bar -->
  <!-- results table -->
  <!-- creation drawer (placeholder, implemented in R4) -->
</body>
</html>
```

**Filter bar:**

- **Program type:** `<select>` with options: All, hypertrophy, strength, conditioning, hyrox (hardcoded — these are the known program types)
- **Day type:** `<select>` with options: All, simulation, (base rules only) — populated dynamically from loaded rules; `(base rules only)` maps to `day_type IS NULL` filter
- **Show:** `<select>` with options: Active only (default), Include inactive, Inactive only

Filters apply client-side after initial load (load all rules once, filter in JS).

**Results table columns:**

| Column | Editable | Notes |
|---|---|---|
| `rule_id` | No | Text, truncated if long; full value in title attr |
| `day_type` | No | Badge — blue for `simulation`, grey dash for NULL |
| `sw2` | No | Small monospace text |
| `mp` (movement_pattern) | No | Small monospace text |
| `equip` (equipment_slug) | No | Small monospace text |
| `reps` | Yes (R4) | Shows `rep_low–rep_high` or single value |
| `unit` | Yes (R4) | `reps_unit` |
| `rest` | Yes (R4) | `rest_after_set_sec` s |
| `active` | Yes (R4) | Checkbox |
| Actions | — | Edit button (opens drawer, R4) |

For this prompt, render all columns but mark the editable ones as read-only for now (will be wired in R4). Use `<td class="editable" data-field="rep_low" data-rule-id="...">` on editable cells so R4 can attach event handlers without re-rendering.

**Row colouring:**

- Blue left border: `day_type` is non-null (day-type-scoped rule)
- Grey / reduced opacity: `is_active = false`
- No border: base rule (day_type NULL)

**Loading state:** show spinner / "Loading…" while fetch is in flight. Show error message if fetch fails (e.g. token rejected).

**Empty state:** if filters produce no results, show "No rules match the current filters."

**Acceptance criteria:**
- [ ] Page loads at `/admin/rep-rules`
- [ ] Token input + Load fetches and displays all rules
- [ ] Program type filter reduces results correctly
- [ ] Day type filter: "simulation" shows only simulation rules; "(base rules only)" shows only NULL day_type rules
- [ ] Active filter works
- [ ] Simulation rules have blue left border
- [ ] Inactive rules are visually distinct
- [ ] Column headers match the spec
- [ ] Nav links present (including link back to Config Editor, Health, etc.)

---

### Prompt R4 — Rep Rules page: inline editing and rule creation

**Files to modify:** `api/admin/rep-rules.html`

**Context:** The table from R3 has editable cells marked with `data-field` and `data-rule-id`. This prompt wires the editing behaviour and adds the creation drawer.

**Read first:**
- `api/admin/rep-rules.html` (from R3)
- `api/admin/exercises.html` — drawer slide-in pattern
- The PATCH and POST endpoints from R1

**Part A — Inline editing**

Make the following cells inline-editable on click: `rep_low`, `rep_high`, `reps_unit`, `rest_after_set_sec`, `rest_after_round_sec`.

Behaviour:

1. Click on an editable cell → cell contents replaced with an `<input>` (or `<select>` for `reps_unit`)
2. `reps_unit` renders as a `<select>` with options: `reps`, `m`, `cal`, `seconds`
3. Numeric fields render as `<input type="number" min="0">`
4. On blur or Enter key: if value changed, call `PATCH /admin/rep-rules/:rule_id` with `{ [field]: newValue }`
5. On success: update cell value in DOM, briefly flash the row green
6. On failure: revert cell to original value, show an inline error notification (toast or status bar)
7. Escape key: cancel editing, revert to original value

**Active toggle:**

The `active` column checkbox calls PATCH with `{ is_active: false/true }` immediately on change. If deactivating, show a `confirm()` dialog first: `"Deactivate rule <rule_id>? It will stop firing in the pipeline."`.

**Part B — Creation drawer**

Opening: clicking `[+ New Simulation Rule]` opens a slide-in drawer from the right.

Drawer form fields (in order):

1. **Rule ID** — text input, required, no whitespace; hint text: "e.g. hyrx_sim_mystation"
2. **Program type** — `<select>`: hypertrophy, strength, conditioning, hyrox
3. **Day type** — text input, pre-filled with `"simulation"`, locked (readonly); small note: "New rules require a day type. To add base rules, use the seed migration."
4. **Priority** — number input, default 100, min 1
5. **Matching dimensions** (all optional — leave blank for "match any"):
   - Segment type — text input with datalist: `single`, `superset`, `giant_set`, `amrap`, `emom`
   - Purpose — text input with datalist: `main`, `secondary`, `accessory`
   - Movement pattern — text input (free text)
   - sw2 (swap_group_id_2) — text input (free text)
   - Equipment slug — text input (free text)
6. **Prescription** (required):
   - Rep low — number input ≥ 0
   - Rep high — number input ≥ 0
   - Reps unit — `<select>`: `reps`, `m`, `cal`, `seconds`
   - Rest after set (sec) — number input ≥ 0
7. **is_active** — checkbox, default checked

**Validation (client-side before POST):**

- Rule ID: non-empty, no whitespace
- Program type: selected
- Rep low, rep high: valid non-negative integers
- Reps unit: selected
- Rule ID uniqueness is server-validated (409 response shown inline)

**On save:**

- POST to `/admin/rep-rules`
- On success: close drawer, prepend new row to table (or refresh), flash new row
- On 409: show inline error "Rule ID already exists"
- On other error: show inline error in drawer

**Acceptance criteria:**
- [ ] Clicking rep_low cell opens an input; changing and pressing Enter calls PATCH and updates the cell
- [ ] Changing reps_unit via dropdown calls PATCH immediately on change
- [ ] Escape cancels without saving
- [ ] Failed PATCH shows error and reverts cell value
- [ ] Active checkbox deactivation shows confirm dialog, then calls PATCH
- [ ] `[+ New Simulation Rule]` opens drawer with simulation pre-filled and locked
- [ ] Valid form saves rule, new row appears in table
- [ ] Duplicate rule_id shows 409 error inline in drawer
- [ ] Empty rule_id or missing reps_unit shows client-side validation error before POST

---

### Prompt R5 — Config editor: inferred rep rule badge on slot rows

**Files to modify:** `api/admin/index.html`

**Context:** The config editor slot table already has columns for sw2, mp, family, variability policy, etc. This prompt adds a "Rep Rule" column showing which rule would fire for a slot's primary sw2/mp, given the current config's program_type. This is a read-only hint — it does not affect saving.

**Read first:**
- `api/admin/index.html` — search for the slot table header row (look for `<th>` elements including "sw2 / sw2Any", "mp", "Family") to find the slot render function
- The column header is near line 831 or 1043 (two separate table headers — one for normal slots, one for simulation slots)
- `api/engine/repRuleMatcher.js` — `ruleMatches()` and `pickBestRule()` logic (you will port a simplified version to client-side JS)

**Part A — Load rep rules client-side**

Add a function `loadRepRules(token)` that calls `GET /admin/rep-rules` (with the admin token) and caches the result in a module-level variable `_repRules = []`. Call this function after the exercise catalogue is loaded (the config editor already loads exercises for sw/sw2 autocomplete — add rep rules to the same load sequence).

If the fetch fails (network error, token not yet set, etc.) set `_repRules = []` and continue silently — the badge simply won't render.

**Part B — Client-side rule matching**

Add a function `inferRepRule(slot, programType, dayType)`:

```js
function inferRepRule(slot, programType, dayType) {
  if (!_repRules.length || !programType) return null;
  const sw2 = (slot.sw2 || "").toLowerCase().replace(/-/g, "_");
  const mp = (slot.mp || "").toLowerCase().replace(/-/g, "_");
  const ctx = {
    program_type: programType.toLowerCase(),
    day_type: (dayType || "").toLowerCase(),
    segment_type: "",   // not known at slot level
    purpose: "",        // not known at slot level
    movement_pattern: mp,
    swap_group_id_2: sw2,
    movement_class: "",
    equipment_slug: "",
    target_regions: [],
  };
  // Port of pickBestRule: filter rules where all set dimensions match ctx, pick highest priority
  let best = null;
  for (const rule of _repRules) {
    if (rule.program_type !== ctx.program_type) continue;
    if (rule.day_type && rule.day_type !== ctx.day_type) continue;
    if (rule.segment_type && rule.segment_type !== ctx.segment_type) continue;
    if (rule.purpose && rule.purpose !== ctx.purpose) continue;
    if (rule.movement_pattern && rule.movement_pattern !== ctx.movement_pattern) continue;
    if (rule.swap_group_id_2 && rule.swap_group_id_2 !== ctx.swap_group_id_2) continue;
    if (rule.equipment_slug && rule.equipment_slug !== ctx.equipment_slug) continue;
    const pri = Number.isFinite(rule.priority) ? rule.priority : 0;
    if (!best || pri > best.pri) best = { rule, pri };
  }
  return best ? best.rule : null;
}
```

Note: this is intentionally simplified (no specificity tiebreak, no sw2Any expansion) — it's a hint, not a guarantee.

**Part C — Add column to slot table**

In the slot table header row, add `<th>Rep Rule</th>` as the last column before the Actions column.

In the slot row render function, add a corresponding `<td>` that calls `inferRepRule(slot, currentProgramType, currentDayType)` where:
- `currentProgramType` is the program_type of the currently loaded config (derivable from the config's `program_type` field or from the config_key via a lookup)
- `currentDayType` is the `day_type` of the current day tab being rendered

If a rule is found, render a badge:
```html
<a class="rep-rule-badge" href="/admin/rep-rules?program_type=<pt>&day_type=<dt>" target="_blank"
   title="<rep_low>-<rep_high> <reps_unit>">
  <rule_id (truncated to ~20 chars)>
</a>
```

If sw2Any is non-empty (the slot has multiple sw2 values), show one badge per value, each resolving independently. Wrap in a `<div class="rep-rule-badges">`.

If no rule found, render a small warning badge: `<span class="rep-rule-none" title="No rep rule matched for this slot's sw2/mp">–</span>`.

**Part D — Simulation slots**

The simulation slot table (the separate table rendered when `is_ordered_simulation` is true) has its own header row. Add the same "Rep Rule" column there too, using the day's `day_type` value (which, after R2, will be `"simulation"` for simulation days).

**Acceptance criteria:**
- [ ] Rep rules load silently alongside exercises when a config is opened
- [ ] Normal slot rows show a "Rep Rule" column with a badge linking to the rep rules page
- [ ] Badge label shows the matched `rule_id` (truncated); title tooltip shows the prescription
- [ ] Slots with no sw2/mp match show `–` in the column
- [ ] Simulation slot rows (ordered simulation day) show simulation-specific rule badges when `day_type = "simulation"` is set on the day
- [ ] sw2Any slots show one badge per sw2 value
- [ ] Badge link opens rep-rules page filtered to that program_type and day_type
- [ ] Rep rules failing to load does not break the config editor (graceful degradation)

---

## E. Risks and Notes

### E1. Seed overwrite behaviour

`R__seed_program_rep_rules.sql` is a Flyway repeatable migration. If the file checksum changes, Flyway re-runs it. The deactivation `UPDATE` statements added in R0 are idempotent (`AND is_active = true`). New INSERT rows use `WHERE NOT EXISTS`. Admin-edited prescription values on seed-origin rows **will be overwritten** if Flyway re-runs after a seed file change. Document this on the rep-rules admin page as a visible warning.

Rows created via the admin UI (`POST`) have novel `rule_id` values that don't appear in the seed — these are safe from Flyway overwrite.

### E2. Inline editing concurrency

The inline edit flow does not implement optimistic locking. If two admin sessions edit the same rule simultaneously, the last write wins. This is acceptable for a low-traffic internal tool.

### E3. `reps` column ambiguity

The `rep_low`/`rep_high` fields represent different things depending on `reps_unit`: repetition count for `reps`, metres for `m`, calories for `cal`, seconds for `seconds`. The UI should label the column contextually — after R4, consider showing `250 m` rather than just `250` in the cell.

### E4. Config editor program_type derivation (R5)

The config editor may not always have the program_type directly on the config object at render time. It may be derivable from the `config_key` (e.g. `hyrox_default_v1` → `hyrox`) or from a top-level `program_type` field if present. Read the existing config serialization code in `admin/index.html` before assuming which field to use. Fall back to an empty string if not determinable — this causes `inferRepRule` to return null, which is safe.

### E5. Out of scope

- Editing matching dimensions (movement_pattern, sw2, etc.) — stays in seed migrations
- Deleting rules (deactivation via `is_active` toggle is the intended path)
- CSV import/export of rep rules
- Audit trail UI (audit log entries are written server-side but not surfaced in this feature)
