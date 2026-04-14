# Preview CSV Export — Spec

## Goal

Add a CSV export capability to `/admin/preview` so generated workout programs can be downloaded and passed to an AI agent for critical review. The export must include enough context and structure for an AI to assess quality, identify weaknesses, and suggest improvements without additional information.

---

## Architecture

### Backend export endpoint (preferred over client-side shaping)

Export shaping lives in the API, not in the browser. Reasons:

- Multi-combination exports (all fitness levels × all equipment presets) are impossible to do cleanly in the browser without first making multiple preview calls and then re-serialising all the data.
- The preview JSON payload can be large; passing it back as a POST body to a shaper is awkward and fragile.
- A backend endpoint can iterate over multiple parameter combinations server-side using the same pipeline infrastructure already used by `/admin/preview/generate`.
- When the program structure evolves, only one place (the shaper function) needs updating, not the HTML page too.

### New endpoint

```
POST /admin/preview/export-csv
```

Accepts multi-dimensional generation params + export options, runs the pipeline for each combination, concatenates rows, and streams a CSV file download.

### Shared code

The existing `createPreviewHandler` in `adminPreview.js` already contains the DB query, equipment slug resolution, `getAllowedExerciseIds`, and `buildInputsFromProfile` logic. Extract this shared setup into a helper function (e.g. `buildPreviewInputs(db, { fitnessRank, equipmentPreset, daysPerWeek, durationMins })`) that both the generate handler and the export handler can call. Do not duplicate this logic.

The CSV row shaping logic lives in a pure function `shapeToCsvRows(programType, preview, meta, fieldSet)` that the export handler calls. Being a pure function makes it straightforward to unit test.

---

## Request / response contract

### Request body

```json
{
  "fitness_ranks": [1],
  "equipment_presets": ["commercial_gym"],
  "program_types": ["hypertrophy", "strength", "conditioning", "hyrox"],
  "days_per_week": 3,
  "duration_mins": 50,
  "field_set": "core"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `fitness_ranks` | int[] | Subset of [0,1,2,3]. Defaults to current page selection. |
| `equipment_presets` | string[] | Subset of the five valid presets. |
| `program_types` | string[] | Subset of ["hypertrophy","strength","conditioning","hyrox"]. |
| `days_per_week` | int | 1–7. Defaults to 3. |
| `duration_mins` | int | 20–120. Defaults to 50. |
| `field_set` | string | "core" (default). Future: "core+narration", "debug". |

The endpoint iterates over every combination of `fitness_ranks × equipment_presets × program_types`. Each combination runs the pipeline once. All rows are concatenated into one CSV.

### Response

```
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="preview-export.csv"
```

On error (pipeline failure for a combination): write a row with all exercise columns blank and an `error` column populated. Do not abort the entire export if one combination fails.

---

## CSV row model

**One row per exercise.** This is the right level of granularity for AI review because:

- Each row is fully self-contained — the AI can evaluate a single exercise in its complete context without joining other rows.
- Repeated context columns (program_type, fitness_level, week, day, segment) allow the AI to filter and group freely.
- A row-per-day model would require the AI to parse an entire day's exercises from embedded JSON, which is slow and error-prone.
- A row-per-segment model is too coarse — the AI cannot see individual exercise choices.
- Flat rows make it easy to calculate aggregate metrics: total volume per day, exercise variety per week, push/pull balance, etc.

### Core field set — columns

#### Generation context (repeated on every row)

| Column | Source |
|--------|--------|
| `program_type` | parameter |
| `config_key` | `debug.step1.config_key` |
| `fitness_level` | `meta.fitness_level` |
| `fitness_rank` | `meta.fitness_rank` |
| `equipment_preset` | `meta.equipment_preset` |
| `days_per_week` | `meta.days_per_week` |
| `duration_mins` | `meta.duration_mins` |
| `allowed_exercise_count` | `meta.allowed_exercise_count` |

#### Week / day context

| Column | Source |
|--------|--------|
| `week_number` | `week.week_index` |
| `week_phase` | `program.narration.weeks[weekIndex-1].phase_label` |
| `day_number` | `day.day_index` |
| `day_focus` | `day.day_focus_slug` |
| `day_duration_mins` | `day.duration_mins` |

#### Segment context

| Column | Source |
|--------|--------|
| `segment_purpose` | `seg.purpose` (main / warmup / finisher / secondary / cooldown) |
| `segment_type` | `seg.segment_type` |
| `segment_rounds` | `seg.rounds` |

#### Exercise

| Column | Source |
|--------|--------|
| `exercise_order` | 1-based position within segment |
| `exercise_id` | `item.ex_id` |
| `exercise_name` | resolved from `meta.exercise_name_map` |
| `slot` | `item.slot` |
| `sets` | `item.sets` |
| `reps_prescribed` | `item.reps_prescribed` |
| `reps_unit` | `item.reps_unit` |
| `tempo` | `item.tempo_prescribed` |
| `rir_target` | `item.rir_target` |
| `rest_after_set_sec` | `item.rest_after_set_sec` |
| `rep_rule_id` | `item.rep_rule_id` |

Total: **21 columns** in the core field set.

### Optional field sets (future, not implemented in v1)

| Field set | Additional columns |
|-----------|--------------------|
| `core+narration` | `narration_line`, `narration_cues`, `narration_load_hint`, `narration_log_prompt`, `day_goal`, `segment_title`, `segment_intent` |
| `debug` | `slot_debug_template`, `slot_debug_selected_attempt`, `slot_debug_fill`, `rep_rule_detail` (full formatted rule string) |

The `field_set` parameter is the hook for these. The `shapeToCsvRows` function accepts it and switches on it to determine which columns to emit. Adding a new field set requires only extending that function and the endpoint validation — no changes to the HTML.

---

## UI changes on `/admin/preview`

### Export panel

Add a compact export section to the header bar, after the existing "Generate All" button and separator. It should not dominate the page.

```
[ sep ] Export: [ Current selection ▾ ] [ Core ▾ ]  [ Export CSV ]
```

**Scope control** — a `<select>` with options:

| Option | Behaviour |
|--------|-----------|
| Current selection | Uses current fitness rank + equipment preset + all currently active program type tab |
| All fitness levels | Current equipment preset × all 4 ranks |
| All equipment presets | Current fitness rank × all 5 presets |
| All program types | Current rank + preset × all 4 types |
| Full matrix | All ranks × all presets × all types (slow — 80 combinations) |

**Format control** — a `<select>` with `Core` as the only v1 option. Future: `Core + Narration`, `Debug`.

**Export CSV button** — on click, builds the request body from current page state + chosen scope + format, POSTs to `/admin/preview/export-csv` with the auth token, and triggers a browser download using the `<a download>` pattern (create a blob URL, click it, revoke it). Shows a brief status indicator while running.

### Reuse of existing controls

`days_per_week` and `duration_mins` are shared between generate and export — no duplication. The export request always uses whatever is currently selected in the header toggles.

---

## Implementation plan

### 1. Extract shared DB/input setup (`adminPreview.js`)

Pull the DB queries and input construction out of `createPreviewHandler` into:

```js
async function buildPreviewInputs(db, { fitnessRank, equipmentPreset, daysPerWeek, durationMins })
→ { equipmentSlugs, allowedIds, exerciseRows, repRuleRows, exerciseNameMap, repRuleMap, synthProfile, inputs, pipelineRequest }
```

`createPreviewHandler` calls this helper. The export handler also calls this helper. No logic is duplicated.

### 2. Pure shaper function (`adminPreview.js` or a colocated module)

```js
function shapeToCsvRows(programType, preview, meta, fieldSet = "core")
→ Array<Record<string, string>>
```

Walks `program.weeks → week.days → day.segments → seg.items`. Each item becomes one plain object with the column names as keys and string values. Returns an empty array if `preview.ok === false` (the export handler writes an error row in that case).

### 3. CSV serialiser utility

```js
function rowsToCsv(rows)
→ string
```

Takes an array of row objects, derives the header from the keys of the first row, writes header + data rows. Handles quoting and comma-escaping (wrap any field containing commas, double quotes, or newlines in double quotes; escape internal double quotes by doubling them).

### 4. Export route handler (`adminPreview.js`)

```js
adminPreviewRouter.post("/preview/export-csv", createExportHandler());
```

- Validates `fitness_ranks`, `equipment_presets`, `program_types`, `field_set`.
- Iterates combinations, calls `buildPreviewInputs` for each unique `(fitnessRank, equipmentPreset)` pair, then runs the pipeline for each `programType`.
- Calls `shapeToCsvRows` for each result, accumulates rows.
- Sets response headers and writes the CSV string.

Note: `(fitnessRank, equipmentPreset)` pairs can be deduplicated — equipment slugs, allowed IDs, and exercise rows are identical across program types for the same rank+preset, so the DB queries need only run once per unique pair, not once per combination.

### 5. UI changes (`preview.html`)

- Add export panel HTML to the header after the Generate separator.
- Add `exportToCsv()` async function: builds request body from page state + scope/format selects, fetches, creates a blob URL, triggers download.
- Minimal status indicator (reuse existing `gen-status` style).

### 6. Tests

**Unit tests** (new file `api/engine/steps/__tests__/csvExport.test.js` or `api/src/routes/__tests__/adminPreview.export.test.js`):

- `shapeToCsvRows` with a minimal synthetic program: verify row count = total exercises across all weeks/days/segments, verify context columns are correctly propagated, verify exercise columns are present.
- `rowsToCsv`: verify header row matches keys, verify comma/quote escaping.
- Empty program (no weeks): verify 0 rows returned without error.
- Failed preview (`ok: false`): verify shaper returns empty array.

**Integration test** (if the existing `adminPreview.test.js` pattern supports it):

- POST to `/admin/preview/export-csv` with valid params → 200, `Content-Type: text/csv`, body parses as valid CSV with correct column count.
- Invalid `field_set` → 400.

---

## Notes for AI evaluation quality

The goal of this export is AI review, not human spreadsheet readability. Several design decisions reflect this:

**Context on every row.** An AI processing a subset of rows (e.g. just the main segment) must be able to understand the full generation context without accessing other rows. Repeating program_type, fitness_level, equipment_preset, and config_key on every exercise row ensures this.

**`config_key` is essential.** The config key identifies the specific generation template used (e.g. `hypertrophy_default_v1`). Without it, an AI cannot know which slot definitions, constraints, or progression rules applied. This is the single most useful "why does this look the way it does" field.

**`allowed_exercise_count` as a constraint signal.** An AI reviewing a programme with 12 allowed exercises should not criticise it for lack of variety — it has no other choices. Including this count frames the constraint clearly.

**`segment_purpose` enables structural review.** An AI can check whether the warmup exercises are appropriate, whether the main segment has a logical push/pull or upper/lower structure, and whether the finisher is suitable for the fitness level — but only if it knows which segment each exercise belongs to.

**`reps_unit` enables volume calculation.** Distance and time prescriptions (m, seconds) cannot be summed with reps to estimate session volume. Including `reps_unit` allows the AI to handle each correctly.

**No narration in the default export.** Narration text is generated output, not a constraint or a structural feature. Including it by default would increase token usage without improving the AI's ability to assess whether the programme is *correct*. It belongs in a separate field set for the AI reviewing narration quality, not programme quality.

---

## Future progression note

Once athletes log actual reps/time against these time-equivalent prescriptions (e.g. 60 seconds of KB swings substituted for a 200m row), the logged values become ground truth for that athlete's pace at that station. A future weekly progression step could compare the logged duration against the prescribed time equivalent and adjust the prescription — the same way RIR-based progression adjusts load. The CSV export (with `reps_prescribed`, `reps_unit`, and `rep_rule_id`) provides a clean audit trail for this analysis.
