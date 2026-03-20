# Codex Implementation Prompts — Observability Dashboard

Seven sequential prompts. Each must be fully implemented and verified before the next begins.
The full architecture spec is in `docs/architecture.md` (or see inline context below).

**Stack reminders:**
- Node/Express ESM (`import`/`export`) throughout — no CommonJS `require()`
- PostgreSQL via shared `pg.Pool` from `api/src/db.js`
- Flyway migrations in `migrations/` — versioned (`V*.sql`) re-run never; repeatable (`R__*.sql`) re-run on checksum change
- Admin HTML pages are vanilla single-file HTML + inline JS — no bundler, no npm browser deps

---

## Prompt 1 — Schema migration

### Context

You are working in the `bubble-workout-engine` Node/Express API codebase.

The `generation_run` table (created in `migrations/V8__add_generation_tracking.sql`) currently stores
`id, program_id, status, last_stage, started_at, completed_at, failed_at, error_message, program_type,
days_per_week, anchor_date_ms, prompt_version, allowed_exercise_count, total_days_expected, emitter_rows_count,
created_at, updated_at`.

You need to add six new columns to capture debug data that the pipeline produces but currently discards.

### Files to read before writing anything

- `migrations/V8__add_generation_tracking.sql` — understand the existing table shape and column types.

### Task

**Create `migrations/V9__generation_run_debug.sql`** with exactly this content:

```sql
-- Add debug/observability columns to generation_run.
-- All columns are nullable so existing rows are unaffected.

ALTER TABLE generation_run
  ADD COLUMN IF NOT EXISTS config_key        text,
  ADD COLUMN IF NOT EXISTS fitness_rank       smallint,
  ADD COLUMN IF NOT EXISTS duration_mins      smallint,
  ADD COLUMN IF NOT EXISTS step1_stats_json   jsonb,
  ADD COLUMN IF NOT EXISTS step5_debug_json   jsonb,
  ADD COLUMN IF NOT EXISTS step6_debug_json   jsonb;

CREATE INDEX IF NOT EXISTS idx_gen_run_config_key
  ON generation_run (config_key)
  WHERE config_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gen_run_completed_at
  ON generation_run (completed_at DESC)
  WHERE completed_at IS NOT NULL;
```

### Verification

Run `docker compose run --rm flyway migrate` and confirm it completes without error.
Then run:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'generation_run'
ORDER BY ordinal_position;
```

Confirm `config_key`, `fitness_rank`, `duration_mins`, `step1_stats_json`, `step5_debug_json`,
`step6_debug_json` appear in the results.

---

## Prompt 2 — Instrument generation route to persist pipeline debug

### Context

You are working in the `bubble-workout-engine` Node/Express API codebase.

`runPipeline()` is called in `api/src/routes/generateProgramV2.js` and returns a `pipelineOut`
object whose `debug` tree contains rich per-step diagnostics. Currently this data is discarded
after the generation completes. You must persist the key debug blobs to the `generation_run` row
that was pre-created in Phase 2b of the same route.

The `generation_run` table now has the columns added in Prompt 1:
`config_key`, `fitness_rank`, `duration_mins`, `step1_stats_json`, `step5_debug_json`, `step6_debug_json`.

The Step 1 debug object (`pipelineOut.debug.step1`) is the `stats` object built in
`api/engine/steps/01_buildProgramFromDefinition.js`. It contains:
`duration_mins, block_budget, allowed_in, unique_used_week, picked_sw2_pref, picked_sw_pref,
picked_mp_pref, picked_sw2_relaxed, picked_sw_relaxed, picked_mp_relaxed, picked_allow_dup,
picked_seed_slot_aware, avoided_repeat_sw2, fills_add_sets, fill_failed, source, config_key,
equipment_profile, notes[]`.

The Step 5 debug object (`pipelineOut.debug.step5`) contains: `ok, source, templates_in, cfg, adoption, week_engine, weeks_enriched, weeks_adoption`.

The Step 6 debug object (`pipelineOut.debug.step6`) contains: `ok, weeks_emitted, days_per_week, preferred_days, start_offset_days, start_weekday, timing_cfg`.

### Files to read before writing anything

- `api/src/routes/generateProgramV2.js` — understand the full Phase 3–6 flow, where `pipelineOut` is assigned, and where the Phase 6 `status = 'complete'` UPDATE is written. Note that `pipelineOut.debug` and `pipelineOut.plan.debug` may both be checked (the route already checks both paths for `rows`).
- `api/engine/runPipeline.js` — confirm the exact shape of the returned object and which path (`debug` vs `plan.debug`) holds the step1/5/6 debug objects.

### Task

**Edit `api/src/routes/generateProgramV2.js`.**

After `pipelineOut` is validated (after the `if (!Array.isArray(rows) || rows.length === 0)` throw)
and **before** the Phase 6 `status = 'complete'` UPDATE, add a new debug-persist block:

```js
// Phase 3b: Persist pipeline debug to generation_run (best-effort — never throws).
try {
  const step1Debug = pipelineOut?.debug?.step1 ?? pipelineOut?.plan?.debug?.step1 ?? {};
  const step5Debug = pipelineOut?.debug?.step5 ?? pipelineOut?.plan?.debug?.step5 ?? {};
  const step6Debug = pipelineOut?.debug?.step6 ?? pipelineOut?.plan?.debug?.step6 ?? {};
  const step1Json = JSON.stringify(step1Debug);
  const step5Json = JSON.stringify(step5Debug);
  const step6Json = JSON.stringify(step6Debug);
  await pool.query(
    `UPDATE generation_run SET
       config_key       = $1,
       fitness_rank     = $2,
       duration_mins    = $3,
       step1_stats_json = $4::jsonb,
       step5_debug_json = $5::jsonb,
       step6_debug_json = $6::jsonb,
       updated_at       = now()
     WHERE id = $7`,
    [
      step1Debug.config_key ?? null,
      mappedFitnessRank ?? null,
      step1Debug.duration_mins ?? null,
      step1Json.length > 65536 ? null : step1Json,
      step5Json.length > 65536 ? null : step5Json,
      step6Json.length > 65536 ? null : step6Json,
      generation_run_id,
    ],
  );
} catch (debugErr) {
  console.error("generation_run debug persist failed (non-fatal):", debugErr?.message);
}
```

Do not change any other logic. Do not move the Phase 6 `status = 'complete'` UPDATE.

### Verification

Trigger a program generation via the mobile app or a direct API call. Then run:

```sql
SELECT id, config_key, fitness_rank, duration_mins,
       step1_stats_json->>'fill_failed' AS fill_failed,
       step1_stats_json->>'equipment_profile' AS equipment_profile,
       step5_debug_json->>'templates_in' AS templates_in
FROM generation_run
ORDER BY id DESC
LIMIT 1;
```

All columns should be non-null (unless the pipeline produced no Step 1 debug, which would indicate
an earlier bug).

---

## Prompt 3 — Backend observability router

### Context

You are working in the `bubble-workout-engine` Node/Express API codebase.

You are building a new Express router that powers the observability dashboard admin page.
All routes are internal-only (same `requireInternalToken` guard as all other admin routes).
All queries run against the existing `generation_run`, `program_exercise`, `exercise_catalogue`,
and `program` tables. No new tables are needed.

Existing admin route files to use as the canonical pattern:
`api/src/routes/adminCoverage.js` — study its import structure, router export, middleware use, and
`pool.query()` error handling before writing anything.

### Files to read before writing anything

- `api/src/routes/adminCoverage.js` — canonical route file pattern.
- `api/src/middleware/auth.js` — `requireInternalToken` usage.
- `api/src/db.js` — pool import path.
- `migrations/V8__add_generation_tracking.sql` — `generation_run` column names.
- `migrations/V9__generation_run_debug.sql` — the columns you added in Prompt 1.

### Task

**Create `api/src/routes/adminObservability.js`.**

Export `adminObservabilityRouter`. Use `requireInternalToken` on the router. Implement all seven
endpoints below using parameterised `pool.query()`. All parameters that accept query strings
must be validated and defaulted defensively (never pass raw strings directly into SQL — use `$N` params).

---

#### `GET /summary`

Query param: `days` (integer, default `30`, max `365`).

Returns:
```json
{
  "runs_total": 42,
  "runs_success": 40,
  "runs_failed": 2,
  "success_rate": 95.2,
  "mean_duration_s": 1.8,
  "daily_counts": [
    { "date": "2026-03-19", "count": 3, "success_count": 3 }
  ],
  "top_errors": [
    { "message": "Pipeline did not produce emitter rows", "count": 2 }
  ]
}
```

SQL guidance:
- `daily_counts`: group by `DATE(completed_at AT TIME ZONE 'UTC')` for success rows + outer-join
  all calendar dates in range so gaps show zeros. Simplest approach: fetch rows then fill gaps in JS.
- `top_errors`: `GROUP BY error_message ORDER BY count DESC LIMIT 5` where `status = 'failed'`.
- `mean_duration_s`: `AVG(EXTRACT(EPOCH FROM (completed_at - started_at)))` where both are non-null and status = 'complete'.

---

#### `GET /runs`

Query params: `limit` (int, default `50`, max `200`), `offset` (int, default `0`),
`status` (string, optional), `program_type` (string, optional).

Returns:
```json
{
  "rows": [
    {
      "id": 7,
      "program_id": 3,
      "status": "complete",
      "last_stage": "done",
      "program_type": "strength",
      "config_key": "strength_default_v1",
      "equipment_profile": "commercial_gym",
      "fitness_rank": 1,
      "duration_mins": 50,
      "days_per_week": 4,
      "allowed_exercise_count": 87,
      "total_days_expected": 28,
      "emitter_rows_count": 412,
      "fill_failed": 0,
      "completed_at": "2026-03-19T14:22:01.000Z",
      "error_message": null
    }
  ],
  "total": 42
}
```

`equipment_profile` and `fill_failed` are extracted from `step1_stats_json` JSONB:
```sql
step1_stats_json->>'equipment_profile' AS equipment_profile,
(step1_stats_json->>'fill_failed')::int AS fill_failed
```

Include a `COUNT(*) OVER()` window for `total` without a second query.

---

#### `GET /run/:id`

Returns the full `generation_run` row including `step1_stats_json`, `step5_debug_json`,
`step6_debug_json`. Return `404` with `{ ok: false, error: "Not found" }` if no row found.

---

#### `GET /fill-quality`

Query param: `days` (int, default `30`).

Returns:
```json
{
  "rows": [
    {
      "config_key": "strength_default_v1",
      "equipment_profile": "commercial_gym",
      "run_count": 12,
      "picked_sw2_pref": 144,
      "picked_sw_pref": 36,
      "picked_mp_pref": 20,
      "picked_sw2_relaxed": 5,
      "picked_sw_relaxed": 2,
      "picked_mp_relaxed": 1,
      "picked_allow_dup": 0,
      "fill_failed": 0,
      "total_picks": 208,
      "fail_rate_pct": 0.0
    }
  ]
}
```

SQL:
```sql
SELECT
  config_key,
  step1_stats_json->>'equipment_profile'               AS equipment_profile,
  COUNT(*)                                              AS run_count,
  SUM(COALESCE((step1_stats_json->>'picked_sw2_pref')::int,  0)) AS picked_sw2_pref,
  SUM(COALESCE((step1_stats_json->>'picked_sw_pref')::int,   0)) AS picked_sw_pref,
  SUM(COALESCE((step1_stats_json->>'picked_mp_pref')::int,   0)) AS picked_mp_pref,
  SUM(COALESCE((step1_stats_json->>'picked_sw2_relaxed')::int,0)) AS picked_sw2_relaxed,
  SUM(COALESCE((step1_stats_json->>'picked_sw_relaxed')::int, 0)) AS picked_sw_relaxed,
  SUM(COALESCE((step1_stats_json->>'picked_mp_relaxed')::int, 0)) AS picked_mp_relaxed,
  SUM(COALESCE((step1_stats_json->>'picked_allow_dup')::int,  0)) AS picked_allow_dup,
  SUM(COALESCE((step1_stats_json->>'fill_failed')::int,       0)) AS fill_failed
FROM generation_run
WHERE status = 'complete'
  AND step1_stats_json IS NOT NULL
  AND completed_at > now() - ($1 || ' days')::interval
GROUP BY 1, 2
ORDER BY 1, 2
```

Compute `total_picks` and `fail_rate_pct` in JS after the query.

---

#### `GET /exercise-frequency`

Query params: `days` (int, default `30`), `limit` (int, default `20`).

Returns:
```json
{
  "top_used": [
    { "exercise_id": "ex_abc", "name": "Barbell Back Squat", "movement_class": "squat_pattern", "count": 87 }
  ],
  "never_used": [
    { "exercise_id": "ex_xyz", "name": "Nordic Curl", "movement_class": "hinge_pattern" }
  ]
}
```

`top_used` query — join `program_exercise` to `exercise_catalogue`:
```sql
SELECT pe.exercise_id,
       ec.name,
       ec.movement_class,
       COUNT(*) AS count
FROM program_exercise pe
JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
JOIN program p ON p.id = pe.program_id
WHERE p.created_at > now() - ($1 || ' days')::interval
GROUP BY pe.exercise_id, ec.name, ec.movement_class
ORDER BY count DESC
LIMIT $2
```

`never_used` query:
```sql
SELECT ec.exercise_id, ec.name, ec.movement_class
FROM exercise_catalogue ec
WHERE ec.is_archived = false
  AND ec.exercise_id NOT IN (
    SELECT DISTINCT pe.exercise_id
    FROM program_exercise pe
    JOIN program p ON p.id = pe.program_id
    WHERE p.created_at > now() - ($1 || ' days')::interval
  )
ORDER BY ec.movement_class, ec.name
```

---

#### `GET /config-hits`

Query param: `days` (int, default `30`).

Returns:
```json
{
  "rows": [
    {
      "config_key": "strength_default_v1",
      "run_count": 12,
      "last_seen_at": "2026-03-19T14:22:01.000Z",
      "pct_of_total": 28.6,
      "days_since_last_seen": 0
    }
  ]
}
```

Compute `pct_of_total` and `days_since_last_seen` in JS after the query.

---

#### `GET /narration-adoption`

Query param: `days` (int, default `30`).

Returns:
```json
{
  "rows": [
    {
      "config_key": "strength_default_v1",
      "run_count": 12,
      "templates_in_avg": 48.2,
      "warmup_segment_added_days_total": 96,
      "cooldown_segment_added_days_total": 84,
      "used_item_reps_prescribed_total": 1440,
      "used_item_rir_target_total": 720,
      "used_item_tempo_prescribed_total": 0
    }
  ]
}
```

SQL — extract from `step5_debug_json->adoption->template`:
```sql
SELECT
  config_key,
  COUNT(*) AS run_count,
  AVG((step5_debug_json->>'templates_in')::numeric) AS templates_in_avg,
  SUM(COALESCE((step5_debug_json->'adoption'->'template'->>'warmup_segment_added_days')::int, 0)) AS warmup_segment_added_days_total,
  SUM(COALESCE((step5_debug_json->'adoption'->'template'->>'cooldown_segment_added_days')::int, 0)) AS cooldown_segment_added_days_total,
  SUM(COALESCE((step5_debug_json->'adoption'->'template'->>'used_item_reps_prescribed')::int, 0)) AS used_item_reps_prescribed_total,
  SUM(COALESCE((step5_debug_json->'adoption'->'template'->>'used_item_rir_target')::int, 0)) AS used_item_rir_target_total,
  SUM(COALESCE((step5_debug_json->'adoption'->'template'->>'used_item_tempo_prescribed')::int, 0)) AS used_item_tempo_prescribed_total
FROM generation_run
WHERE status = 'complete'
  AND step5_debug_json IS NOT NULL
  AND completed_at > now() - ($1 || ' days')::interval
GROUP BY 1
ORDER BY 1
```

---

### Verification

Mount the router in `api/server.js` (see Prompt 4 for the exact mount line). After mounting, hit:

```
GET /admin/api/observability/summary?days=30
GET /admin/api/observability/runs?limit=5
GET /admin/api/observability/fill-quality?days=30
```

Each should return `200` with valid JSON. If no `generation_run` rows have JSONB data yet
(Prompt 2 not yet run), `fill-quality` will return empty `rows: []` — that is correct.

---

## Prompt 4 — Mount router and serve HTML page stub

### Context

You are wiring the new observability router into the Express app and adding a stub HTML page
so the route is reachable in the browser before the full UI is built.

All existing admin pages follow this pattern in `api/server.js`:
- Static HTML served via `res.sendFile(join(__dirname, "admin/X.html"))` registered **before** the
  JSON body parser middleware (around line 155–157).
- Router imported and mounted with `app.use("/admin", router)` (around line 382–385).

### Files to read before writing anything

- `api/server.js` — understand the exact lines where other admin pages are registered (static
  `sendFile` routes ~155–157, router imports ~17–20, router mounts ~382–385).

### Tasks

**1. Edit `api/server.js`**

Add after the existing `app.get("/admin/narration", ...)` line:
```js
app.get("/admin/observability", (_req, res) => res.sendFile(join(__dirname, "admin/observability.html")));
```

Add after the existing admin router imports (lines ~17–20):
```js
import { adminObservabilityRouter } from "./src/routes/adminObservability.js";
```

Add after the existing `app.use("/admin", adminNarrationRouter)` line:
```js
app.use("/admin/api/observability", adminObservabilityRouter);
```

**2. Create stub `api/admin/observability.html`**

Create a minimal valid HTML file that:
- Has `<title>Observability — Workout Engine Admin</title>`
- Has `<h1>Observability Dashboard</h1>` and `<p>Loading...</p>` in the body
- Has the same `<nav>` sidebar links as `api/admin/coverage.html` PLUS a new
  `<a href="/admin/observability">Observability</a>` link

You will replace the body content entirely in Prompt 5. The stub just confirms the route works.

### Verification

Run `docker compose up -d --force-recreate api`. Navigate to `http://localhost:3000/admin/observability`.
You should see the stub page. The nav sidebar should include the Observability link.

---

## Prompt 5 — Add Observability nav link to existing admin pages

### Context

You need to add a nav link to the Observability dashboard in the three existing admin HTML pages
so users can navigate between all sections. The pages are single-file HTML — each has its own
inline `<style>` and `<nav>` block.

### Files to read before writing anything

Read all three files in full to understand their nav structure before making changes:
- `api/admin/index.html` (config editor — served at `/admin`)
- `api/admin/coverage.html` (slot coverage — served at `/admin/coverage`)
- `api/admin/exercises.html` (exercise catalogue — served at `/admin/exercises`)

Do NOT read `api/admin/narration.html` — leave that page unchanged for now.

### Task

In each of the three files above, find the `<nav>` element and add an `<a>` element for
Observability. The link text must be `Observability` and `href` must be `/admin/observability`.
Position it as the last item in the nav list, after any existing links.

Match the exact element type and class used by the surrounding nav items in each file
(they may differ between pages — copy whatever pattern already exists).

### Verification

Open each page in the browser and confirm the Observability link appears in the sidebar and
navigates correctly to `/admin/observability`.

---

## Prompt 6 — Full observability dashboard UI

### Context

You are building the full UI for `api/admin/observability.html`.

This is a vanilla single-file HTML + inline JS page — no bundler, no npm. It follows the same
patterns as `api/admin/coverage.html` (study that file as the primary reference):
- Auth: `localStorage.getItem("adminToken")` or a prompt on first load — copy the exact
  pattern from `coverage.html`.
- API calls: `apiFetch(path)` helper that sets `Authorization: Bearer <token>` header — copy
  from `coverage.html`.
- Styling: inline `<style>` block — copy the base CSS from `coverage.html` and extend it.
- Chart.js is loaded from CDN: `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>`

The observability API endpoints (all under `/admin/api/observability/`) were built in Prompt 3.

### Files to read before writing anything

- `api/admin/coverage.html` — copy auth pattern, `apiFetch()`, base CSS, nav sidebar, page init pattern.
- The backend route file `api/src/routes/adminObservability.js` — know the exact response shapes.

### Task

Replace the stub `api/admin/observability.html` (created in Prompt 4) with the full implementation.

#### Page structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Observability — Workout Engine Admin</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>/* see style spec below */</style>
</head>
<body>
  <nav><!-- same sidebar as other admin pages + Observability link active --></nav>
  <main>
    <div class="page-header">
      <h1>Observability</h1>
      <label>Period: <select id="period-select">
        <option value="7">7 days</option>
        <option value="30" selected>30 days</option>
        <option value="90">90 days</option>
      </select></label>
      <button id="refresh-btn">Refresh</button>
    </div>

    <div class="tab-bar">
      <button class="tab-btn active" data-tab="overview">Overview</button>
      <button class="tab-btn" data-tab="fill">Fill Quality</button>
      <button class="tab-btn" data-tab="config">Config / Rules</button>
      <button class="tab-btn" data-tab="exercises">Exercises</button>
    </div>

    <div id="tab-overview" class="tab-panel">
      <!-- KPI cards + daily chart + recent runs table -->
    </div>
    <div id="tab-fill" class="tab-panel hidden">
      <!-- Stacked bar chart + fill quality table -->
    </div>
    <div id="tab-config" class="tab-panel hidden">
      <!-- Config hit rate table + narration adoption table -->
    </div>
    <div id="tab-exercises" class="tab-panel hidden">
      <!-- Top used bar chart + never-used table -->
    </div>
  </main>

  <!-- Run detail modal -->
  <div id="run-modal" class="modal hidden">
    <div class="modal-box">
      <button id="modal-close">✕</button>
      <div id="modal-content"></div>
    </div>
  </div>

  <script>/* see JS spec below */</script>
</body>
</html>
```

#### Overview tab — KPI cards

Four cards in a `<div class="kpi-grid">`:
- **Total Runs** — `runs_total`
- **Success Rate** — `success_rate`% with badge colour: green ≥ 95%, amber 85–94%, red < 85%
- **Mean Duration** — `mean_duration_s`s
- **Failed Runs** — `runs_failed` with red badge if > 0

#### Overview tab — Daily run chart

A `<canvas id="daily-chart" height="180">` rendered with Chart.js:
```js
new Chart(ctx, {
  type: 'bar',
  data: {
    labels: daily_counts.map(d => d.date),
    datasets: [
      { label: 'Success', data: daily_counts.map(d => d.success_count), backgroundColor: '#22c55e' },
      { label: 'Failed',  data: daily_counts.map(d => d.count - d.success_count), backgroundColor: '#ef4444' },
    ],
  },
  options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } },
});
```

#### Overview tab — Recent runs table

Columns: `ID | Type | Config | Equipment | Rank | Duration | Status | Completed`.

`Status` cell: green badge for `complete`, red for `failed`, amber for anything else.

Each row is clickable: clicking opens the Run Detail Modal (see below).

Anomaly highlight: rows where `fill_failed > 0` get class `row-warn` (amber left border).

#### Fill Quality tab — stacked bar chart

One bar per `config_key`, stacked by tier: `sw2_pref` (darkest green) → `sw_pref` → `mp_pref` →
`sw2_relaxed` → `sw_relaxed` → `mp_relaxed` → `allow_dup` (amber) → `fail` (red).

Use Chart.js `type: 'bar'` with `stacked: true` on both axes.

Canvas: `<canvas id="fill-chart" height="220">`.

#### Fill Quality tab — fill quality table

Columns: `Config | Equipment | Runs | Pref Picks | Relaxed Picks | Dup Picks | Fails | Fail %`.

`Fail %` cell: green if 0%, amber if 0–5%, red if > 5%.

#### Config / Rules tab

Two tables:

**Config Hit Rate table** — columns: `Config Key | Runs | Last Seen | % of Total | Days Since Seen`.
Amber row if `days_since_last_seen > 7`. Red row if `> 14`.

**Narration Adoption table** — columns: `Config | Runs | Avg Templates | Warmup Added | Cooldown Added | Reps Prescribed | RIR Used | Tempo Used`.

#### Exercises tab

**Top Used bar chart** — horizontal `type: 'bar'` Chart.js, top 20 exercises.
Canvas: `<canvas id="exercise-chart" height="400">`.

**Never Used table** — columns: `Exercise ID | Name | Movement Class`.
Shows count in table header: `Never Used (N)`.

#### Run Detail Modal

Opened when a row in the recent runs table is clicked. Calls `GET /admin/api/observability/run/:id`.

Displays:
- Header: `Run #<id> — <program_type> / <config_key>`
- Two-column grid of metadata: status, last_stage, started_at, completed_at, duration, fitness_rank, duration_mins, days_per_week, allowed_exercise_count, total_days_expected, emitter_rows_count, fill_failed, equipment_profile
- Step 1 Stats collapsible section: renders `step1_stats_json` as a formatted key-value grid (not raw JSON)
- Step 5 Debug collapsible section: `<pre>` with `JSON.stringify(step5_debug_json, null, 2)`
- Step 6 Debug collapsible section: `<pre>` with `JSON.stringify(step6_debug_json, null, 2)`

Null JSONB fields display as `— (no debug data for this run)`.

Close on clicking `✕` button or clicking outside the modal box.

#### JS structure

Use the following top-level structure (all inline in `<script>`):

```js
// ── Auth ─────────────────────────────────────────────────────────────────────
// (copy exact pattern from coverage.html)

// ── State ────────────────────────────────────────────────────────────────────
let chartDaily = null;
let chartFill = null;
let chartExercise = null;

// ── Tab switching ─────────────────────────────────────────────────────────────
// Wire tab-btn clicks: toggle .active on buttons, toggle .hidden on tab-panels

// ── Period selector ──────────────────────────────────────────────────────────
// On #period-select change or #refresh-btn click: call loadAll()

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadAll() { /* call all load functions in parallel with Promise.all */ }
async function loadOverview(days) { /* fetch /summary + /runs, render KPIs + chart + table */ }
async function loadFillQuality(days) { /* fetch /fill-quality, render chart + table */ }
async function loadConfigHits(days) { /* fetch /config-hits + /narration-adoption, render tables */ }
async function loadExercises(days) { /* fetch /exercise-frequency, render chart + table */ }

// ── Chart helpers ─────────────────────────────────────────────────────────────
function renderDailyChart(daily_counts) { /* destroy existing + new Chart */ }
function renderFillChart(rows) { /* destroy existing + new Chart */ }
function renderExerciseChart(top_used) { /* destroy existing + new Chart */ }

// ── Modal ─────────────────────────────────────────────────────────────────────
async function openRunModal(id) { /* fetch /run/:id, render modal content, show modal */ }
function closeModal() { /* hide modal */ }

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // wire tab buttons, period select, refresh btn, modal close
  loadAll();
});
```

Always destroy Chart.js instances before re-rendering (call `.destroy()` on the stored ref).
This prevents canvas-reuse errors when the period changes.

#### CSS additions (extend base CSS from coverage.html)

```css
.kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
.kpi-card { background: #1e1e2e; border-radius: 8px; padding: 16px; }
.kpi-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: .05em; }
.kpi-value { font-size: 28px; font-weight: 700; margin-top: 4px; }
.badge-green { color: #22c55e; }
.badge-amber { color: #f59e0b; }
.badge-red   { color: #ef4444; }
.tab-bar { display: flex; gap: 4px; margin-bottom: 16px; }
.tab-btn { padding: 6px 14px; border-radius: 6px; border: 1px solid #333; background: transparent; color: #ccc; cursor: pointer; }
.tab-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
.tab-panel.hidden { display: none; }
.row-warn td:first-child { border-left: 3px solid #f59e0b; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal.hidden { display: none; }
.modal-box { background: #1e1e2e; border-radius: 10px; padding: 24px; max-width: 760px; width: 90vw; max-height: 80vh; overflow-y: auto; position: relative; }
#modal-close { position: absolute; top: 12px; right: 12px; background: none; border: none; color: #aaa; font-size: 18px; cursor: pointer; }
.collapsible-header { cursor: pointer; user-select: none; padding: 8px 0; font-weight: 600; }
.collapsible-body { display: none; }
.collapsible-body.open { display: block; }
pre { background: #111; border-radius: 6px; padding: 12px; overflow-x: auto; font-size: 12px; }
```

### Verification

1. Open `http://localhost:3000/admin/observability` in the browser.
2. All four tabs must render without JS errors.
3. If `generation_run` rows exist with JSONB data (Prompt 2 has run), Fill Quality tab must show
   data. If not, it shows empty tables — that is correct.
4. Click a row in the Recent Runs table — the modal opens and closes cleanly.
5. Change the period selector from 30 to 7 days — all sections reload and charts re-render
   without canvas errors.
6. Run `docker compose logs api` — no errors logged during page load.

---

## Prompt 7 — Anomaly badge counts on tab buttons

### Context

The tab buttons in the observability dashboard should show a count of active anomalies
(amber/red conditions) so users can see at a glance which area needs attention without
clicking every tab.

This is the final polish step. All data is already loaded by Prompt 6's `loadAll()` function —
this prompt only adds badge rendering on top of existing data.

### Files to read before writing anything

- `api/admin/observability.html` — the file you built in Prompt 6. Read it in full.

### Task

**Edit `api/admin/observability.html`** to add anomaly badge counts to the four tab buttons.

#### Anomaly definitions

After each data-load function completes, compute anomaly counts using these rules and store
them in a top-level `let anomalies = { fill: 0, config: 0, exercises: 0, overview: 0 }` object.

**Overview anomalies** (computed in `loadOverview`):
- `+1` if `success_rate < 95`
- `+1` per unique `error_message` in `top_errors` (i.e. `top_errors.length`)

**Fill Quality anomalies** (computed in `loadFillQuality`):
- `+1` per row where `fail_rate_pct > 2`
- `+1` per row where `allowed_in` average would be < 30 (use `step1_stats_json->>'allowed_in'`
  — note: this field is not in the current `/fill-quality` endpoint; skip this sub-check if
  the field is absent from the response)

**Config anomalies** (computed in `loadConfigHits`):
- `+1` per row where `days_since_last_seen > 7`

**Exercise anomalies** (computed in `loadExercises`):
- `+1` if `never_used.length > 0` (just one flag, not per-exercise)

#### Badge rendering

After updating `anomalies`, call `renderAnomalyBadges()`:

```js
function renderAnomalyBadges() {
  const map = { overview: 'overview', fill: 'fill', config: 'config', exercises: 'exercises' };
  for (const [tab, key] of Object.entries(map)) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if (!btn) continue;
    // Remove existing badge
    btn.querySelector('.anomaly-badge')?.remove();
    const count = anomalies[key];
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'anomaly-badge';
      badge.textContent = count;
      btn.appendChild(badge);
    }
  }
}
```

Add to CSS:
```css
.anomaly-badge {
  display: inline-block;
  background: #f59e0b;
  color: #000;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  margin-left: 6px;
  vertical-align: middle;
}
```

Call `renderAnomalyBadges()` at the end of each `loadX()` function (after updating `anomalies`)
and also at the start of `loadAll()` with all zeros to clear stale badges on refresh.

### Verification

1. Trigger a generation run that has fill failures (or seed `step1_stats_json` with `fill_failed > 0`
   directly via SQL for testing).
2. Open the observability dashboard — the Fill Quality tab button should show a badge.
3. Refresh — badges update correctly.
4. Period change — badges recompute and update.
