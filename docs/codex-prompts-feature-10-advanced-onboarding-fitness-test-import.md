# Codex Prompt: Feature 10 — Advanced Onboarding: Fitness Test Mode and Training History Import

## Context for Codex

You are implementing Feature 10 (Advanced Onboarding) for a Node/Express workout API.  
Stack: Node 22 ESM, Express, PostgreSQL via `pg` pool, Flyway migrations.

Key conventions:
- API is under `api/` — all files use `import`/`export` (ESM)
- Database pool is exported from `api/src/db.js` as `pool`
- Auth middleware: `requireAuth` (JWT, sets `req.auth.user_id`) from `api/src/middleware/requireAuth.js`
- `userAuth = [requireAuth]` in `api/src/middleware/chains.js`
- Routes are registered in `api/server.js`
- Migrations are Flyway versioned SQL files in `migrations/`; latest is `V68` (from Feature 9) or `V65` if Feature 9 has not shipped yet — use the next available version number

### Existing anchor-lift architecture (do not replace, only extend)

- `client_anchor_lift` table already exists — one row per `(client_profile_id, estimation_family)`, with `UNIQUE` constraint on that pair
- The table already has a `source TEXT NOT NULL DEFAULT 'onboarding'` column
- `anchorLiftService.js` at `api/src/services/anchorLiftService.js` exports `makeAnchorLiftService(db)` → `{ upsertAnchorLifts, getAnchorLifts }`
- `upsertAnchorLifts(clientProfileId, anchors[])` does an INSERT…ON CONFLICT…DO UPDATE — it blindly overwrites the existing row, regardless of source
- `guidelineLoadService.js` at `api/src/services/guidelineLoadService.js` exports `makeGuidelineLoadService(db)` → `{ annotateExercisesWithGuidelineLoads }`
- `annotateExercisesWithGuidelineLoads` already handles: exact-exercise anchor, same-family anchor, cross-family anchor — in that priority order
- It returns exercises with `guideline_load: { value, unit, confidence, confidence_score, source, reasoning, set_1_rule }` — or the exercise unchanged if no anchor is available
- `fitness_rank` is an `int` column on `client_profile` (0 = not set; 1–4 = beginner/intermediate/advanced/elite)
- `fitness_level_slug` is a `TEXT` column on `client_profile` (values: `"beginner"`, `"intermediate"`, `"advanced"`, `"elite"`)
- `exercise_load_estimation_family_config` table stores cross-family conversion factors (`source_family`, `target_family`, `cross_family_factor`) — it is **not** a per-family config table and should not be repurposed

### Anchor source precedence (new concept introduced in this feature)

Higher-priority sources must not be silently overwritten by lower-priority sources. The precedence order from highest to lowest:

1. `manual` / `manual_update` (explicit user correction)
2. `fitness_test` (guided in-session test)
3. `history_import` (derived from CSV)
4. `onboarding` / `skipped` (legacy/fallback)

When upserting an anchor, only overwrite if the incoming source has priority ≥ the existing source priority. If the incoming source is lower priority, skip the upsert silently.

### New packages needed

Add to `api/package.json` dependencies before implementing:
- `multer` — multipart/form-data handling for file upload
- `csv-parse` — CSV parsing (use the sync or async/callback API from `csv-parse/sync` or `csv-parse`)

Run `npm install multer csv-parse` inside `api/`.

---

## Part 1: Migration — `client_anchor_lift.source_detail_json`

The `source` column already exists in `client_anchor_lift`. Do **not** add it again.

Create the next available migration file (e.g., `migrations/V69__add_source_detail_to_anchor_lift.sql`):

```sql
-- Add source_detail_json to client_anchor_lift for import traceability.
-- source column already exists — do not add it again.

ALTER TABLE client_anchor_lift
  ADD COLUMN IF NOT EXISTS source_detail_json JSONB NOT NULL DEFAULT '{}'::jsonb;
```

---

## Part 2: Migration — `exercise_estimation_family_rank_defaults`

Create `migrations/V70__create_exercise_estimation_family_rank_defaults.sql`.

This is a per-family lookup table for conservative default loads by fitness rank. It is **separate** from `exercise_load_estimation_family_config` (which stores cross-family conversion factors and should not be repurposed).

```sql
-- migrations/V70__create_exercise_estimation_family_rank_defaults.sql

CREATE TABLE IF NOT EXISTS exercise_estimation_family_rank_defaults (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  estimation_family    TEXT    NOT NULL UNIQUE,
  rank_default_loads_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Shape: { "beginner": 40, "intermediate": 80, "advanced": 100, "elite": 120 }
  default_unit         TEXT    NOT NULL DEFAULT 'kg',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed conservative defaults for the main barbell families.
-- Values intentionally conservative — used only when no anchor or history exists.
INSERT INTO exercise_estimation_family_rank_defaults
  (estimation_family, rank_default_loads_json, default_unit)
VALUES
  ('squat',     '{"beginner": 40, "intermediate": 80, "advanced": 110, "elite": 140}'::jsonb, 'kg'),
  ('hinge',     '{"beginner": 50, "intermediate": 90, "advanced": 120, "elite": 160}'::jsonb, 'kg'),
  ('horizontal_push', '{"beginner": 30, "intermediate": 60, "advanced": 90, "elite": 120}'::jsonb, 'kg'),
  ('vertical_push',   '{"beginner": 25, "intermediate": 50, "advanced": 75, "elite": 100}'::jsonb, 'kg'),
  ('horizontal_pull', '{"beginner": 30, "intermediate": 55, "advanced": 80, "elite": 105}'::jsonb, 'kg'),
  ('vertical_pull',   '{"beginner": 35, "intermediate": 60, "advanced": 85, "elite": 110}'::jsonb, 'kg')
ON CONFLICT (estimation_family) DO NOTHING;
```

---

## Part 3: Migration — `training_history_import` and `exercise_import_alias`

Create `migrations/V71__create_training_history_import_tables.sql`.

```sql
-- migrations/V71__create_training_history_import_tables.sql

-- Import tracking: one row per submitted CSV upload
CREATE TABLE IF NOT EXISTS training_history_import (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  client_profile_id UUID        NULL REFERENCES client_profile(id) ON DELETE SET NULL,
  source_app        TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'processing',
  summary_json      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ NULL,

  CONSTRAINT chk_thi_status
    CHECK (status IN ('processing', 'completed', 'completed_with_warnings', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_thi_user_id
  ON training_history_import (user_id, created_at DESC);

-- Row-level import trace (optional but recommended for debugging)
CREATE TABLE IF NOT EXISTS training_history_import_row (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id             UUID    NOT NULL REFERENCES training_history_import(id) ON DELETE CASCADE,
  raw_exercise_name     TEXT    NOT NULL,
  mapped_exercise_id    TEXT    NULL,
  mapped_estimation_family TEXT NULL,
  weight_kg             NUMERIC NULL,
  reps                  INT     NULL,
  performed_at          DATE    NULL,
  mapping_confidence    TEXT    NULL,
  warning_code          TEXT    NULL
);

CREATE INDEX IF NOT EXISTS idx_thi_row_import_id
  ON training_history_import_row (import_id);

-- Exercise name alias table: maps source-app exercise names to canonical IDs/families
CREATE TABLE IF NOT EXISTS exercise_import_alias (
  id                    UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  source_app            TEXT    NOT NULL,
  source_name_normalized TEXT   NOT NULL,
  exercise_id           TEXT    NULL REFERENCES exercise_catalogue(exercise_id) ON DELETE SET NULL,
  estimation_family     TEXT    NULL,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT uq_exercise_import_alias UNIQUE (source_app, source_name_normalized)
);

CREATE INDEX IF NOT EXISTS idx_eia_lookup
  ON exercise_import_alias (source_app, source_name_normalized)
  WHERE is_active = TRUE;

-- Seed known Hevy exercise names (extend this list as needed)
INSERT INTO exercise_import_alias (source_app, source_name_normalized, exercise_id, estimation_family)
VALUES
  ('hevy', 'barbell back squat',       'bb_back_squat',       'squat'),
  ('hevy', 'barbell squat',            'bb_back_squat',       'squat'),
  ('hevy', 'squat (barbell)',          'bb_back_squat',       'squat'),
  ('hevy', 'barbell deadlift',         'bb_conventional_deadlift', 'hinge'),
  ('hevy', 'deadlift (barbell)',       'bb_conventional_deadlift', 'hinge'),
  ('hevy', 'romanian deadlift',        NULL,                  'hinge'),
  ('hevy', 'barbell bench press',      'bb_bench_press_flat', 'horizontal_push'),
  ('hevy', 'bench press (barbell)',    'bb_bench_press_flat', 'horizontal_push'),
  ('hevy', 'incline bench press',      NULL,                  'horizontal_push'),
  ('hevy', 'overhead press (barbell)', NULL,                  'vertical_push'),
  ('hevy', 'barbell overhead press',   NULL,                  'vertical_push'),
  ('hevy', 'ohp',                      NULL,                  'vertical_push'),
  ('hevy', 'barbell row',              NULL,                  'horizontal_pull'),
  ('hevy', 'bent over row (barbell)',  NULL,                  'horizontal_pull'),
  ('hevy', 'pull up',                  NULL,                  'vertical_pull'),
  ('hevy', 'pull-up',                  NULL,                  'vertical_pull'),
  ('hevy', 'lat pulldown',             NULL,                  'vertical_pull')
ON CONFLICT (source_app, source_name_normalized) DO NOTHING;
```

---

## Part 4: Update `anchorLiftService.js` — source precedence on upsert

Edit `api/src/services/anchorLiftService.js`.

### 4a — Add a source priority helper

Add near the top of the file (before `normalizeAnchorLiftInput`):

```js
// api/src/services/anchorLiftService.js — add this helper

const SOURCE_PRIORITY = {
  manual: 4,
  manual_update: 4,
  fitness_test: 3,
  history_import: 2,
  onboarding: 1,
  skipped: 0,
};

function sourcePriority(src) {
  return SOURCE_PRIORITY[src] ?? 1;
}
```

### 4b — Add `sourceDetailJson` to `normalizeAnchorLiftInput`

Add `sourceDetailJson` extraction to the returned object:

```js
return {
  estimationFamily: safeString(value.estimationFamily ?? value.estimation_family).toLowerCase(),
  exerciseId: safeString(value.exerciseId ?? value.exercise_id) || null,
  loadKg: toNumber(value.loadKg ?? value.load_kg),
  reps: value.reps == null ? null : Number.parseInt(String(value.reps), 10),
  rir: toNumber(value.rir),
  skipped: Boolean(value.skipped),
  source: safeString(value.source) || null,
  sourceDetailJson: (value.sourceDetailJson ?? value.source_detail_json) || {},
};
```

### 4c — Enforce source precedence in `upsertAnchorLifts`

Replace the `db.query` INSERT block inside the `for` loop. Before inserting, fetch the existing row's source to check priority. Only write if the incoming source has equal or higher priority than the existing one:

```js
// In upsertAnchorLifts, inside the for loop, replace the db.query call:

const incomingSource = lift.source || (lift.skipped ? "skipped" : "onboarding");
const incomingPriority = sourcePriority(incomingSource);

// Check existing source priority before overwriting
const existingR = await db.query(
  `SELECT source FROM client_anchor_lift
   WHERE client_profile_id = $1 AND estimation_family = $2`,
  [clientProfileId, estimationFamily],
);
const existingSource = existingR.rows[0]?.source ?? null;
if (existingSource && sourcePriority(existingSource) > incomingPriority) {
  // Existing anchor has higher priority — skip this upsert
  continue;
}

const result = await db.query(
  `
  INSERT INTO client_anchor_lift (
    client_profile_id,
    estimation_family,
    exercise_id,
    load_kg,
    reps,
    rir,
    skipped,
    source,
    source_detail_json
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (client_profile_id, estimation_family)
  DO UPDATE SET
    exercise_id        = EXCLUDED.exercise_id,
    load_kg            = EXCLUDED.load_kg,
    reps               = EXCLUDED.reps,
    rir                = EXCLUDED.rir,
    skipped            = EXCLUDED.skipped,
    source             = EXCLUDED.source,
    source_detail_json = EXCLUDED.source_detail_json,
    updated_at         = now()
  RETURNING *
  `,
  [
    clientProfileId,
    estimationFamily,
    lift.skipped ? null : lift.exerciseId,
    lift.skipped ? null : lift.loadKg,
    lift.skipped ? null : lift.reps,
    lift.skipped ? null : lift.rir,
    lift.skipped,
    incomingSource,
    JSON.stringify(lift.sourceDetailJson ?? {}),
  ],
);
saved.push(result.rows[0]);
```

Note: the `continue` statement works here because this code is inside a `for...of` loop.

---

## Part 5: Update `guidelineLoadService.js` — rank-default fallback

Edit `api/src/services/guidelineLoadService.js`.

### 5a — Add rank-default query to `annotateExercisesWithGuidelineLoads`

Add `exercise_estimation_family_rank_defaults` to the parallel query block:

```js
// Replace the existing Promise.all block:
const [targetResult, anchorResult, familyConfigResult, rankDefaultResult] = await Promise.all([
  db.query(
    `SELECT exercise_id, equipment_items_slugs, load_estimation_metadata
     FROM exercise_catalogue WHERE exercise_id = ANY($1::text[])`,
    [exerciseIds],
  ),
  db.query(
    `SELECT cal.*, ec.load_estimation_metadata
     FROM client_anchor_lift cal
     LEFT JOIN exercise_catalogue ec ON ec.exercise_id = cal.exercise_id
     WHERE cal.client_profile_id = $1 AND cal.skipped = false
     ORDER BY cal.updated_at DESC`,
    [clientProfileId],
  ),
  db.query(
    `SELECT source_family, target_family, cross_family_factor
     FROM exercise_load_estimation_family_config`,
  ),
  db.query(
    `SELECT estimation_family, rank_default_loads_json, default_unit
     FROM exercise_estimation_family_rank_defaults`,
  ),
]);
```

### 5b — Build a `rankDefaults` map after the query

After building `familyFactors`:

```js
// Map estimation_family → { loads: {...}, unit }
const rankDefaults = new Map(
  rankDefaultResult.rows.map((r) => [
    r.estimation_family,
    { loads: r.rank_default_loads_json ?? {}, unit: r.default_unit ?? "kg" },
  ]),
);
```

### 5c — Apply rank-default fallback in the per-exercise map

In the `.map((exercise) => { ... })` block, after the section that returns `exercise` unchanged when `!chosenAnchor || chosenAnchor.load_kg == null`, add the rank-default path:

```js
// After the existing anchor-not-found early return:
if (!chosenAnchor || chosenAnchor.load_kg == null) {
  // Try rank-default fallback
  const rankDefault = rankDefaults.get(target.estimation_family);
  const fitnessLevelSlug = profile.fitness_level_slug || "beginner";
  if (rankDefault && rankDefault.loads[fitnessLevelSlug] != null) {
    const defaultLoad = Number(rankDefault.loads[fitnessLevelSlug]);
    const increment = inferIncrement(target, exercise.exercise_id);
    const roundedValue = floorToIncrement(defaultLoad, increment);
    if (roundedValue > 0) {
      return {
        ...exercise,
        guideline_load: {
          value: roundedValue,
          unit: rankDefault.unit,
          confidence: "low",
          confidence_score: 5,
          source: "rank_default",
          reasoning: [
            `Estimated from conservative ${fitnessLevelSlug} defaults for the ${target.estimation_family.replace(/_/g, " ")} family.`,
            "Use set 1 to calibrate before continuing.",
          ],
          set_1_rule: buildSet1Rule("low"),
        },
      };
    }
  }
  return exercise;
}
```

Also add `fitness_level_slug` to the profile query near the top of `annotateExercisesWithGuidelineLoads`:

```js
// Replace the existing profile query:
const profileResult = await db.query(
  `SELECT fitness_rank, fitness_level_slug, anchor_lifts_skipped, anchor_lifts_collected_at
   FROM client_profile WHERE id = $1 LIMIT 1`,
  [clientProfileId],
);
```

---

## Part 6: CSV import service

Create `api/src/services/trainingHistoryImportService.js`.

This module handles the full Hevy CSV import pipeline:

1. Parse raw CSV bytes
2. Normalize rows
3. Map exercise names to families via `exercise_import_alias`
4. Filter to last-90-day rows
5. Pick the best working set per family
6. Upsert into `client_anchor_lift` via `anchorLiftService`
7. Persist import record + row traces
8. Return structured result

```js
// api/src/services/trainingHistoryImportService.js
import { parse } from "csv-parse/sync";
import { makeAnchorLiftService } from "./anchorLiftService.js";

// Normalize a raw exercise name for alias lookup
function normalizeExerciseName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toFloat(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toInt(value) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

// Best working-set heuristic: heaviest recent set (3–12 reps, non-zero weight)
// Tie-breakers: higher weight → more recent → reps closer to 5
function pickBestWorkingSet(rows) {
  const eligible = rows.filter(
    (r) => r.weight_kg != null && r.weight_kg > 0 && r.reps != null && r.reps >= 3 && r.reps <= 12,
  );
  if (!eligible.length) return null;
  eligible.sort((a, b) => {
    if (b.weight_kg !== a.weight_kg) return b.weight_kg - a.weight_kg;
    if (b.performed_at !== a.performed_at) return b.performed_at > a.performed_at ? 1 : -1;
    return Math.abs(a.reps - 5) - Math.abs(b.reps - 5);
  });
  return eligible[0];
}

export function makeTrainingHistoryImportService(db) {
  const anchorLiftService = makeAnchorLiftService(db);

  async function processHevyCsv({ csvBuffer, userId, clientProfileId }) {
    // Step 1: parse CSV
    let records;
    try {
      records = parse(csvBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (err) {
      throw Object.assign(new Error("CSV parse error: " + err.message), { code: "csv_parse_error" });
    }

    // Step 2: normalize rows
    // Hevy CSV columns: Date, Workout Name, Exercise Name, Set Order, Weight, Reps, RPE, Notes, ...
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    const normalized = [];
    for (const record of records) {
      const rawName = record["Exercise Name"] ?? record["exercise_name"] ?? "";
      const rawDate = record["Date"] ?? record["date"] ?? "";
      const rawWeight = record["Weight"] ?? record["weight"] ?? "";
      const rawReps = record["Reps"] ?? record["reps"] ?? "";

      const performedAt = rawDate ? new Date(rawDate) : null;
      if (!performedAt || Number.isNaN(performedAt.getTime())) continue;
      if (performedAt < cutoffDate) continue;

      normalized.push({
        raw_exercise_name: rawName,
        normalized_name: normalizeExerciseName(rawName),
        weight_kg: toFloat(rawWeight),
        reps: toInt(rawReps),
        performed_at: performedAt.toISOString().slice(0, 10),
      });
    }

    // Step 3: map exercise names to families via alias table
    const uniqueNames = [...new Set(normalized.map((r) => r.normalized_name))];
    const aliasResult = await db.query(
      `SELECT source_name_normalized, exercise_id, estimation_family
       FROM exercise_import_alias
       WHERE source_app = 'hevy'
         AND source_name_normalized = ANY($1::text[])
         AND is_active = TRUE`,
      [uniqueNames],
    );
    const aliasMap = new Map(
      aliasResult.rows.map((r) => [r.source_name_normalized, r]),
    );

    // Step 4: group rows by estimation_family
    const byFamily = new Map();
    const rowTraces = [];
    let unmappedCount = 0;

    for (const row of normalized) {
      const alias = aliasMap.get(row.normalized_name);
      if (!alias || !alias.estimation_family) {
        unmappedCount++;
        rowTraces.push({
          raw_exercise_name: row.raw_exercise_name,
          mapped_exercise_id: null,
          mapped_estimation_family: null,
          weight_kg: row.weight_kg,
          reps: row.reps,
          performed_at: row.performed_at,
          mapping_confidence: "none",
          warning_code: "unmapped_exercise_name",
        });
        continue;
      }

      const family = alias.estimation_family;
      if (!byFamily.has(family)) byFamily.set(family, []);
      byFamily.get(family).push({
        ...row,
        mapped_exercise_id: alias.exercise_id,
        mapped_estimation_family: family,
      });
      rowTraces.push({
        raw_exercise_name: row.raw_exercise_name,
        mapped_exercise_id: alias.exercise_id,
        mapped_estimation_family: family,
        weight_kg: row.weight_kg,
        reps: row.reps,
        performed_at: row.performed_at,
        mapping_confidence: "alias",
        warning_code: null,
      });
    }

    // Step 5: pick best working set per family and build derived anchors
    const derivedAnchors = [];
    for (const [family, rows] of byFamily) {
      const best = pickBestWorkingSet(rows);
      if (!best) continue;
      derivedAnchors.push({
        estimationFamily: family,
        exerciseId: best.mapped_exercise_id,
        loadKg: best.weight_kg,
        reps: best.reps,
        rir: null,
        skipped: false,
        source: "history_import",
        sourceDetailJson: { source_app: "hevy", performed_at: best.performed_at },
      });
    }

    // Step 6: create import record
    const importStatus =
      derivedAnchors.length === 0
        ? "failed"
        : unmappedCount > 0
        ? "completed_with_warnings"
        : "completed";

    const importR = await db.query(
      `INSERT INTO training_history_import
         (user_id, client_profile_id, source_app, status, summary_json)
       VALUES ($1, $2, 'hevy', 'processing', '{}'::jsonb)
       RETURNING id`,
      [userId, clientProfileId],
    );
    const importId = importR.rows[0].id;

    // Step 7: upsert derived anchors
    const warnings = [];
    let savedAnchors = [];
    if (derivedAnchors.length > 0 && clientProfileId) {
      try {
        savedAnchors = await anchorLiftService.upsertAnchorLifts(clientProfileId, derivedAnchors);
      } catch (err) {
        warnings.push({ code: "anchor_upsert_error", message: err.message });
      }
    } else if (!clientProfileId) {
      warnings.push({ code: "no_client_profile", message: "No client profile — anchors not saved." });
    }

    if (unmappedCount > 0) {
      warnings.push({
        code: "unmapped_exercise_name",
        message: `Could not map ${unmappedCount} row${unmappedCount === 1 ? "" : "s"} to a supported estimation family.`,
      });
    }

    // Step 8: persist row traces (best-effort)
    if (rowTraces.length > 0) {
      try {
        for (const trace of rowTraces) {
          await db.query(
            `INSERT INTO training_history_import_row
               (import_id, raw_exercise_name, mapped_exercise_id, mapped_estimation_family,
                weight_kg, reps, performed_at, mapping_confidence, warning_code)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              importId,
              trace.raw_exercise_name,
              trace.mapped_exercise_id,
              trace.mapped_estimation_family,
              trace.weight_kg,
              trace.reps,
              trace.performed_at,
              trace.mapping_confidence,
              trace.warning_code,
            ],
          );
        }
      } catch (_) {
        // row tracing is non-critical — swallow errors
      }
    }

    // Step 9: finalize import record
    const summaryJson = {
      total_rows: normalized.length,
      mapped_rows: normalized.length - unmappedCount,
      unmapped_rows: unmappedCount,
      derived_anchors: derivedAnchors.length,
      warnings,
    };
    await db.query(
      `UPDATE training_history_import
       SET status = $1, summary_json = $2, completed_at = now()
       WHERE id = $3`,
      [importStatus, JSON.stringify(summaryJson), importId],
    );

    return {
      import_id: importId,
      status: importStatus,
      derived_anchor_lifts: derivedAnchors.map((a) => ({
        estimation_family: a.estimationFamily,
        exercise_id: a.exerciseId,
        load_kg: a.loadKg,
        reps: a.reps,
        source: a.source,
      })),
      warnings,
      summary: summaryJson,
    };
  }

  async function getImport(importId, userId) {
    const { rows } = await db.query(
      `SELECT id, source_app, status, summary_json, created_at, completed_at
       FROM training_history_import
       WHERE id = $1 AND user_id = $2`,
      [importId, userId],
    );
    return rows[0] ?? null;
  }

  return { processHevyCsv, getImport };
}
```

---

## Part 7: Training history import routes

Create `api/src/routes/trainingHistoryImport.js`.

Uses `multer` for multipart upload and `makeTrainingHistoryImportService` for processing.

```js
// api/src/routes/trainingHistoryImport.js
import express from "express";
import multer from "multer";
import { pool } from "../db.js";
import { userAuth } from "../middleware/chains.js";
import { makeTrainingHistoryImportService } from "../services/trainingHistoryImportService.js";

export const trainingHistoryImportRouter = express.Router();

const SUPPORTED_SOURCES = ["hevy"];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter(_req, file, cb) {
    // Accept only CSV-ish MIME types
    if (
      file.mimetype === "text/csv" ||
      file.mimetype === "text/plain" ||
      file.mimetype === "application/octet-stream" ||
      file.originalname?.toLowerCase().endsWith(".csv")
    ) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error("Only CSV files are supported."), { code: "unsupported_file_type" }));
    }
  },
});

// POST /api/import/training-history
// Body: multipart/form-data — fields: file (CSV), source_app
trainingHistoryImportRouter.post(
  "/training-history",
  userAuth,
  upload.single("file"),
  async (req, res, next) => {
    try {
      const userId = req.auth.user_id;
      const sourceApp = (req.body?.source_app ?? "").trim().toLowerCase();

      if (!SUPPORTED_SOURCES.includes(sourceApp)) {
        return res.status(400).json({
          ok: false,
          code: "unsupported_source_app",
          error: `source_app must be one of: ${SUPPORTED_SOURCES.join(", ")}`,
        });
      }

      if (!req.file) {
        return res.status(400).json({ ok: false, code: "missing_file", error: "A CSV file is required." });
      }

      // Resolve client profile id for the authenticated user
      const profileR = await pool.query(
        `SELECT id FROM client_profile WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      const clientProfileId = profileR.rows[0]?.id ?? null;

      const importService = makeTrainingHistoryImportService(pool);
      const result = await importService.processHevyCsv({
        csvBuffer: req.file.buffer,
        userId,
        clientProfileId,
      });

      const statusCode = result.status === "failed" ? 422 : 200;
      return res.status(statusCode).json({ ok: result.status !== "failed", ...result });
    } catch (err) {
      if (err.code === "csv_parse_error") {
        return res.status(400).json({ ok: false, code: "csv_parse_error", error: err.message });
      }
      return next(err);
    }
  },
);

// GET /api/import/training-history/:import_id
trainingHistoryImportRouter.get(
  "/training-history/:import_id",
  userAuth,
  async (req, res, next) => {
    try {
      const userId = req.auth.user_id;
      const importService = makeTrainingHistoryImportService(pool);
      const record = await importService.getImport(req.params.import_id, userId);
      if (!record) {
        return res.status(404).json({ ok: false, error: "Import not found." });
      }
      return res.json({ ok: true, import: record });
    } catch (err) {
      return next(err);
    }
  },
);
```

---

## Part 8: Register routes in `api/server.js`

Add to `api/server.js`:

```js
// Add with other route imports:
import { trainingHistoryImportRouter } from "./src/routes/trainingHistoryImport.js";

// Mount (add alongside other app.use calls):
app.use("/api/import", trainingHistoryImportRouter);
```

---

## Part 9: Tests

Create `api/src/services/__tests__/trainingHistoryImportService.test.js`.

Cover the following cases:

### CSV parsing

- valid Hevy CSV with known exercises derives correct anchors
- `source_app` other than `"hevy"` — route returns `400`
- malformed CSV (no columns header) — returns `400` with `code: "csv_parse_error"`
- empty file (zero data rows after header) — returns `status: "failed"`

### 90-day filtering

- rows older than 90 days are excluded from anchor derivation
- rows exactly at the boundary (today − 90) are included

### Best-working-set heuristic

- chooses heaviest row in the 3–12 rep range
- excludes reps < 3 and reps > 12
- excludes zero-weight rows
- among equal-weight rows, picks the more recent one
- among equal-weight, equal-date rows, picks the set closer to 5 reps

### Exercise alias mapping

- exact alias match maps correctly to `estimation_family`
- exercise name not in alias table → warning with `code: "unmapped_exercise_name"`
- `completed_with_warnings` status when at least one family mapped but some rows unmapped
- `completed` status when all rows mapped

### Source precedence in `upsertAnchorLifts`

- `history_import` anchor does NOT overwrite an existing `manual` anchor
- `history_import` anchor does NOT overwrite an existing `fitness_test` anchor
- `fitness_test` anchor DOES overwrite an existing `history_import` anchor
- `manual` anchor DOES overwrite any lower-priority anchor
- same-priority re-upsert still updates (e.g., `manual` over `manual`)

### Rank-default fallback in `guidelineLoadService`

- when no anchor and no logged history exists for an estimatable family, returns `guideline_load` with `source: "rank_default"` and `confidence: "low"`
- returned value matches the `fitness_level_slug` row in `exercise_estimation_family_rank_defaults`
- non-estimatable exercises still return `guideline_load: null`
- if an anchor (any source) exists, rank-default is NOT used

---

## Implementation notes

- `multer` must be installed before the upload route can run. If it is missing, import will fail at startup — install it with `npm install multer csv-parse` inside `api/`.
- The `csv-parse/sync` import uses the named export `parse`. ESM import: `import { parse } from "csv-parse/sync";`
- Hevy CSV column names vary slightly across export versions. The parser checks both cased and lowercase variants (`"Exercise Name"` and `"exercise_name"`). If you encounter a new column layout during testing, add a fallback in `normalizeRows`.
- `source_detail_json` is stored as a JSONB column — always stringify before passing to `pg` (use `JSON.stringify(obj)`).
- The rank-default fallback must only trigger when **all three** prior anchor sources return nothing: no recent history match, no exact-exercise anchor, no same-family anchor, no cross-family anchor. It is the last resort before returning `null`. Do not break the existing fallback chain — insert the rank-default path after the cross-family check fails.
- `fitness_level_slug` values in the DB are `"beginner"`, `"intermediate"`, `"advanced"`, `"elite"`. If a user's slug is empty or unrecognized, default to `"beginner"` for rank-default lookup.
