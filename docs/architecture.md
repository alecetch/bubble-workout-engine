# Architecture Overview

This document summarises the current architecture of `bubble-workout-engine`.

> **Note on naming:** Several database columns and API fields (e.g. `bubble_user_id`, `bubble_client_profile_id`) retain their original names for backwards compatibility. There is **no active integration with the Bubble platform** — these fields are now treated as opaque external identifiers supplied by the mobile client.

---

## 1) System Overview

The repo contains:
- A Node.js/Express API (`api/`)
- Flyway SQL migrations (`migrations/`)
- Project docs (`docs/`)

The React Native mobile app lives in a separate repository and integrates entirely via HTTP APIs exposed by this service.

### High-Level Diagram

```text
+-------------------------------+
| React Native App (ext repo)   |
| - profile setup               |
| - program view / workout log  |
+---------------+---------------+
                |
                | HTTPS (Fly.io or LAN)
                v
+---------------------------------------------------------------+
|                    Node/Express API (api/)                    |
|                                                               |
|  Core routes                                                  |
|  - POST /api/user/bootstrap                                   |
|  - POST /api/client_profile/bootstrap                         |
|  - POST /api/program/generate                                 |
|  - POST /api/import/emitter                                   |
|  - GET  /api/program/:id/overview                             |
|  - GET  /api/day/:id/full                                     |
|  - GET  /api/client_profile/:id/allowed_exercises             |
|  - POST /api/segment-log  (workout logging)                   |
|  - GET  /api/history/*    (programs, timeline, PRs, exercises)|
|  - GET  /reference-data   (equipment catalogue + config)      |
|                                                               |
|  Engine                                                       |
|  - runPipeline -> steps 01..06 -> emitted rows               |
|                                                               |
|  Services                                                     |
|  - buildInputsFromDevProfile (pipeline input assembly)        |
|  - importEmitterService (transactional ingest + idempotency)  |
|  - calendarCoverage, mediaAssets, narrationTemplates,         |
|    programGenerationConfig, repRules                          |
+--------------------------+------------------------------------+
                           |
                           | pg (pool)
                           v
+--------------------------------------------------+
| Postgres (db container / Fly managed Postgres)   |
| - app_user, client_profile                       |
| - program, program_week, program_day             |
| - workout_segment, program_exercise              |
| - exercise_catalogue, equipment_items            |
| - media_assets                                   |
| - program_generation_config                      |
| - rep_rules, narration_templates                 |
| - segment_exercise_log, estimated_1rm            |
+--------------------------+-----------------------+
                           ^
                           | Flyway migrate
+--------------------------+-----------------------+
| Flyway (migrations/V*__*.sql, R__*.sql)          |
+--------------------------------------------------+

Object storage (MinIO locally / S3-compatible in prod):
API -> MinIO/S3 (media-asset image files)
URL assembled at read time: image_key + S3_PUBLIC_BASE_URL
```

---

## 2) Backend Structure

### Entry point
`api/server.js`
- Loads env via `dotenv/config`.
- Configures global JSON parser with raw body capture.
- Registers all route modules.
- Serves static media assets from `/app/assets/media-assets`.
- Exposes `GET /health`.
- Provides `GET /reference-data` (equipment items + config lookup for mobile onboarding screens).

### Database access
`api/src/db.js` — exports a shared `pg.Pool` configured by env vars.

### Route modules (`api/src/routes/`)

| File | Route(s) | Purpose |
|---|---|---|
| `userBootstrap.js` | `POST /api/user/bootstrap` | Upserts `app_user` by external user ID |
| `clientProfileBootstrap.js` | `POST /api/client_profile/bootstrap` | Upserts `client_profile` and links to user |
| `generateProgramV2.js` | `POST /api/program/generate` | Full generation + persist flow (see §4) |
| `importEmitter.js` | `POST /api/import/emitter` | Raw emitter row ingest (for external callers) |
| `readProgram.js` | `GET /api/program/:id/overview`, `GET /api/day/:id/full` | Program + day read views |
| `debugAllowedExercises.js` | `GET /api/client_profile/:id/allowed_exercises` | Debug: exercise filtering by profile |
| `segmentLog.js` | `POST /api/segment-log`, `PATCH /api/segment-log/:id` | Workout logging |
| `loggedExercises.js` | `GET /api/logged-exercises` | Per-exercise log history |
| `historyPrograms.js` | `GET /api/history/programs` | Completed/active program list |
| `historyTimeline.js` | `GET /api/history/timeline` | Chronological workout feed |
| `historyOverview.js` | `GET /api/history/overview` | Aggregate stats |
| `historyPersonalRecords.js` | `GET /api/history/personal-records` | PRs by exercise |
| `historyExercise.js` | `GET /api/history/exercise/:id` | Per-exercise history |
| `sessionHistoryMetrics.js` | `GET /api/session-history-metrics` | Session-level metrics |
| `prsFeed.js` | `GET /api/prs-feed` | Recent PR feed |

### Service layer (`api/src/services/`)

| File | Purpose |
|---|---|
| `buildInputsFromDevProfile.js` | Assembles the pipeline `inputs` object from Postgres `client_profile`, exercise catalogue, and seeded DB config rows. **Primary source for all pipeline inputs — no external API calls.** |
| `importEmitterService.js` | Transactional ingest of PRG/WEEK/DAY/SEG/EX rows with advisory lock + payload hash idempotency. |
| `programGenerationConfig.js` | Fetches active `program_generation_config` rows (progression parameters, week phase sequences). |
| `repRules.js` | Fetches active `rep_rules` rows (rep range, tempo, RIR rules keyed by movement/class). |
| `narrationTemplates.js` | Fetches active `narration_templates` rows (per-week programme text templates). |
| `mediaAssets.js` | Fetches active `media_assets` rows (hero images for programs and days). |
| `calendarCoverage.js` | Ensures `program_calendar` rows cover all scheduled days after generation. |

---

## 3) The Generation Pipeline

The pipeline is the core of the engine. It is invoked by `generateProgramV2.js` and orchestrated by `api/engine/runPipeline.js`. It is **purely functional**: each step receives a program object, enriches it, and returns it. All DB lookups happen before the steps run (in `runPipeline.js`) or are pre-fetched via services.

### `runPipeline.js` — Orchestrator

Before invoking steps, `runPipeline.js`:
1. Fetches all required DB config upfront: media assets, narration templates, rep rules, program generation config.
2. Selects the active config row for the requested `programType` and `schemaVersion`.
3. Resolves fallback chains for each resource: **DB → request override → hardcoded defaults**.
4. Attaches program-level and day-level hero media to the enriched program object.
5. Returns the full result: `{ program, rows, plan, debug }`.

### Pipeline Steps

```
inputs (assembled from DB client_profile + seeded config via buildInputsFromDevProfile)
  │
  ▼
Step 01 — buildBasicHypertrophyProgram     [api/engine/steps/01_buildBasicHypertrophyProgram.js]
  │
  │  Inputs:  catalog_json (exercise index with movement metadata, swap groups, warmup hooks)
  │           allowed_exercise_ids (pre-filtered list from getAllowedExercises)
  │           client_profile (equipment slugs, fitness rank, injury flags, preferred days)
  │
  │  Output:  program.days[] — flat array of template training days.
  │           Each day has blocks[]: exercise slots with exercise ID, name, sets,
  │           movement class, movement pattern, density, and swap group metadata.
  │           Also: program.days_per_week, program.program_type, program.title
  │
  │  Note:    This step contains the hypertrophy-specific logic for how training days
  │           are structured, which exercise slots are created, and how the exercise
  │           catalogue is queried. It is the primary candidate for extension when
  │           supporting additional program types.
  │
  ▼
Step 02 — segmentHypertrophy               [api/engine/steps/02_segmentHypertrophy.js]
  │
  │  Inputs:  program.days[].blocks[]
  │
  │  Output:  program.days[].segments[] — blocks grouped into workout segments.
  │           Block letter (A, B, C…) determines grouping: same letter = superset/giant set,
  │           different letter = separate segment. FILL/MISSING placeholders resolved here.
  │           Each segment has: type (single/superset/giant), items[], rounds.
  │
  ▼
Step 03 — applyProgression                 [api/engine/steps/03_applyProgression.js]
  │
  │  Inputs:  program_generation_config row (progression_by_rank_json, week_phase_config_json,
  │           total_weeks_default), fitness_rank, program_length override
  │
  │  Output:  program.weeks[] — expands template days into a full multi-week program.
  │           Phases: BASELINE → BUILD → BUILD → CONSOLIDATE (configurable).
  │           Each week contains week_index, phase_label, and days[] (deep copies of
  │           template days with adjusted set counts per the progression schedule).
  │
  ▼
Step 04 — applyRepRules                    [api/engine/steps/04_applyRepRules.js]
  │
  │  Inputs:  rep_rules rows (from DB, keyed by movement_class, movement_pattern,
  │           lift_class, complexity_rank, is_loadable, program phase).
  │           Falls back to catalog_json.rep_rules_json if DB unavailable.
  │
  │  Output:  Enriches exercises on both program.days[] and program.weeks[w].days[]:
  │           - rep_range  (e.g. "8-12 reps")
  │           - tempo      (e.g. "3-1-1")
  │           - rir        (reps in reserve)
  │           - rest_seconds
  │
  ▼
Step 05 — applyNarration                   [api/engine/steps/05_applyNarration.js]
  │
  │  Inputs:  narration_templates rows (from DB, per-week phase text templates).
  │           program_generation_config (week phase labels), fitness_rank, program_length.
  │           Falls back to catalog_json.narration_json if DB unavailable.
  │
  │  Output:  Enriched program, week, and day objects with titles/summaries/notes:
  │           - program.title, program.summary, program.hero_caption
  │           - week.focus, week.notes, week.phase_label
  │           - day.title, day.subtitle, day.notes
  │           Warmup and cooldown segment stubs inserted into day.segments (idempotent).
  │
  ▼
Step 06 — emitPlan                         [api/engine/steps/06_emitPlan.js]

  Inputs:  Narration-enriched program, catalog_json (for warmup hook timing fallback),
           anchor_day_ms, preferred_days_json, timing knobs (all optional).

  Output:  rows[] — pipe-delimited strings in the emitter format:
           PRG|…   (1 row)   — program header
           WEEK|…  (n rows)  — one per week
           DAY|…   (n rows)  — one per training day
           SEG|…   (n rows)  — one per workout segment
           EX|…    (n rows)  — one per exercise in a segment

           Scheduled dates derived from preferred_days_json + anchor_day_ms.
           Segment durations computed from rep/set/tempo math + warmup/cooldown allocations.
```

### Current constraint: hypertrophy only

Step 01 and the `runPipeline` program-type routing currently only support `programType = "hypertrophy"`. The remaining steps are largely generic — program structure, exercise selection logic, and block patterns are concentrated in step 01 and the seeded `program_generation_config` rows.

Extensibility to additional program types (strength, conditioning, Hyrox, etc.) will require:
- Step 01 variants (or a configurable step 01 driven by a program-type config schema)
- Additional `program_generation_config` seed rows per program type
- Possibly separate segmentation logic in step 02 for non-hypertrophy block structures
- Potentially new `rep_rules` and `narration_templates` rows per program type

### Supporting engine files

| File | Purpose |
|---|---|
| `api/engine/getAllowedExercises.js` | SQL filter against `exercise_catalogue` by fitness rank, injury flags, and equipment slugs. Returns `exercise_id[]` used by step 01. |
| `api/engine/resolveHeroMedia.js` | Resolves hero media asset rows by scope (`program` / `program_day`), program type, and day focus slug (`upper_body` / `lower_body` / `full_body`). Uses a fallback cascade: exact match → full_body → no-focus → type-any → generic → first-in-scope. |

---

## 4) Request / Data Flow

### Identity bootstrap
1. Mobile app calls `POST /api/user/bootstrap` with an external `bubble_user_id`.
2. API upserts `app_user` and returns the internal `user_id` (UUID).

### Profile bootstrap
1. Mobile app calls `POST /api/client_profile/bootstrap` with profile fields.
2. API normalises option slugs and upserts `client_profile` linked to `app_user`.
3. Profile becomes canonical in Postgres — it is the sole input source for generation.

### Program generation + persist
1. Mobile app calls `POST /api/program/generate`.
2. `generateProgramV2.js` resolves `app_user` and `client_profile` from Postgres.
3. Calls `getAllowedExerciseIds` to compute the exercise filter from the catalogue.
4. Calls `buildInputsFromDevProfile` to assemble the full pipeline `inputs` object.
5. Calls `runPipeline({ inputs, programType, request, db })`.
6. `runPipeline` fetches DB config, runs steps 01→06, returns `{ program, rows }`.
7. Calls `importEmitterPayload(rows)` to persist all data in a single DB transaction.
8. Calls `ensureProgramCalendarCoverage` to fill calendar rows for the mobile calendar view.
9. Returns `{ program_id, counts, idempotent, allowed_count }`.

### Workout logging
1. Mobile app calls `POST /api/segment-log` during a session.
2. API upserts `segment_exercise_log` rows with sets/reps/weight.
3. History and PR endpoints read back from these logs.

### Read path
1. Mobile app calls overview/day read routes.
2. API resolves ownership (by `user_id` or `bubble_user_id`) and serves assembled views from Postgres joins.

### Caching
- No distributed cache (Redis/Memcached) is implemented.
- Data consistency relies on Postgres and transactional writes.

---

## 5) Data Model

Migrations in `migrations/` define schema evolution via Flyway.

### Versioned migrations (`V*__*.sql`)

| Migration | Purpose |
|---|---|
| V1 | Core program tables: `program`, `program_week`, `program_day`, `workout_segment`, `program_exercise`, `program_calendar` |
| V2 | Performance indexes |
| V3 | `app_user` table (external ID → internal UUID mapping) |
| V4 | `exercise_catalogue` table |
| V5 | `client_profile` table |
| V6 | Ownership foreign keys |
| V7 | `equipment_items` table |
| V8 | Generation tracking columns (`generation_id`, `generation_status`) |
| V9 | `hero_media_id` on `program` and `program_day` |
| V10 | Nullable calendar FK + recovery day support |
| V11–V12 | Additional indexes for cursor/history queries |
| V13 | `media_assets` table |
| V14 | `program_generation_config`, `rep_rules`, `narration_templates` tables |
| V15 | `is_active` flag on `narration_templates` |
| V16 | Unique constraint on `segment_exercise_log` |
| V17 | `strength_primary_region` on `exercise_catalogue` |
| V18 | `estimated_1rm_kg` on program exercise / log tables |

### Repeatable migrations (`R__*.sql`)
Seed data, re-applied whenever the file checksum changes:

| File | Contents |
|---|---|
| `R__seed_exercise_catalogue.sql` | Full exercise catalogue (83 exercises) |
| `R__seed_equipment_items.sql` | Equipment lookup rows |
| `R__seed_media_assets.sql` | Hero image asset rows |
| `R__seed_program_generation_config.sql` | Progression config for hypertrophy (phases, set increments) |
| `R__seed_program_rep_rules.sql` | Rep range / tempo / RIR rules |
| `R__seed_narration_template.sql` | Week narration text templates |

### Core ownership model
- `app_user.bubble_user_id` — external identifier supplied by the mobile client (legacy name; treated as an opaque string)
- `client_profile.user_id` — FK to `app_user`; all generation is scoped to this profile
- `program.user_id` — FK to `app_user`; all read/write enforces ownership

---

## 6) Environment & Deployment

### Docker Compose (local dev)
- `db`: Postgres 16
- `api`: Node 20, mounts `./api:/app` and `./assets:/app/assets`; `working_dir: /app`
- `flyway`: runs migrations from `./migrations`
- `minio` + `minio-init` + `minio-seed`: local S3-compatible object store for media assets

### Production
- Deployed to [Fly.io](https://fly.io) (`api/fly.toml`).
- Postgres: Fly managed Postgres.
- Media assets: served from `/app/assets/media-assets` (volume-mounted).

### Key environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP listen port (default 3000) |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Postgres connection |
| `PGPOOL_MAX` | pg pool size (optional) |
| `ENGINE_KEY` | Auth header `x-engine-key` for the legacy `/generate-plan` route |
| `INTERNAL_API_TOKEN` | Auth header `X-Internal-Token` for guarded write routes |
| `S3_PUBLIC_BASE_URL` | Base URL prepended to `image_key` when constructing media asset URLs. Must use LAN IP (not `localhost`) for on-device mobile dev. |

---

## 7) Key Architectural Decisions

### 1. Self-contained — no external platform dependency
All pipeline inputs (exercise catalogue, config, client profile) are sourced from Postgres. There are no runtime calls to any external API. The `bubble_*` naming in the schema is a legacy artefact; those fields are external-ID fields supplied by the mobile client.

### 2. Postgres as canonical writer
All generated program data is written in a single transaction via `importEmitterService`. Advisory locks and payload hashing provide deterministic idempotency.

### 3. DB-driven pipeline configuration
Rep rules, narration templates, program generation config (progression schedules, phase sequences), and media assets are all stored in Postgres and fetched at generation time. Configuration changes deploy via Flyway migration without code changes.

### 4. Six-step pipeline with explicit boundaries
Each step is a pure function (`program in → enriched program out`). Steps are independently testable. The orchestrator (`runPipeline.js`) owns all DB fetches and fallback resolution; steps themselves do not query the DB.

### 5. Emitter row format
Step 06 emits pipe-delimited strings (`PRG|WEEK|DAY|SEG|EX`) that are parsed and persisted by `importEmitterService`. This format provides a stable, inspectable wire format between the engine and the persistence layer.

### 6. Pipeline currently hypertrophy-only
Step 01 and the program-type routing in `runPipeline` are written for hypertrophy. The architecture is structured to support additional program types (strength, conditioning, Hyrox) by introducing step 01 variants and additional seeded config rows. See §3 for extensibility notes.

### 7. Known technical debt
- `bubble_*` column names are legacy; could be renamed to `external_user_id` etc. in a future migration.
- Some routes mount route-level `express.json()` middleware despite a global parser already being present.
- No centralised observability stack — logs are console JSON/text.
