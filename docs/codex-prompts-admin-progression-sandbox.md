# Codex Prompt: Progression Sandbox — Admin Page for Scenario-Based Progression Testing

## Goal

Build a dedicated admin page at `/admin/progression-sandbox` that lets you validate the progression decision engine by supplying an explicit exercise prescription, a fitness profile, and one or more logged exposure entries — then seeing exactly what `buildDecision` returns and why.

This is the correct tool for answering: "does the engine progress load when an athlete is improving? does it hold when they're plateauing? does it deload when they're declining?" The existing Program Preview answers none of these questions reliably because its anchor-lift input doesn't represent repeated performance history.

No DB writes. No new DB tables. Three new files plus two additions to `server.js`.

---

## Context files to read before writing any code

- `api/src/services/progressionDecisionService.js` — `buildDecision`, `loadProgressionConfig`, `resolveProfileName`, `rankKey` are all exported at the bottom; understand every parameter `buildDecision` expects on `row` (`exercise_id`, `purpose`, `reps_prescribed`, `intensity_prescription`, `is_loadable`, `equipment_items_slugs`) and the shape of every field in its return value including `evidence`
- `api/src/routes/adminPreview.js` — factory pattern (`createPreviewHandler`), `VALID_PRESETS`, `ALL_PROGRAM_TYPES`, `clampNumber`; the sandbox route follows the same factory convention
- `api/server.js` — `sendAdminPage`, `adminCspMiddleware`, `adminOnly`; where to add the two new lines
- `api/admin/preview.html` — CSS variables, nav link pattern, tab structure, `esc()` helper; reuse these exactly

---

## Part 1 — New route module

**New file: `api/src/routes/adminProgressionSandbox.js`**

Export a `createProgressionSandboxHandler(db)` factory and a named `adminProgressionSandboxRouter`.

### Route: `POST /progression-sandbox/evaluate`

**Auth:** `adminOnly` (applied in server.js, not in this file — same pattern as `adminPreviewRouter`)

**Request body:**

```json
{
  "program_type": "strength",
  "fitness_rank": 1,
  "exercise_id": "bb_back_squat",
  "purpose": "main",
  "reps_prescribed": "4-6",
  "intensity_prescription": "2 RIR",
  "equipment_items_slugs": ["barbell", "rack"],
  "history": [
    { "weight_kg": 100, "reps_completed": 6, "rir_actual": 3 },
    { "weight_kg": 100, "reps_completed": 6, "rir_actual": 2.5 }
  ]
}
```

All fields except `equipment_items_slugs` and `exercise_id` are required. `history` must be a non-empty array.

**Validation rules:**

| Field | Rule |
|---|---|
| `program_type` | Must be one of: `"hypertrophy"`, `"strength"`, `"conditioning"`, `"hyrox"` |
| `fitness_rank` | Must be 0, 1, 2, or 3 |
| `reps_prescribed` | Non-empty string |
| `history` | Array, at least 1 entry; each entry must have `weight_kg` (finite number) and `reps_completed` (positive integer); `rir_actual` is optional (null is fine) |

Return 400 with `{ ok: false, error: "..." }` for any validation failure.

**Algorithm:**

```
1. Validate all required fields
2. If exercise_id provided, query exercise_catalogue for is_loadable and equipment_items_slugs
   - If exercise not found, default is_loadable=true, equipment_items_slugs from body
3. Call loadProgressionConfig(db, programType)
4. Derive rankOverride = rankOverrides[rankKey(fitnessRank)] ?? {}
5. Derive profileName = resolveProfileName(config, programType, purpose)
6. Derive profile = config.lever_profiles[profileName] ?? {}
7. Build row object:
   {
     exercise_id: exerciseId,
     purpose,
     reps_prescribed,
     intensity_prescription,
     is_loadable,
     equipment_items_slugs,
   }
8. Call buildDecision({ row, programType, profileName, profile, rankOverride, history, config })
9. If buildDecision returns null → return { ok: true, outcome: "not_applicable", reason: "exercise_not_loadable or program_type_not_supported" }
10. Return shaped response
```

**Response:**

```json
{
  "ok": true,
  "outcome": "increase_load",
  "primary_lever": "load",
  "recommended_load_kg": 105,
  "recommended_reps_target": null,
  "confidence": "medium",
  "confidence_score": 70,
  "reasons": ["Recent exact history hit the current rep target with acceptable RIR."],
  "evidence": {
    "exposures_considered": 2,
    "successful_exposures": 2,
    "underperformance_exposures": 0,
    "latest_weight_kg": 100,
    "latest_reps": 6,
    "latest_rir": 3,
    "target_low": 4,
    "target_high": 6,
    "target_rir": 2,
    "required_rir": 2
  },
  "config_used": {
    "profile_name": "strength_main",
    "rank_key": "intermediate"
  }
}
```

`config_used` helps the user understand which lever profile and rank key were resolved — critical for debugging unexpected outcomes.

**Error handling:** wrap the entire handler body in try/catch; return 500 with `{ ok: false, error: "Internal error" }` on unexpected failures; do not expose stack traces.

**Full module structure:**

```js
import express from "express";
import { pool } from "../db.js";
import {
  buildDecision,
  loadProgressionConfig,
  rankKey,
  resolveProfileName,
} from "../services/progressionDecisionService.js";

export const adminProgressionSandboxRouter = express.Router();

export function createProgressionSandboxHandler(db = pool) {
  return async function progressionSandboxHandler(req, res) {
    // ... validation, logic, response
  };
}

adminProgressionSandboxRouter.post(
  "/progression-sandbox/evaluate",
  createProgressionSandboxHandler(pool),
);
```

---

## Part 2 — Register in server.js

**File: `api/server.js`**

**2a. Import the router** alongside the other admin imports:

```js
import { adminProgressionSandboxRouter } from "./src/routes/adminProgressionSandbox.js";
```

**2b. Serve the HTML page** alongside the other admin page GET routes (near line 267):

```js
app.get("/admin/progression-sandbox", adminCspMiddleware, (_req, res) => sendAdminPage(res, "progression-sandbox.html"));
```

**2c. Register the API router** alongside the other `adminOnly` router registrations (near line 686):

```js
app.use("/admin", ...adminOnly, adminProgressionSandboxRouter);
```

---

## Part 3 — New admin HTML page

**New file: `api/admin/progression-sandbox.html`**

Follow the structure of `preview.html` exactly: same CSS variables, same `<style>` block, same sticky header with nav links, same `esc()` helper, same button styles.

### Navigation

In the nav bar, include links to all existing admin pages plus this one:

```html
<a href="/admin/preview">Preview</a>
<a href="/admin/progression-sandbox" class="active">Progression Sandbox</a>
<a href="/admin/exercises">Exercises</a>
<!-- etc — match the order from other pages -->
```

### Layout

Two-column layout at wider viewports, single column on narrow:
- Left: inputs panel (form)
- Right: results panel (output)

### Inputs panel

**Header controls row:**
- `program_type` toggle buttons: `hypertrophy` | `strength` | `conditioning` | `hyrox` (default: `strength`)
- `fitness_rank` toggle buttons: `0 (beginner)` | `1 (intermediate)` | `2 (advanced)` | `3 (elite)` (default: `1`)

**Prescription row:**
- `purpose` select: `main` | `secondary` | `accessory` (default: `main`)
- `reps_prescribed` text input (placeholder: `4-6`)
- `intensity_prescription` text input (placeholder: `2 RIR`)
- `exercise_id` text input, optional (placeholder: `bb_back_squat — optional, for is_loadable lookup`)

**History section:**

Label: "Performance history (most recent first)"

Dynamic list of exposure rows. Each row has:
- `weight_kg` number input (placeholder: `100`)
- `reps_completed` number input (placeholder: `6`)
- `rir_actual` number input (placeholder: `2`, optional)
- Remove button (×)

"+ Add exposure" button below the list. Minimum 1 row rendered by default (2 on preset load).

**Preset buttons:**

Three preset buttons that populate the entire form:

| Preset | program_type | fitness_rank | purpose | reps_prescribed | intensity_prescription | History |
|---|---|---|---|---|---|---|
| Improving (strength) | strength | 1 | main | 4-6 | 2 RIR | [{weight_kg:100, reps_completed:6, rir_actual:3}, {weight_kg:100, reps_completed:6, rir_actual:2.5}] |
| Plateau | strength | 1 | main | 4-6 | 2 RIR | [{weight_kg:100, reps_completed:5, rir_actual:2}, {weight_kg:100, reps_completed:5, rir_actual:2}] |
| Declining | strength | 1 | main | 4-6 | 2 RIR | [{weight_kg:100, reps_completed:3, rir_actual:0.5}, {weight_kg:100, reps_completed:3, rir_actual:0}] |

Note visible on the Improving preset:
> For hypertrophy, change program_type and reps to 8-12 — may return increase_reps rather than increase_load if reps haven't hit the top of the range.

**Evaluate button:** primary style, full width at bottom of inputs panel.

### Results panel

Shown after a successful API call. Sections:

**Outcome badge:** large coloured badge — green for `increase_load`/`increase_reps`, grey for `hold`, amber for `deload_local`, muted for `not_applicable`.

**Recommendation:** if `recommended_load_kg` is non-null: "Recommended load: **X kg**". If `recommended_reps_target` is non-null: "Recommended reps target: **X**". Show both if both present.

**Confidence:** `confidence` label with `confidence_score` in parentheses.

**Reasons:** unordered list of reason strings.

**Evidence block** (collapsible `<details>` open by default):

Table with two columns (field | value):

| Field | Value |
|---|---|
| Exposures considered | `evidence.exposures_considered` |
| Successful exposures | `evidence.successful_exposures` |
| Underperformance exposures | `evidence.underperformance_exposures` |
| Latest weight | `evidence.latest_weight_kg` kg |
| Latest reps | `evidence.latest_reps` |
| Latest RIR | `evidence.latest_rir ?? "—"` |
| Target rep range | `evidence.target_low – evidence.target_high` |
| Target RIR | `evidence.target_rir` |
| Required RIR (with rank offset) | `evidence.required_rir` |

**Config used** (collapsible `<details>` closed by default):

- Profile name: `config_used.profile_name`
- Rank key: `config_used.rank_key`

**Error state:** if `ok: false`, show the error message in a red error box. If the HTTP request itself fails, show a generic error.

### JavaScript

Single `evaluate()` function called on button click and on Enter key in any input.

Build request body from form state. `POST` to `/admin/progression-sandbox/evaluate`. On success render the results panel. On error render the error box.

No page reload. Results clear on each new evaluation.

---

## Part 4 — Tests

**New file: `api/src/routes/__tests__/adminProgressionSandbox.test.js`**

Use the same `node:test` + mock pattern as `adminPreview.test.js`. Mock `db` as an object with a `query` function. Mock `loadProgressionConfig` to return the default config for `strength`, fitness rank 1.

### Test cases

| Case | Assert |
|---|---|
| Valid strength request with 2 exposures at top of rep range, RIR above target → `outcome: "increase_load"` | Decision returns progression |
| Valid hypertrophy request with reps below top of range, acceptable RIR → `outcome: "increase_reps"` | Hypertrophy lever ordering |
| 2 underperformance exposures (reps below low end) → `outcome: "deload_local"` | Deload triggers |
| 2 on-target exposures with on-target RIR → `outcome: "hold"` | Plateau holds |
| `program_type: "conditioning"` → `outcome: "not_applicable"` | Unsupported type handled |
| Missing `reps_prescribed` → 400 | Validation |
| `fitness_rank: 5` → 400 | Validation |
| Empty `history: []` → 400 | Validation |
| History entry missing `reps_completed` → 400 | Validation |
| Valid request returns `evidence` block with `target_low`, `target_high`, `required_rir` | Evidence shape |
| Valid request returns `config_used.profile_name` matching expected profile | Config surfaced |

---

## Summary of files changed

| File | Change |
|---|---|
| `api/src/routes/adminProgressionSandbox.js` | New route module — `POST /progression-sandbox/evaluate` |
| `api/admin/progression-sandbox.html` | New admin page — form, presets, results panel |
| `api/server.js` | Add page GET route + register API router under `adminOnly` |
| `api/src/routes/__tests__/adminProgressionSandbox.test.js` | New test file — 11 test cases |

No migrations. No new services. No DB writes.
