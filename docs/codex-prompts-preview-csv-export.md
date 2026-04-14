# Codex Prompt — Preview CSV Export

## Context

File: `api/src/routes/adminPreview.js`
Test file: `api/src/routes/__tests__/adminPreview.test.js`
UI file: `api/admin/preview.html`
Spec: `docs/preview-csv-export-spec.md`

The admin preview page (`/admin/preview`) generates workout programs and renders them in the browser. We need to add a CSV export capability so programs can be downloaded and passed to an AI agent for review.

---

## Task overview

1. Refactor `adminPreview.js` to extract a shared DB/input setup helper
2. Add a pure `shapeToCsvRows` function
3. Add a `rowsToCsv` serialiser
4. Add a `createExportHandler` and register `POST /admin/preview/export-csv`
5. Export the new functions so they are testable
6. Add tests to `adminPreview.test.js`
7. Add an export panel to `preview.html`

Do all of this in one pass. Do not split into separate files unless clearly stated below.

---

## Step 1 — Extract `buildPreviewInputs` from `createPreviewHandler`

Currently `createPreviewHandler` contains all the DB query logic inline. Extract it into a named async function in the same file so the export handler can reuse it without duplication.

### New function signature

```js
export async function buildPreviewInputs(db, getAllowed, buildInputs, {
  fitnessRank,
  equipmentPreset,
  daysPerWeek,
  durationMins,
}) {
  // All DB queries and input construction from the existing handler go here.
  // Returns the object below.
  return {
    equipmentSlugs,   // string[]
    allowedIds,       // (exercise_id|string)[]
    exerciseRows,     // rows from exercise_catalogue
    repRuleRows,      // rows from program_rep_rule
    exerciseNameMap,  // { [exercise_id]: name }
    repRuleMap,       // { [rule_id]: row }
    synthProfile,     // buildSynthProfile(...)
    inputs,           // buildInputs(synthProfile, allowedExerciseRows)
    pipelineRequest,  // { anchor_date_ms, allowed_ids_csv, preferred_days_json, duration_mins, days_per_week, fitness_rank }
  };
}
```

Update `createPreviewHandler` to call `buildPreviewInputs` instead of running queries inline. The handler's logic and test coverage must not change — all existing tests must still pass.

---

## Step 2 — Add `shapeToCsvRows`

Add this pure function in `adminPreview.js` and export it.

```js
export function shapeToCsvRows(programType, preview, meta, fieldSet = "core") {
  // Returns an array of plain objects (one per exercise).
  // Returns [] if preview.ok === false.
}
```

### Program tree walk

```
program.weeks[]
  └── week.days[]
        └── day.segments[]
              └── seg.items[]  ← one row per item
```

### Row columns (in this exact order)

| Column name | Value |
|-------------|-------|
| `program_type` | `programType` param |
| `config_key` | `preview.debug?.step1?.config_key ?? ""` |
| `fitness_level` | `meta.fitness_level` |
| `fitness_rank` | `String(meta.fitness_rank)` |
| `equipment_preset` | `meta.equipment_preset` |
| `days_per_week` | `String(meta.days_per_week)` |
| `duration_mins` | `String(meta.duration_mins)` |
| `allowed_exercise_count` | `String(meta.allowed_exercise_count)` |
| `week_number` | `String(week.week_index)` |
| `week_phase` | `(preview.program.narration?.weeks ?? [])[week.week_index - 1]?.phase_label ?? ""` |
| `day_number` | `String(day.day_index)` |
| `day_focus` | `day.day_focus_slug ?? ""` |
| `day_duration_mins` | `String(day.duration_mins ?? "")` |
| `segment_purpose` | `seg.purpose ?? ""` |
| `segment_type` | `seg.segment_type ?? ""` |
| `segment_rounds` | `String(seg.rounds ?? "")` |
| `exercise_order` | 1-based position of item within `seg.items` |
| `exercise_id` | `String(item.ex_id)` |
| `exercise_name` | `meta.exercise_name_map?.[String(item.ex_id)] ?? ""` |
| `slot` | `item.slot ?? ""` |
| `sets` | `String(item.sets ?? "")` |
| `reps_prescribed` | `String(item.reps_prescribed ?? "")` |
| `reps_unit` | `String(item.reps_unit ?? "")` |
| `tempo` | `String(item.tempo_prescribed ?? "")` |
| `rir_target` | `item.rir_target != null ? String(item.rir_target) : ""` |
| `rest_after_set_sec` | `String(item.rest_after_set_sec ?? "")` |
| `rep_rule_id` | `String(item.rep_rule_id ?? "")` |

Total: **27 columns**.

For `fieldSet !== "core"` (future), just return `[]` for now with no error — this is the extension hook.

---

## Step 3 — Add `rowsToCsv`

Add this pure function in `adminPreview.js` and export it.

```js
export function rowsToCsv(rows) {
  // rows: Array<Record<string, string>>
  // Returns a CSV string with a header row derived from the keys of rows[0].
  // Returns "" if rows is empty.
}
```

Rules:
- Header is derived from `Object.keys(rows[0])` — same order as the keys.
- Each cell value: if the value contains a comma, double-quote, or newline, wrap the whole cell in double quotes and escape any internal double quotes by doubling them (`"` → `""`).
- Use `\r\n` line endings (standard for CSV).
- All values are already strings when they arrive (from `shapeToCsvRows`).

---

## Step 4 — Add `createExportHandler`

Add this factory in `adminPreview.js`, export it, and register the route.

```js
export function createExportHandler({
  db = pool,
  pipeline = runPipeline,
  getAllowed = getAllowedExerciseIds,
  buildInputs = buildInputsFromProfile,
} = {}) {
  return async function exportHandler(req, res) { ... };
}

adminPreviewRouter.post("/preview/export-csv", createExportHandler());
```

### Request body validation

| Field | Type | Default | Validation |
|-------|------|---------|------------|
| `fitness_ranks` | int[] | `[1]` | each must be in [0,1,2,3] |
| `equipment_presets` | string[] | `["commercial_gym"]` | each must be in `VALID_PRESETS` |
| `program_types` | string[] | `ALL_PROGRAM_TYPES` | each must be in `ALL_PROGRAM_TYPES` |
| `days_per_week` | int | `3` | clamped 1–7 |
| `duration_mins` | int | `50` | clamped 20–120 |
| `field_set` | string | `"core"` | must be `"core"` (only valid value for now); return 400 for anything else |

Return `400` with `{ ok: false, error: "..." }` JSON for any invalid input.

### Execution logic

**Deduplicate DB queries per `(fitnessRank, equipmentPreset)` pair.** For each unique pair, call `buildPreviewInputs` once and cache the result. Then for each `programType`, run the pipeline using the cached inputs for the matching pair.

```
for each unique (fitnessRank, equipmentPreset):
  inputs = await buildPreviewInputs(...)

for each (fitnessRank, equipmentPreset, programType) combination:
  result = await pipeline({ db, inputs: cached[rank][preset].inputs, programType, request: cached[rank][preset].pipelineRequest })
  meta = build meta object from cached data
  rows = shapeToCsvRows(programType, { ok: true, program: result.program, debug: result.debug }, meta)
  allRows.push(...rows)

  if pipeline throws: push 0 rows for that combination (do not abort the whole export)
```

Build the `meta` object from the cached inputs data in the same shape as the existing preview handler's `meta`:

```js
{
  fitness_rank: fitnessRank,
  fitness_level: RANK_TO_LEVEL[fitnessRank],
  equipment_preset,
  equipment_slugs: cached.equipmentSlugs,
  days_per_week: daysPerWeek,
  duration_mins: durationMins,
  allowed_exercise_count: cached.allowedIds.length,
  exercise_name_map: cached.exerciseNameMap,
  rep_rule_map: cached.repRuleMap,
}
```

### Response

```js
res.setHeader("Content-Type", "text/csv; charset=utf-8");
res.setHeader(
  "Content-Disposition",
  `attachment; filename="preview-export-${Date.now()}.csv"`
);
res.send(rowsToCsv(allRows));
```

If `allRows` is empty after all combinations, still return a CSV with only the header row. To get the header from an empty result, call `shapeToCsvRows` with a synthetic empty preview to get column names, or derive the header from the known column list (hardcode the 27 column names as a fallback when there are no rows).

---

## Step 5 — Tests

Add to `api/src/routes/__tests__/adminPreview.test.js`, following the existing patterns (node:test, assert/strict, factory functions with dependency injection).

### Tests for `shapeToCsvRows`

```js
// Helpers
function makePreview(weeks) {
  return {
    ok: true,
    program: { weeks, narration: {} },
    debug: { step1: { config_key: "hypertrophy_default_v1" } },
  };
}
function makeMeta(overrides = {}) {
  return {
    fitness_rank: 1,
    fitness_level: "intermediate",
    equipment_preset: "commercial_gym",
    days_per_week: 3,
    duration_mins: 50,
    allowed_exercise_count: 80,
    exercise_name_map: { "42": "Barbell Squat" },
    rep_rule_map: {},
    ...overrides,
  };
}
```

Tests required:

1. **Returns empty array for failed preview** — `shapeToCsvRows("hypertrophy", { ok: false, error: "boom" }, makeMeta())` returns `[]`.

2. **Returns empty array for program with no weeks** — program has `weeks: []`, returns `[]`.

3. **Row count equals total exercise items** — build a program with 2 weeks × 1 day × 2 segments × 3 items each = 12 items. Assert `rows.length === 12`.

4. **Context columns are correctly propagated** — take the first row, assert `program_type`, `fitness_level`, `equipment_preset`, `config_key`, `week_number`, `day_number`, `segment_purpose`, `exercise_name` all have the expected values from the program/meta.

5. **exercise_order is 1-based and resets per segment** — build a segment with 3 items. Assert `exercise_order` values are `"1"`, `"2"`, `"3"`.

6. **exercise_name resolved from name map** — item has `ex_id: 42`, meta has `exercise_name_map: { "42": "Barbell Squat" }`. Assert `exercise_name === "Barbell Squat"`.

7. **exercise_name falls back to empty string when not in map** — item has `ex_id: 999`, map does not contain `999`. Assert `exercise_name === ""`.

8. **All 27 columns present in every row** — enumerate the 27 column names and assert each key exists in `Object.keys(rows[0])`.

9. **Unknown fieldSet returns empty array** — `shapeToCsvRows("hypertrophy", makePreview([...]), makeMeta(), "debug")` returns `[]`.

### Tests for `rowsToCsv`

10. **Empty input returns empty string** — `rowsToCsv([]) === ""`.

11. **Single row produces header + data** — `rowsToCsv([{ a: "1", b: "2" }])` produces `"a,b\r\n1,2\r\n"`.

12. **Commas in values are quoted** — value `"hello, world"` becomes `"\"hello, world\""` in output.

13. **Double quotes in values are escaped** — value `'say "hi"'` becomes `'"say ""hi"""'` in output.

14. **Column order follows key insertion order of first row**.

### Tests for `createExportHandler`

Use a mock res that captures `setHeader` calls and the `send` body:

```js
function mockCsvRes() {
  const r = { headers: {}, statusCode: 200, body: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}
```

15. **Returns 400 for invalid field_set** — `{ fitness_ranks: [1], field_set: "narration" }` → status 400.

16. **Returns 400 for out-of-range fitness_rank** — `{ fitness_ranks: [5] }` → status 400.

17. **Returns 400 for unknown equipment_preset** — `{ equipment_presets: ["moon_gym"] }` → status 400.

18. **Sets Content-Type and Content-Disposition headers** — valid request → `res.headers["Content-Type"]` starts with `"text/csv"`, `res.headers["Content-Disposition"]` contains `"attachment"`.

19. **CSV body contains header row** — valid request with one combination → first line of `res.body` equals the 27 column names joined by commas.

20. **Pipeline failure for one combination does not abort export** — export with 2 program types, pipeline throws for one. Handler completes with status 200, CSV body is valid (may have 0 exercise rows but header is present).

21. **Deduplication: DB queries run once per unique (rank, preset) pair** — export with `fitness_ranks: [1, 2]`, `equipment_presets: ["commercial_gym"]`, `program_types: ["hypertrophy", "strength"]`. Track call count to `buildPreviewInputs` (or mock the DB's `connect`). Assert DB is queried exactly twice (once per rank), not four times.

    For this test, inject a custom `getAllowed` and count calls: it should be called exactly 2 times (once per unique rank+preset pair), not 4 times (once per combination).

---

## Step 6 — UI changes in `preview.html`

Add an export panel to the header `<div class="header">`. Place it after the last existing `<div class="sep">` and the "Generate All" button block, as a new group:

```html
<div class="sep"></div>
<div class="ctrl-group">
  <span class="ctrl-label">Export</span>
  <select id="export-scope" style="font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:6px">
    <option value="current">Current selection</option>
    <option value="all_ranks">All fitness levels</option>
    <option value="all_presets">All equipment presets</option>
    <option value="all_types">All program types</option>
    <option value="full_matrix">Full matrix (slow)</option>
  </select>
  <select id="export-format" style="font-size:12px;padding:3px 6px;border:1px solid var(--border);border-radius:6px">
    <option value="core">Core</option>
  </select>
  <button id="export-btn" class="secondary">Export CSV</button>
  <span id="export-status" style="font-size:12px"></span>
</div>
```

Add the following JS in the `<script type="module">` block:

```js
document.getElementById("export-btn").addEventListener("click", async () => {
  const statusEl = document.getElementById("export-status");
  statusEl.textContent = "Exporting…";

  const scope = document.getElementById("export-scope").value;
  const fieldSet = document.getElementById("export-format").value;

  const currentRank = Number(selectedVal("rank-btns"));
  const currentPreset = selectedVal("preset-btns");
  const currentDpw = Number(selectedVal("dpw-btns"));
  const currentDur = Number(selectedVal("dur-btns"));

  const ALL_RANKS = [0, 1, 2, 3];
  const ALL_PRESETS = ["no_equipment", "minimal_equipment", "decent_home_gym", "commercial_gym", "crossfit_hyrox_gym"];
  const ALL_TYPES = ["hypertrophy", "strength", "conditioning", "hyrox"];

  let fitnessRanks, equipmentPresets, programTypes;
  switch (scope) {
    case "all_ranks":
      fitnessRanks = ALL_RANKS; equipmentPresets = [currentPreset]; programTypes = ALL_TYPES; break;
    case "all_presets":
      fitnessRanks = [currentRank]; equipmentPresets = ALL_PRESETS; programTypes = ALL_TYPES; break;
    case "all_types":
      fitnessRanks = [currentRank]; equipmentPresets = [currentPreset]; programTypes = ALL_TYPES; break;
    case "full_matrix":
      fitnessRanks = ALL_RANKS; equipmentPresets = ALL_PRESETS; programTypes = ALL_TYPES; break;
    default: // "current"
      fitnessRanks = [currentRank]; equipmentPresets = [currentPreset]; programTypes = ALL_TYPES; break;
  }

  try {
    const res = await fetch("/admin/preview/export-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-token": getToken() },
      body: JSON.stringify({
        fitness_ranks: fitnessRanks,
        equipment_presets: equipmentPresets,
        program_types: programTypes,
        days_per_week: currentDpw,
        duration_mins: currentDur,
        field_set: fieldSet,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `preview-export-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    statusEl.textContent = "Downloaded";
  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
  } finally {
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
  }
});
```

---

## Verification checklist

After implementation, verify:

1. `npm test` passes — all existing tests plus all new tests.
2. `POST /admin/preview/export-csv` with `{ "fitness_ranks": [1], "equipment_presets": ["commercial_gym"], "program_types": ["hypertrophy"], "days_per_week": 3, "duration_mins": 50, "field_set": "core" }` returns a valid CSV with exactly 27 columns and at least one data row.
3. The CSV header row is exactly: `program_type,config_key,fitness_level,fitness_rank,equipment_preset,days_per_week,duration_mins,allowed_exercise_count,week_number,week_phase,day_number,day_focus,day_duration_mins,segment_purpose,segment_type,segment_rounds,exercise_order,exercise_id,exercise_name,slot,sets,reps_prescribed,reps_unit,tempo,rir_target,rest_after_set_sec,rep_rule_id`
4. On the preview page, the Export panel is visible in the header. Clicking "Export CSV" with "Current selection" triggers a file download. The downloaded file opens in a spreadsheet/text editor and shows correct column headers and exercise data.
5. `POST /admin/preview/export-csv` with `{ "field_set": "narration" }` returns HTTP 400.
6. The existing `POST /admin/preview/generate` endpoint behaviour is unchanged.
