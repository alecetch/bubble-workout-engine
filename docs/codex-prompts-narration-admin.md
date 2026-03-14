# Narration Admin Page — Implementation Spec

## A. Codebase Findings

### A1. Narration Matching Model

**Source of truth:** `api/engine/steps/05_applyNarration.js` — `findTemplatePool()` + `normalizeTemplates()`

**Hard filters** (template is excluded from consideration if mismatch):
- `scope` — exact match
- `field` — exact match
- `applies_json.program_type` — if set on template, must equal context program_type; if blank = generic/applies to all
- `applies_json.day_focus` — if set on template, must equal derived day focus; if blank = generic

**Soft scoring** (higher score wins; lower `priority` number breaks ties):

| Condition | Score delta |
|---|---|
| Base score | +1 |
| `purpose` matches AND template has purpose | +4 |
| `purpose` mismatches but template has explicit purpose | -1 |
| `segment_type` matches AND template has segment_type | +4 |
| `segment_type` mismatches but template has explicit type | -1 |
| BOTH purpose AND segment_type match | +10 additional |
| `applies_program_type` is set (any valid match) | +3 |
| `applies_day_focus` is set (any valid match) | +3 |

**Result:** Most specific template (highest score, then lowest priority number) wins. A template with `program_type=conditioning`, `purpose=main`, `segment_type=amrap` scores **25** (1+3+4+4+10+3) vs a generic with nothing set scoring **1**.

**`day_focus` is derived at runtime**, not taken from config directly. `dayFocusFromDay()` inspects the first main segment item's `slot` field:
- slot contains `squat` → `"Lower (Squat)"`
- slot contains `hinge` → `"Lower (Hinge)"`
- slot contains `push_horizontal` → `"Upper (Push)"`
- slot contains `pull_horizontal` or `pull_vertical` → `"Upper (Pull)"`
- slot contains `push_vertical` → `"Upper (Press)"`
- anything else → `"Hypertrophy"`

For conditioning, the main slot is always `A:engine`, `A:locomotion` etc. — these don't contain those keywords, so `day_focus` always falls through to `"Hypertrophy"`. This means `applies_day_focus` targeting is currently ineffective for conditioning programs unless slot names are revised.

**Known bug (from MEMORY.md):** `toInt(r.priority, 1)` in `normalizeTemplates` — NULL priority is treated as `1`, colliding with explicit priority-1 rows. Not fixed yet. When the narration admin saves a new row with no priority, the admin UI must default to a high number (e.g. 10) to avoid this collision.

### A2. All (scope, field) pairs the engine actually queries

```
program    / PROGRAM_TITLE
program    / PROGRAM_SUMMARY
program    / PROGRESSION_BLURB
program    / SAFETY_BLURB
week       / WEEK_TITLE
week       / WEEK_FOCUS
week       / WEEK_NOTES
day        / DAY_TITLE
day        / DAY_GOAL
day        / TIME_BUDGET_HINT
day        / WARMUP_TITLE
day        / WARMUP_GENERAL_HEAT
day        / RAMP_SETS_TEXT
segment    / SEGMENT_TITLE         (with purpose + segment_type)
segment    / SEGMENT_EXECUTION     (with segment_type)
segment    / SEGMENT_INTENT        (with purpose)
transition / SETUP_NOTE            (with segment_type)
transition / TRANSITION_NOTE       (with segment_type)
transition / PACE_NOTE             (generic)
exercise   / EXERCISE_LINE         (with purpose)
exercise   / CUE_LINE              (generic — fetched once per day)
exercise   / LOAD_HINT             (generic — fetched once per day)
exercise   / LOGGING_PROMPT        (generic — fetched once per day)
```

### A3. Narration template schema

```sql
template_id     text PRIMARY KEY
scope           text          -- program / week / day / segment / transition / exercise
field           text          -- DAY_TITLE, SEGMENT_EXECUTION, etc.
purpose         text NULLABLE -- main / secondary / accessory / warmup / cooldown
segment_type    text NULLABLE -- single / superset / giant_set / amrap / emom
priority        int NULLABLE  -- lower = higher priority; NULL treated as 1 (bug, see above)
text_pool_json  jsonb         -- array of strings; engine picks deterministically by hash
applies_json    jsonb NULLABLE -- { program_type?, day_focus?, phase? }
is_active       boolean
created_at, updated_at
```

`applies_json` can contain: `program_type`, `day_focus`, `phase`. Only `program_type` and `day_focus` are extracted and used in matching. `phase` is stored on a few strength rows but **is not read by the engine** in `findTemplatePool` — it is inert.

### A4. Current admin UI structure

| File | Route | Pattern |
|---|---|---|
| `api/admin/index.html` | `/admin-ui/` | Sidebar list + structured editor, direct DB writes |
| `api/admin/exercises.html` | `/admin/exercises` | Full-page table + slide-in drawer, direct DB writes |
| `api/admin/coverage.html` | `/admin/coverage` | Read-only diagnostic report |
| `api/src/routes/adminConfigs.js` | `/admin/configs/*` | REST CRUD, direct DB |
| `api/src/routes/adminExerciseCatalogue.js` | `/admin/exercises/*` | REST CRUD, direct DB |
| `api/src/routes/adminCoverage.js` | `/api/admin/coverage-report` | Read-only, no writes |

Nav links live in the sidebar of `api/admin/index.html` and must be updated for each new page.

### A5. Persistence model — authoritative finding

**Use direct DB writes. Same model as `adminConfigs.js` and `adminExerciseCatalogue.js`.**

Rationale:
- `R__seed_narration_template.sql` uses `ON CONFLICT (template_id) DO UPDATE` — it will overwrite seed-derived rows if Flyway re-runs the migration (i.e. if the SQL file checksum changes)
- However, rows with **new template_ids** (created via admin UI) are completely safe from Flyway
- The `adminConfigs.js` precedent is direct DB writes; narration is the same class of "seeded but admin-editable" data
- Generating Flyway migration files from a browser admin tool would require filesystem access from the API container — too fragile, wrong architecture for this stack

**The expected workflow:**
1. Iterate and validate in the admin UI (direct DB)
2. Once confirmed, manually update `R__seed_narration_template.sql`
3. Commit the SQL — this is the durable record for new environments

---

## B. Recommended Product Design

### B1. Page layout

Follow the `exercises.html` pattern: **full-page table with a slide-in drawer** for editing.

```
┌─ Header bar ──────────────────────────────────────────────────────────┐
│  Narration Templates    [+ New]    [Coverage Report ▼]                │
│  Nav: Config Editor | Coverage | Exercises | Narration                │
├─ Filter bar ──────────────────────────────────────────────────────────┤
│  Program type: [All ▼]  Scope: [All ▼]  Field: [All ▼]              │
│  Purpose: [All ▼]  Segment type: [All ▼]  Show: [Active only ▼]     │
│  [Search template_id / text…]                                         │
├─ Results table ────────────────────────────────────────────── drawer ─┤
│  template_id | scope | field | purpose | seg_type | program | pri | … │ ← slide-in
│  ...                                                                   │    edit/clone
│  [Coverage gaps panel — collapsible, shown when program filter set]    │
└───────────────────────────────────────────────────────────────────────┘
```

### B2. Key user workflows

**Browse & filter** — filter bar at top, auto-applies on change, no submit needed.

**Edit a template** — click row → drawer opens. Drawer shows all fields with appropriate inputs. Save writes to DB. Dirty warning on close.

**Clone a template** — "Clone" button in drawer or row action → opens drawer pre-filled, `template_id` cleared + appended `_copy`, ready to edit and save as new row.

**Coverage diagnostics** — shown in a collapsible panel below the filter bar, auto-generated when a specific program_type is selected. Shows gaps (expected but missing), fallback coverage, and shadowed templates.

**Preview match** — from any row, "Preview match" opens a small modal showing what score the template gets for a specified context (scope+field+purpose+segment_type+program_type+day_focus).

---

## C. Recommended API Design

### New file: `api/src/routes/adminNarration.js`

Mounted in `server.js`:
```js
import { adminNarrationRouter } from "./src/routes/adminNarration.js";
app.use("/admin", adminNarrationRouter);
```

All routes protected by `requireInternalToken`.

### Endpoints

**`GET /admin/narration/templates`**
Query params: `program_type`, `scope`, `field`, `purpose`, `segment_type`, `is_active`, `q` (text search on template_id and text_pool_json)
Returns: `{ templates: [...] }` — all columns including `applies_json`, `text_pool_json`

**`GET /admin/narration/templates/:template_id`**
Returns: `{ template: {...} }`

**`PUT /admin/narration/templates/:template_id`**
Body: all editable fields. Validates:
- `template_id` non-empty, no spaces
- `scope` in known set
- `field` non-empty
- `priority` integer ≥ 1 (never null — UI always sends a number)
- `text_pool_json` valid JSON array of non-empty strings (min 1)
- `applies_json` valid JSON object or null
Returns: `{ template: {...} }`

**`POST /admin/narration/templates`**
Creates new row. Same validation. 409 if template_id already exists.
Returns: `{ template: {...} }`

**`DELETE /admin/narration/templates/:template_id`**
Soft delete: sets `is_active = false`. No hard deletes.
Returns: `{ ok: true }`

**`GET /admin/narration/coverage?program_type=<type>`**
Returns the coverage analysis object (see Section E).
This is a pure read — queries `narration_template` + `program_generation_config`.

---

## D. Recommended UI Design

### D1. Filter bar

Dropdowns: `program_type` (dynamic from DB + "All"), `scope` (hardcoded list), `field` (dynamic based on scope selection or "All"), `purpose`, `segment_type`, `is_active`.
Text search: searches `template_id`, text content of `text_pool_json` strings.
Add a **"Show generics + fallbacks"** toggle: when a program_type filter is active, also show generic rows that would apply as fallbacks.

### D2. Results table

Columns: `template_id`, `scope`, `field`, `purpose`, `seg_type`, `program_type` (from applies_json, shown as badge), `priority`, `# strings` (count of text pool entries), `active` (dot badge), actions (Edit, Clone).

Row colouring:
- Orange left border: template has `applies_program_type` set (program-specific)
- No border: generic (no program_type)
- Red left border: `is_active = false`

Sortable by priority (default), template_id, scope+field.

### D3. Edit drawer

Sections:

**Identity** (read-only on edit, editable on new):
- `template_id` — text input

**Targeting** (all editable):
- `scope` — select from known set: `program / week / day / segment / transition / exercise`
- `field` — select, populated by scope (or free text for future-proofing)
- `purpose` — select: `(none) / main / secondary / accessory / warmup / cooldown`
- `segment_type` — select: `(none) / single / superset / giant_set / amrap / emom`
- `priority` — number input, min 1, default 10 (important: never null due to the known bug)
- `is_active` — checkbox

**Applies (targeting context)**:
- `program_type` — text input (from applies_json.program_type), with datalist of known types
- `day_focus` — text input (from applies_json.day_focus), with datalist of known values
  - Datalist: `Lower (Squat)`, `Lower (Hinge)`, `Upper (Push)`, `Upper (Pull)`, `Upper (Press)`, `Hypertrophy`
  - Add warning: "day_focus matching uses derived slot-based values, not config focus labels"

**Text pool** (most important UX):
- Render as a **list of text inputs**, one per string. Each row has a delete button.
- "+ Add variant" appends a new blank row.
- On save, convert list to JSON array.
- Show token hints below the section: `{EX_NAME}`, `{SETS}`, `{REP_RANGE}`, `{RIR}`, `{REST_SEC}`, `{ROUNDS}`, `{PURPOSE}`, `{SEGMENT_TYPE}`, `{DAYS_PER_WEEK}`, `{DURATION_MINS}`, `{DAY_INDEX}`, `{DAY_FOCUS}`, `{MAIN_LIFT_NAME}`, `{SECONDARY_LIFT_NAME}`, `{TEMPO}`, `{TOTAL_WEEKS}`

**Match preview (inline)**:
- Collapsible section "Preview this template's match score"
- Inputs: program_type, day_focus, purpose, segment_type
- Computes and displays the score inline using client-side JS that mirrors `findTemplatePool` logic

**Actions**: Save (primary), Clone, Deactivate (danger, toggles is_active), Cancel.

### D4. Coverage gaps panel

Shown below the filter bar when program_type is selected. Collapsible. See Section E.

---

## E. Missing Narration Detection Design

### E1. What the engine expects for a given program_type

Derive expected (scope, field, purpose?, segment_type?) combos from:

1. **From the engine code** (static, always required):
   - `(program, PROGRAM_TITLE)`, `(program, PROGRAM_SUMMARY)`, `(program, PROGRESSION_BLURB)`, `(program, SAFETY_BLURB)` — no purpose/segment_type
   - `(week, WEEK_TITLE)`, `(week, WEEK_FOCUS)`, `(week, WEEK_NOTES)` — no purpose/segment_type
   - `(day, DAY_TITLE)`, `(day, DAY_GOAL)`, `(day, TIME_BUDGET_HINT)`, `(day, WARMUP_TITLE)`, `(day, WARMUP_GENERAL_HEAT)`, `(day, RAMP_SETS_TEXT)` — no purpose/segment_type
   - `(transition, PACE_NOTE)` — no purpose/segment_type
   - `(exercise, CUE_LINE)`, `(exercise, LOAD_HINT)`, `(exercise, LOGGING_PROMPT)` — no purpose/segment_type

2. **From active config's `block_semantics`** (dynamic per program_type):
   For each block letter in `block_semantics`, derive:
   - `purpose` = `sem.purpose`
   - `segment_type` = `sem.preferred_segment_type`
   - Expected:
     - `(segment, SEGMENT_TITLE, purpose, segment_type)`
     - `(segment, SEGMENT_EXECUTION, null, segment_type)`
     - `(segment, SEGMENT_INTENT, purpose, null)`
     - `(transition, SETUP_NOTE, null, segment_type)`
     - `(transition, TRANSITION_NOTE, null, segment_type)`
     - `(exercise, EXERCISE_LINE, purpose, null)`

### E2. Coverage check logic

For each expected (scope, field, purpose, segment_type) combo:

1. Run `findTemplatePool` logic (client-side JS mirroring the engine) against current templates with `matchCtx = { program_type: selected, day_focus: "" }`
2. Classify result:
   - **Covered (specific)** — winning template has `applies_program_type = selected`
   - **Covered (generic fallback)** — winning template has no `applies_program_type`
   - **Missing** — no template found at all

Show a coverage matrix grouped by scope, with colour coding:
- Green: specific coverage
- Yellow: only generic fallback (may produce generic/off-brand copy)
- Red: no coverage at all

### E3. Coverage report API endpoint

`GET /admin/narration/coverage?program_type=<type>`

Returns:
```json
{
  "program_type": "conditioning",
  "config_key": "conditioning_default_v1",
  "expected": [
    { "scope": "segment", "field": "SEGMENT_EXECUTION", "purpose": null, "segment_type": "amrap",
      "coverage": "missing", "winning_template_id": null },
    { "scope": "segment", "field": "SEGMENT_TITLE", "purpose": "main", "segment_type": "amrap",
      "coverage": "generic_fallback", "winning_template_id": "seg_title_main" },
    ...
  ],
  "duplicate_risks": [
    { "template_id": "prog_title_1", "shadowed_by": "cond_prog_title_v1", "context": "program/PROGRAM_TITLE/conditioning" }
  ]
}
```

The endpoint:
1. Fetches active config for `program_type` from `program_generation_config`
2. Derives expected combos (see E1)
3. Loads all active templates from `narration_template`
4. Runs scoring for each combo client-side-mirrored logic server-side
5. Returns classified results

### E4. Duplicate/shadow detection

Also flag templates that are identical in score for the same (scope, field, purpose, segment_type, program_type) — these will non-deterministically compete and should be fixed.

---

## F. Performance and Safety

- All table queries are single SQL fetches with no N+1 (one query for all templates, one for coverage)
- Coverage analysis is O(expected × templates) — both are small (<200 rows each). No pagination needed.
- Client-side filtering for the table grid (load all templates once, filter in JS) is fine at current scale (<500 rows expected)
- Validation on save: before any DB write, validate text_pool_json is a non-empty array, all strings non-empty; applies_json is null or valid object; priority is integer ≥ 1
- Never hard-delete: deactivate only. Avoids accidental data loss.
- `template_id` is immutable after creation (edit flow shows as read-only; clone creates new ID). Prevents breaking references.

---

## G. Incremental Implementation Plan for Codex

Each prompt is independently verifiable. Do not start the next until the previous is confirmed working.

---

### Prompt N1 — API routes: CRUD + coverage endpoint

**Files to create:** `api/src/routes/adminNarration.js`
**Files to modify:** `api/server.js` (import + mount), `api/admin/index.html` (add nav link)

**Part A: CRUD routes**

Implement these routes, all behind `requireInternalToken`, using the direct `pool` from `api/src/db.js`.

Read: `api/src/routes/adminConfigs.js` for the exact pattern (pool import, requireInternalToken, error handling, res.json shape).

```
GET    /admin/narration/templates         — list all, with optional query filters
GET    /admin/narration/templates/:id     — single row
POST   /admin/narration/templates         — create new
PUT    /admin/narration/templates/:id     — update
DELETE /admin/narration/templates/:id     — soft delete (set is_active = false)
```

The `narration_template` table columns: `template_id`, `scope`, `field`, `purpose`, `segment_type`, `priority`, `text_pool_json`, `applies_json`, `is_active`, `created_at`, `updated_at`.

**Validation rules** (apply on POST and PUT):
- `template_id`: non-empty string, no whitespace
- `scope`: must be one of `program`, `week`, `day`, `segment`, `transition`, `exercise`
- `field`: non-empty string
- `priority`: integer ≥ 1, required (not null)
- `text_pool_json`: valid JSON array with at least 1 non-empty string
- `applies_json`: valid JSON object or null

On PUT, `template_id` in the URL must match the row; do not allow changing `template_id` via PUT.

**GET list filters** (all optional query params):
- `scope`, `field`, `purpose`, `segment_type` — exact match
- `program_type` — matches against `applies_json->>'program_type'`
- `is_active` — `true`/`false`
- `q` — ILIKE search against `template_id` and `text_pool_json::text`

**Part B: Coverage endpoint**

```
GET /admin/narration/coverage?program_type=<type>
```

Server-side logic:
1. Fetch active config for the program_type from `program_generation_config`
2. Extract `block_semantics` from `program_generation_config_json.segmentation.block_semantics`
3. Derive expected (scope, field, purpose, segment_type) combos (see Section E1 and E2 above for the full list — it is both static combos from the engine plus dynamic combos from block_semantics)
4. Fetch all active narration templates
5. For each expected combo, run the scoring logic (port `findTemplatePool` to a pure JS helper function) with `matchCtx = { program_type: selected, day_focus: "" }`
6. Classify each as `specific`, `generic_fallback`, or `missing`
7. Return `{ program_type, config_key, expected: [...], summary: { specific: N, generic_fallback: N, missing: N } }`

**Part C: server.js + nav link**

In `api/server.js`:
```js
import { adminNarrationRouter } from "./src/routes/adminNarration.js";
app.use("/admin", adminNarrationRouter);
app.get("/admin/narration", (_req, res) => res.sendFile(join(__dirname, "admin/narration.html")));
```

In `api/admin/index.html`, add to the `.nav-row`:
```html
<a href="/admin/narration">Narration Templates</a>
```

**Acceptance criteria:**
- [ ] `GET /admin/narration/templates` returns all rows with correct shape
- [ ] `POST` creates a new row; 409 if template_id exists
- [ ] `PUT` updates and validates; 400 with error if validation fails
- [ ] `DELETE` sets `is_active = false`, does not hard delete
- [ ] `GET /admin/narration/coverage?program_type=conditioning` returns expected combos with coverage classification, including at least `amrap` and `emom` segment execution as `missing`
- [ ] Nav link appears in Config Admin sidebar

---

### Prompt N2 — Admin page: table with filters

**Files to create:** `api/admin/narration.html`

This is a standalone HTML page (no module bundler). Follow `api/admin/exercises.html` for the overall structure and CSS patterns.

**Page layout:**
- Header bar: title "Narration Templates", `[+ New]` button, Internal API Token input + Load button (same pattern as index.html)
- Nav links to all admin pages (Config Editor, Coverage, Exercises, Narration)
- Filter bar: dropdowns for `program_type`, `scope`, `field`, `purpose`, `segment_type`, `is_active` + text search input
- Results table (see Section D2 for columns)
- Empty state + loading state
- A collapsible coverage panel (placeholder for now — populated in N3)

**Table columns:**
`template_id` | `scope` | `field` | `purpose` | `segment_type` | `program_type` | `priority` | `strings` (count of text pool items) | `active` | Edit | Clone

**Filtering:** Load all templates once on page load (after token entered + Load clicked). Filter entirely in JS — no extra API calls per filter change.

**Row colouring:**
- `has applies_json.program_type` → orange-left-border
- `is_active = false` → greyed out + strikethrough on template_id

**Actions on each row:**
- `Edit` → opens drawer (placeholder for N3)
- `Clone` → opens drawer pre-filled with `_copy` suffix on template_id (placeholder for N3)

**Acceptance criteria:**
- [ ] Page loads at `/admin/narration`
- [ ] Token input + Load shows all templates in the table
- [ ] Filters work client-side across all columns
- [ ] Row colouring correct
- [ ] Edit and Clone buttons present (drawer opens but can be empty for now)

---

### Prompt N3 — Edit and Clone drawer

**Files to modify:** `api/admin/narration.html`

Implement the slide-in drawer with full edit/create form. Reference `api/admin/exercises.html` for the drawer animation and overlay pattern.

**Drawer sections (in order):**

1. **Identity** — `template_id` (read-only on edit; editable on new/clone), `is_active` checkbox
2. **Targeting** — `scope` (select), `field` (select filtered by scope or free text), `purpose` (select with blank option), `segment_type` (select with blank option), `priority` (number input, min 1, default 10)
3. **Applies** — `program_type` text input with datalist of known program types; `day_focus` text input with datalist; small note: "day_focus values are derived from slot names at runtime — see docs"
4. **Text pool** — list of text inputs (one per pool string), each with a remove button; `+ Add variant` button appends new row; token hint list displayed below
5. **Match preview** — collapsible section; inputs for context (program_type, day_focus, purpose, segment_type); shows computed score + whether this template would WIN vs generic baseline; all client-side JS

**Scope → field mapping** (populate field dropdown when scope changes):
```
program    → PROGRAM_TITLE, PROGRAM_SUMMARY, PROGRESSION_BLURB, SAFETY_BLURB
week       → WEEK_TITLE, WEEK_FOCUS, WEEK_NOTES
day        → DAY_TITLE, DAY_GOAL, TIME_BUDGET_HINT, WARMUP_TITLE, WARMUP_GENERAL_HEAT, RAMP_SETS_TEXT
segment    → SEGMENT_TITLE, SEGMENT_EXECUTION, SEGMENT_INTENT
transition → SETUP_NOTE, TRANSITION_NOTE, PACE_NOTE
exercise   → EXERCISE_LINE, CUE_LINE, LOAD_HINT, LOGGING_PROMPT
```
Also allow free text in the field input for future fields.

**Save behaviour:**
- Validate client-side before API call: text pool min 1 non-empty string, priority ≥ 1, template_id non-empty
- On POST (new) or PUT (edit): call appropriate endpoint
- On success: close drawer, refresh table in place, show success status
- On error: show inline error in drawer, do not close

**Clone behaviour:**
- Pre-fill all fields from source row
- Set `template_id` to `<source_id>_copy`
- Mark as new (POST on save)
- Drawer title shows "Clone: <source_id>"

**Acceptance criteria:**
- [ ] Edit drawer opens with correct values for all fields
- [ ] Text pool renders as editable list, not raw JSON
- [ ] Token hints shown
- [ ] Match preview computes score client-side and shows win/lose vs baseline
- [ ] Save creates/updates row, refreshes table
- [ ] Clone creates new row with `_copy` suffix
- [ ] Deactivate sets is_active = false without full delete
- [ ] Validation prevents save with empty text pool or priority < 1

---

### Prompt N4 — Coverage diagnostics panel

**Files to modify:** `api/admin/narration.html`

Implement the coverage panel. This panel activates when `program_type` filter is set to a specific value (not "All").

**Panel location:** Collapsible section between filter bar and results table.

**Panel content:**

Two sub-panels side by side (or stacked on mobile):

**Left: Coverage matrix**
A table showing all expected (scope, field, purpose, segment_type) combos for the selected program_type.
Columns: Scope | Field | Purpose | Seg Type | Coverage | Winning template
Coverage badge:
- Green "Specific" — program-specific template wins
- Yellow "Generic fallback" — only a generic template available
- Red "Missing" — no template found

Click a "Missing" or "Generic fallback" row → opens the New Template drawer pre-filled with those exact (scope, field, purpose, segment_type, program_type) values, ready to add copy.

**Right: Risks**
- "Shadowed templates" — pairs of templates where both match the same most-specific context with the same score (potential non-determinism)
- "Never-match templates" — templates with `applies_program_type` set to a value not matching any active config

**Loading:** Call `GET /admin/narration/coverage?program_type=<type>` when program_type filter changes. Show spinner while loading.

**Summary line above matrix:** "X specific | Y generic fallback | Z missing" for the selected program_type.

**Acceptance criteria:**
- [ ] Panel appears when a specific program_type is selected
- [ ] Coverage matrix shows all expected combos with correct classification
- [ ] conditioning shows AMRAP + EMOM execution as "Missing" (confirming actual gap)
- [ ] Clicking Missing row opens drawer pre-filled for that combo
- [ ] Shadow risks section shows any duplicate-score conflicts
- [ ] Summary counts are correct

---

## H. Risks, Anti-patterns, Open Questions

### H1. Known bug — do not introduce NULL priority

The engine `normalizeTemplates` does `toInt(r.priority, 1)` — NULL priority becomes 1. Until this is fixed, the admin UI must **always save a numeric priority** (never null). Default should be `10` for new templates, not null or 1. The fix to `normalizeTemplates` is a one-liner but is in a different step (not part of this spec).

### H2. `day_focus` matching is ineffective for conditioning

`dayFocusFromDay()` only matches `squat`, `hinge`, `push_horizontal`, `pull_horizontal`, `push_vertical`, `pull_vertical` in the slot name. Conditioning slots (`A:engine`, `B:locomotion`, etc.) never match, so `day_focus` always returns `"Hypertrophy"`. Templates targeting `applies_json.day_focus` for conditioning will never fire.

The coverage panel should call this out explicitly as a warning on the conditioning coverage view: "day_focus targeting is not effective for conditioning programs — slot names don't contain movement pattern keywords."

### H3. `phase` in applies_json is inert

Several strength templates have `applies_json = { program_type: "strength", phase: "BASELINE" }`. The `phase` key is **not read by `findTemplatePool`**. These templates work only because `program_type` matches. The admin UI should display the full `applies_json` including `phase`, but note it as "inert in matching (phase is not used by engine)".

### H4. Seed overwrite risk

If `R__seed_narration_template.sql` checksum changes (someone edits the seed), Flyway will re-run it and overwrite any admin-edited rows whose `template_id` matches seed rows. New rows (with novel template_ids) are safe. Document this in the admin page as a visible warning.

### H5. Text pool ordering affects hash-based picking

The engine picks from the text pool deterministically by `FNV-1a hash of the context key % pool.length`. Reordering pool strings in the admin UI will change which string appears for a given user — not a bug, but the admin should note this so editors don't assume the first string is always shown.

### H6. Open question: should coverage use the first or all active configs for a program_type?

If multiple active configs exist for the same `program_type` (e.g. `conditioning_default_v1` and `conditioning_hyrox_v1`), the coverage endpoint currently just uses the first one found. The panel should let the user select a specific config key when multiple exist for the same type.

### H7. Scope of this spec

This spec does not include:
- CSV import/export (add in a future phase if needed — not critical)
- Bulk retarget (add as a future phase — not in current scope)
- Audit log / change history (add if compliance becomes a concern)
- Any changes to the engine or the seed SQL file (separate concerns)
