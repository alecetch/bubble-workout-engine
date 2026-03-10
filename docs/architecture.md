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
Step 01 — buildProgramFromDefinition       [api/engine/steps/01_buildProgramFromDefinition.js]
  │
  │  Inputs:  compiledConfig.builder (day_templates, sets_by_duration, block_budget,
  │                                   slot_defaults, exclude_movement_classes)
  │           catalog_json (exercise index with movement metadata, swap groups, warmup hooks)
  │           allowed_exercise_ids (pre-filtered list from getAllowedExercises)
  │           client_profile (equipment slugs, fitness rank, injury flags, preferred days)
  │
  │  Output:  program.days[] — flat array of template training days.
  │           Each day has blocks[]: exercise slots with exercise ID, name, sets,
  │           movement class, movement pattern, density, and swap group metadata.
  │           Also: program.days_per_week, program.program_type, program.title
  │
  │  Note:    Fully generic — day structure and exercise slot definitions are driven
  │           entirely by compiledConfig.builder. No program-type-specific logic here.
  │
  ▼
Step 02 — segmentProgram                   [api/engine/steps/02_segmentProgram.js]
  │
  │  Inputs:  program.days[].blocks[]
  │           compiledConfig.segmentation.blockSemantics
  │
  │  Output:  program.days[].segments[] — blocks grouped into workout segments.
  │           Block letter (A, B, C…) determines grouping type via blockSemantics:
  │           "single" = each exercise its own segment; "superset" = first two paired;
  │           "giant_set" = first three grouped. FILL/MISSING placeholders resolved here.
  │           Each segment has: type (single/superset/giant_set), items[], rounds.
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

### Config-driven multi-type support

Steps 01 and 02 are now **fully generic** — all program-type-specific logic has been extracted into the `program_generation_config` table. Adding a new program type (conditioning, Hyrox, etc.) requires only a new seed row; no code changes.

The `compiledConfig` object is assembled once per generation request inside `runPipeline.js` and threaded through Steps 01 and 02. It has three top-level sections:

```
compiledConfig
├── builder            — Controls Step 01 (exercise selection & day structure)
│   ├── day_templates[]       Day blueprint array (one entry per training day template)
│   │   ├── day_key           Unique identifier (e.g. "day1")
│   │   ├── focus             Semantic focus label (e.g. "lower", "upper_strength")
│   │   └── ordered_slots[]   Ordered exercise slots; each slot has:
│   │       ├── slot          "<block_letter>:<slot_name>"  (e.g. "A:squat", "C:arms")
│   │       ├── sw / sw2      Swap-group keys (exercise catalogue lookup)
│   │       ├── mp            Movement pattern filter
│   │       ├── requirePref   Preference tier ("strength_main" | "hypertrophy_secondary")
│   │       ├── preferLoadable  Favour barbell/dumbbell exercises in this slot
│   │       └── fill_fallback_slot  Fallback slot key if this slot cannot be filled
│   ├── sets_by_duration      Sets per block letter keyed by session length (40/50/60 min)
│   │                         e.g. { "50": { "A": 4, "B": 3, "C": 3, "D": 2 } }
│   ├── block_budget          Max blocks per session keyed by session length
│   ├── slot_defaults         Default requirePref by block letter (applied to all slots in that block)
│   └── exclude_movement_classes  Movement classes never selected (e.g. "cardio")
│
├── segmentation       — Controls Step 02 (how blocks are grouped into segments)
│   └── block_semantics       Object keyed by block letter (A / B / C / D):
│       ├── preferred_segment_type   "single" | "superset" | "giant_set"
│       └── purpose                  "main" | "secondary" | "accessory"
│
└── progression        — Controls Step 03 (which segments receive weekly set increments)
    └── apply_to_purposes     Array of purposes that receive progression
                              e.g. ["main", "secondary", "accessory"]
```

The top-level `progression_by_rank_json` and `week_phase_config_json` columns on the config row control the numeric set-increment schedule and phase sequence respectively (see §3 Step 03).

### Where to tune program behaviour

| What you want to change | Where to change it |
|---|---|
| Add/remove an exercise slot in a day | `builder.day_templates[n].ordered_slots` |
| Change which exercises are selected (swap groups) | `sw` / `sw2` / `mp` fields on the relevant slot |
| Change preference tier (strength vs hypertrophy selection) | `requirePref` on the slot, or `slot_defaults` for the whole block letter |
| Change set counts by session duration | `builder.sets_by_duration` |
| Cap the number of blocks in a session | `builder.block_budget` |
| Change whether a block is singles, supersets, or giant sets | `segmentation.block_semantics.<letter>.preferred_segment_type` |
| Add a new program type | New seed row in `R__seed_program_generation_config.sql` |
| Change weekly set progression steps | `progression_by_rank_json` (per fitness rank) |
| Change phase sequence or labels | `week_phase_config_json.default_phase_sequence` |

All changes to the seed file are picked up automatically the next time Flyway runs (the file is a repeatable migration — `R__*.sql` — and re-executes whenever its checksum changes).

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
| `R__seed_program_generation_config.sql` | Full `compiledConfig` JSONB for each program type (`hypertrophy_default_v1`, `strength_default_v1`): builder (day templates, sets, block budget), segmentation (block semantics), and progression config |
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

### 6. Config-driven multi-type pipeline
Steps 01 and 02 are fully generic. Program-type behaviour (day templates, exercise slot definitions, block grouping semantics, set counts, progression) is driven entirely by the `program_generation_config_json` JSONB column. Adding a new program type requires only a new seed row — no code changes. The `compiledConfig` object is assembled and validated once in `runPipeline.js`, then threaded through all dependent steps. See §3 for the full config schema.

### 7. Known technical debt
- `bubble_*` column names are legacy; could be renamed to `external_user_id` etc. in a future migration.
- Some routes mount route-level `express.json()` middleware despite a global parser already being present.
- No centralised observability stack — logs are console JSON/text.

---

## 8) Local Dev vs TestFlight — Keeping Configs Separate

The mobile app reads its API URL and engine key from Expo environment files at **build time**:

| File | Used by | Contents |
|---|---|---|
| `mobile/.env` | EAS / TestFlight builds | Production `fly.dev` URL + production `ENGINE_KEY` |
| `mobile/.env.local` | Local Expo dev server only | LAN IP URL + local `ENGINE_KEY` + `REACT_NATIVE_PACKAGER_HOSTNAME` |

Both files are gitignored. `.env.local` takes precedence over `.env` when running `expo start` locally.
When EAS builds for TestFlight it does **not** pick up `.env.local` — only `.env` (and any EAS secrets configured in `eas.json`) are used. **Local config is never promoted to TestFlight.**

To switch between local and production during development:
- Local: `cd mobile && npx expo start` — `.env.local` is active automatically.
- TestFlight: push to `main`, trigger EAS build — `.env` (or EAS secrets) are used.

---

## 9) Config Management UI (Admin Panel)

A lightweight laptop-only admin panel for editing `program_generation_config` rows without touching SQL or running Flyway migrations.

### Design Goals
- Read and write `program_generation_config` rows directly via the API.
- Structured editing (not raw JSON) for all commonly tuned fields, including day templates and slot definitions.
- Raw JSON fallback editor for edge cases and bulk edits.
- Never accessible from the mobile app (separate port / localhost only).
- No authentication beyond the existing `INTERNAL_API_TOKEN` header.

### Recommended Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Vite + React (plain JS, no TypeScript needed) | Fast local start, no build config overhead |
| Styling | Tailwind CSS (CDN) or plain CSS | No install required for a laptop-only tool |
| State | React `useState` / `useEffect` | No external lib needed for a CRUD panel |
| HTTP | `fetch` | Built-in, no dep needed |
| Server | Existing Express API (`api/`) | Reuse the Postgres pool; add `/admin/*` routes |

The panel runs as a **static HTML file** (`admin/index.html`) served by the existing API on a separate `/admin` prefix, or opened as a `file://` page that calls the API on `localhost:3000`.

### API Endpoints Required (new, guarded by `INTERNAL_API_TOKEN`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/configs` | List all `program_generation_config` rows (id, config_key, program_type, is_active, updated_at) |
| `GET` | `/admin/configs/:key` | Full row including `program_generation_config_json` |
| `PUT` | `/admin/configs/:key` | Replace `program_generation_config_json` for the given key |
| `POST` | `/admin/configs` | Insert a new config row (duplicate from existing) |
| `PATCH` | `/admin/configs/:key/activate` | Toggle `is_active` |

### UI Layout

The editor panel is divided into four collapsible sections. Each section is independently editable; the final Save merges all sections back into a single `program_generation_config_json` object and writes it to the DB.

#### Overall panel structure

```
┌─────────────────────────────────────────────────────────────┐
│  Workout Engine — Config Admin                               │
├──────────────┬──────────────────────────────────────────────┤
│  Config list │  Editor                                       │
│              │                                               │
│ ● hypertrophy│  Config key:   hypertrophy_default_v1        │
│   _default_v1│  Program type: hypertrophy                    │
│ ● strength   │  Active: ✓          [Duplicate]              │
│   _default_v1│                                               │
│  [+ New]     │  ▼ Builder — sets & budget                   │
│              │  ▼ Builder — day templates                    │
│              │  ▼ Segmentation                               │
│              │  ▼ Progression                                │
│              │  ▶ Raw JSON  (collapsed by default)           │
│              │                                               │
│              │              [ Save ]  [ Discard ]            │
└──────────────┴──────────────────────────────────────────────┘
```

#### Section 1 — Builder: sets & budget

```
── Builder — sets & budget ─────────────────────────────────
  Session length:      40 min    50 min    60 min
  Block A sets:        [ 3 ]     [ 4 ]     [ 5 ]
  Block B sets:        [ 3 ]     [ 3 ]     [ 4 ]
  Block C sets:        [ 2 ]     [ 3 ]     [ 3 ]
  Block D sets:        [ 2 ]     [ 2 ]     [ 3 ]
  Block budget:        [ 4 ]     [ 5 ]     [ 6 ]
```

#### Section 2 — Builder: day templates

This is the key addition. A tab strip switches between day templates; within each day, slots are shown as an editable table with one row per slot.

```
── Builder — day templates ─────────────────────────────────

  [ Day 1: lower ] [ Day 2: upper ] [ Day 3: posterior ] [+ Add day]

  Day 1 — focus: [ lower              ]

  #  │ Slot             │ sw2 (primary swap)     │ sw (secondary swap)   │ mp (mvt pattern) │ requirePref       │ Load │ Fallback slot  │
  ───┼──────────────────┼────────────────────────┼───────────────────────┼──────────────────┼───────────────────┼──────┼────────────────┼────
  1  │ [A:squat       ] │ [squat_compound      ] │ [                   ] │ [              ] │ [strength_main  ▼] │ [ ] │ [             ] │ [↑][↓][✕]
  2  │ [B:lunge       ] │ [                    ] │ [quad_iso_unilateral] │ [lunge         ] │ [               ▼] │ [ ] │ [             ] │ [↑][↓][✕]
  3  │ [C:quad        ] │ [                    ] │ [quad_iso_unilateral] │ [              ] │ [hypertrophy_sec▼] │ [ ] │ [A:squat      ] │ [↑][↓][✕]
  4  │ [C:calves      ] │ [                    ] │ [calf_iso           ] │ [              ] │ [hypertrophy_sec▼] │ [✓] │ [B:lunge      ] │ [↑][↓][✕]
  5  │ [D:core        ] │ [                    ] │ [core               ] │ [anti_extension] │ [               ▼] │ [ ] │ [B:lunge      ] │ [↑][↓][✕]
  6  │ [C:hinge_acc.. ] │ [hinge_compound      ] │ [hamstring_iso      ] │ [              ] │ [hypertrophy_sec▼] │ [ ] │ [A:squat      ] │ [↑][↓][✕]

  [+ Add slot]
```

Column notes:
- **Slot** — free text, format `<block_letter>:<label>`. The block letter prefix determines which block budget and set count apply, and which `block_semantics` entry governs grouping.
- **sw2 / sw** — exercise swap-group keys. The engine tries `sw2` first (strict match), then `sw` (relaxed). Leave blank if not applicable.
- **mp** — movement pattern override. Used when swap-group matching is insufficient.
- **requirePref** — dropdown with values: `(none)` / `strength_main` / `hypertrophy_secondary`.
- **Load** — checkbox for `preferLoadable` (favours barbell/dumbbell exercises).
- **Fallback slot** — if this slot cannot be filled, the engine adds a set to the named slot instead. Free text, must match a `slot` value in the same day.
- **[↑][↓]** — reorder slot within the day (order matters — `ordered_slots` is positional).
- **[✕]** — remove slot.

#### Section 3 — Segmentation

```
── Segmentation ────────────────────────────────────────────
  Block  │ Segment type          │ Purpose
  ───────┼───────────────────────┼───────────────
  A      │ [single       ▼]      │ [main       ▼]
  B      │ [superset     ▼]      │ [secondary  ▼]
  C      │ [giant_set    ▼]      │ [accessory  ▼]
  D      │ [single       ▼]      │ [accessory  ▼]
  [+ Add block letter]
```

Segment type options: `single` / `superset` / `giant_set`.
Purpose options: `main` / `secondary` / `accessory`.

#### Section 4 — Progression

```
── Progression ─────────────────────────────────────────────
  Rank           │ Weekly set step │ Max extra sets
  ───────────────┼─────────────────┼────────────────
  beginner       │ [ 0 ]           │ [ 0 ]
  intermediate   │ [ 1 ]           │ [ 1 ]
  advanced       │ [ 1 ]           │ [ 2 ]
  elite          │ [ 1 ]           │ [ 3 ]

  Apply progression to: [✓] main  [✓] secondary  [✓] accessory
```

#### Section 5 — Raw JSON (collapsed by default)

Full `program_generation_config_json` in a read/write textarea. Expanding it shows the entire JSONB. Editing here and saving overwrites the structured sections. Use this only for fields not covered above (e.g. `week_phase_config_json` copy text, `swAny` arrays on individual slots).

### Structured fields vs raw JSON

All fields that are commonly tuned during program design now have structured inputs:

| Field | Section |
|---|---|
| `builder.sets_by_duration` | Section 1 |
| `builder.block_budget` | Section 1 |
| `builder.day_templates` (focus, ordered_slots, all slot properties) | Section 2 |
| `segmentation.block_semantics` | Section 3 |
| `progression_by_rank_json` (step, max_extra per rank) | Section 4 |
| `progression.apply_to_purposes` | Section 4 |

The raw JSON textarea (Section 5) remains available for `week_phase_config_json`, `slot_defaults`, `exclude_movement_classes`, `swAny` arrays, and any future fields not yet represented in the structured UI.

### Safety

- Save writes to the DB immediately. There is no "staging" layer.
- A **duplicate** button creates a new row with `_v2` suffix and `is_active: false` — safe sandbox for experimenting before activating.
- Only one row per `program_type` should have `is_active: true` (enforced by convention; a DB unique partial index would harden this).
- The panel is served only from `localhost` — it is not reachable from the phone or any deployed environment.
