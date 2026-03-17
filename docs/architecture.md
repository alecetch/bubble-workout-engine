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
| - onboarding / profile setup  |
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
|  - PATCH /api/client_profile/:id                              |
|  - POST /api/program/generate                                 |
|  - POST /api/import/emitter                                   |
|  - GET  /api/program/:id/overview                             |
|  - GET  /api/day/:id/full                                     |
|  - GET  /api/client_profile/:id/allowed_exercises             |
|  - POST /api/segment-log  (workout logging)                   |
|  - GET  /api/history/*    (programs, timeline, PRs, exercises)|
|  - GET  /reference-data   (equipment catalogue + config)      |
|                                                               |
|  Admin panel (internal token guarded)                         |
|  - GET/PUT /admin/configs/:key  (program generation config)   |
|  - GET /admin/exercise-catalogue/full-state                   |
|  - GET /admin/exercise-catalogue/recommendations              |
|  - GET /admin/exercise-catalogue/catalogue-health             |
|  - POST /admin/exercise-catalogue/preview-change              |
|  - POST /admin/exercise-catalogue/session/*                   |
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
| - workout_segment (+ post_segment_rest_sec)      |
| - program_exercise                               |
| - exercise_catalogue (+ hyrox_role, hyrox_station_index) |
| - equipment_items                                |
| - media_assets                                   |
| - program_generation_config                      |
| - program_rep_rule, narration_template           |
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
| `clientProfileBootstrap.js` | `POST /api/client_profile/bootstrap`, `PATCH /api/client_profile/:id` | Upserts/patches `client_profile` and links to user |
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
| `adminExerciseCatalogue.js` | `GET|POST /admin/exercise-catalogue/*` | Exercise catalogue admin (see §9) |

### Service layer (`api/src/services/`)

| File | Purpose |
|---|---|
| `buildInputsFromDevProfile.js` | Assembles the pipeline `inputs` object from Postgres `client_profile`, exercise catalogue, and seeded DB config rows. **Primary source for all pipeline inputs — no external API calls.** |
| `importEmitterService.js` | Transactional ingest of PRG/WEEK/DAY/SEG/EX rows with advisory lock + payload hash idempotency. |
| `programGenerationConfig.js` | Fetches active `program_generation_config` rows (progression parameters, week phase sequences). |
| `repRules.js` | Fetches active `program_rep_rule` rows (rep range, tempo, RIR rules keyed by movement/class). |
| `narrationTemplates.js` | Fetches active `narration_template` rows (per-week programme text templates). |
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
  │           Each segment has: type (single/superset/giant_set), items[], rounds,
  │           and post_segment_rest_sec (inter-block rest, used by Hyrox programs).
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
  │  Inputs:  program_rep_rule rows (from DB, keyed by movement_class, movement_pattern,
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
  │  Inputs:  narration_template rows (from DB, per-week phase text templates).
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
           PRG|…   (1 row,  9 cols)  — program header
           WEEK|…  (n rows, 4 cols)  — one per week
           DAY|…   (n rows, 14 cols) — one per training day
           SEG|…   (n rows, 20 cols) — one per workout segment (col 19 = post_segment_rest_sec)
           EX|…    (n rows, 26 cols) — one per exercise in a segment

           Scheduled dates derived from preferred_days_json + anchor_day_ms.
           Segment durations computed from rep/set/tempo math + warmup/cooldown allocations.
```

### Config-driven multi-type support

Steps 01 and 02 are **fully generic** — all program-type-specific logic has been extracted into the `program_generation_config` table. Adding a new program type requires only a new seed row; no code changes.

Four program types are currently seeded:

| Config key | Program type | Description |
|---|---|---|
| `hypertrophy_default_v1` | `hypertrophy` | Hypertrophy-focused 3-day split |
| `strength_default_v1` | `strength` | Strength-focused compound-heavy split |
| `conditioning_default_v1` | `conditioning` | Metabolic conditioning programme |
| `hyrox_default_v1` | `hyrox` | Hyrox race-specific training programme |

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
│   │       ├── swAny         Array of swap-group keys (match any one)
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
│       ├── purpose                  "main" | "secondary" | "accessory"
│       └── post_segment_rest_sec    Optional inter-block rest (seconds); used by Hyrox
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
| Change which exercises are selected (swap groups) | `sw` / `sw2` / `swAny` / `mp` fields on the relevant slot |
| Change preference tier (strength vs hypertrophy selection) | `requirePref` on the slot, or `slot_defaults` for the whole block letter |
| Change set counts by session duration | `builder.sets_by_duration` |
| Cap the number of blocks in a session | `builder.block_budget` |
| Change whether a block is singles, supersets, or giant sets | `segmentation.block_semantics.<letter>.preferred_segment_type` |
| Add inter-block rest (e.g. Hyrox station rest) | `segmentation.block_semantics.<letter>.post_segment_rest_sec` |
| Add a new program type | New seed row in `R__seed_program_generation_config.sql` |
| Change weekly set progression steps | `progression_by_rank_json` (per fitness rank) |
| Change phase sequence or labels | `week_phase_config_json.default_phase_sequence` |

All changes to a seed file are picked up automatically the next time Flyway runs (repeatable migrations — `R__*.sql` — re-execute whenever their checksum changes).

### Supporting engine files

| File | Purpose |
|---|---|
| `api/engine/getAllowedExercises.js` | SQL filter against `exercise_catalogue` by fitness rank, injury flags, and equipment slugs. Returns `exercise_id[]` used by step 01. |
| `api/engine/resolveHeroMedia.js` | Resolves hero media asset rows by scope (`program` / `program_day`), program type, and day focus slug (`upper_body` / `lower_body` / `full_body`). Uses a fallback cascade: exact match → full_body → no-focus → type-any → generic → first-in-scope. |

---

## 4) Exercise Selection — How It Works

Exercise selection happens in two distinct phases: a **SQL pre-filter** that runs once per generation request, and a **per-slot selection loop** that runs inside Step 01 for every slot in every day template.

### Phase 1 — SQL Pre-filter (`getAllowedExercises.js`)

Before the pipeline starts, a single SQL query computes the allowed exercise set for this specific user:

```sql
SELECT exercise_id
FROM exercise_catalogue
WHERE is_archived = false
  AND min_fitness_rank <= $rank
  AND NOT (contraindications_slugs && $injury_flags)
  AND equipment_items_slugs <@ $user_equipment
```

The four gates are:

| Gate | Logic | Example |
|---|---|---|
| Active | `is_archived = false` | Skips archived exercises |
| Rank | `min_fitness_rank <= user_rank` | `rank=0` (beginner) only sees exercises with `min_fitness_rank=0` |
| Injury | `contraindications_slugs` does NOT overlap `injury_flags` | User with `lower_back` flag never sees deadlifts marked as contraindicated |
| Equipment | `exercise.equipment_items_slugs` is a subset of `user_equipment` | A barbell squat requires `barbell`; a user with only `bodyweight` cannot be assigned it |

The result is a flat list of `exercise_id` values — the "allowed pool" for this user. All subsequent selection logic only operates within this pool.

> **Equipment gate detail:** The operator `<@` means "is contained by" — every slug the exercise requires must be present in the user's equipment list. An exercise requiring both `barbell` and `bench` is blocked if the user has `barbell` but not `bench`.

### Phase 2 — In-memory preparation (Step 01 setup)

The allowed pool is further trimmed **at build time** (before any slot iteration) by removing exercises whose `movement_class` is in the config's `excludeMovementClasses` list. For hypertrophy and strength this excludes `cardio`, `conditioning`, and `locomotion`. This trim produces the final `allowedSet` — a `Set<exercise_id>` that is constant throughout the day-building loop.

The exercise catalogue rows are simultaneously compiled into a compact in-memory index (`byId`) keyed by `exercise_id`, holding only the fields the selector needs: `sw`, `sw2`, `mp`, `pref`, `den`, `cx`, `load`, `mc`, `tr`.

### Phase 3 — Per-slot selection (`fillSlot` → `pickWithFallback`)

For each slot in the day template the engine runs `pickWithFallback`. This is an ordered fallback chain — it tries progressively looser criteria until it finds a match or gives up:

```
Step 0 — Avoid repeat sw2
  If sw2 was already used today, try sw/swAny/mp without sw2 (avoids duplicate compound movement)

Step 1 — sw2 + requirePref          [strict match + preference tag]
Step 2 — sw (or swAny[]) + requirePref
Step 3 — mp + requirePref

  (if requirePref is set and steps 1-3 failed, drop the pref requirement and retry:)

Step 4 — sw2 only
Step 5 — sw (or swAny[]) only
Step 6 — mp only

  (if all unique-exercise attempts failed, allow duplicates:)

Step 7 — sw2 / sw / swAny / mp, allowing already-used exercises
```

If every step returns null, a last-resort `pickSeedExerciseForSlot` runs — this tries sw2, then sw/swAny, then mp, then literally the first available non-conditioning exercise in the pool. If even that returns null, the slot becomes a **FILL block** (adds 1 extra set to the nearest existing slot instead of placing a new exercise).

### Scoring within each step (`pickBest`)

Each "attempt" above calls `pickBest`, which iterates the `allowedSet` and scores every candidate:

| Condition | Score delta |
|---|---|
| Matches `sw2` | +12 |
| Matches `sw` | +10 |
| Matches `mp` | +4 |
| Score = 0 (no match at all) | **rejected — not considered** |
| `preferIsolation` (C-block) and exercise is isolation class | +1.5 |
| `preferCompound` (A-block) and exercise is compound class | +1.5 |
| `preferLoadable` and exercise is loadable | +1.0 |
| `preferLoadable` and exercise is not loadable | -0.1 |
| Target region overlaps with already-used regions (1 region) | -0.3 |
| Target region overlaps with already-used regions (2+ regions) | -1.5 |
| Low density (den=1) | +0.2 |
| Low complexity (cx=1) | +0.05 |

> **Important:** `requirePref` is a **hard gate**, not a score bonus. If `requirePref: "strength_main"` is set on a slot, any exercise without `"strength_main"` in its `preferred_in_json` is skipped via `continue` before scoring even starts. This is the single most common cause of slot gaps for narrow equipment presets.

The highest-scoring candidate wins.

### Why gaps occur

A slot produces a FILL block (no exercise placed) when both of these are true simultaneously:

1. The `allowedSet` is **small** — because the user has minimal equipment (e.g. bodyweight only, or kettlebells only) which eliminates most barbell/dumbbell exercises from the pool.
2. The slot definition is **specific** — e.g. `sw2: "squat_compound"` which mainly maps to barbell back squat, front squat etc. If none of those are in the allowed pool, no exercise scores > 0, and all fallback steps fail.

`requirePref` compounds this: if the slot also has `requirePref: "hypertrophy_secondary"`, the already-small pool is filtered further before the score is even computed.

### Complexity assessment

The selection system has two layers of complexity with different origins:

**Accidental complexity (legacy from Bubble.io origin):**
- The double-representation of exercise data: DB rows → `buildCatalogJsonFromBubble` → JSON string → `buildIndex` → `byId` object. This was a translation layer for a previous Bubble API format and is no longer needed — the DB rows could be indexed directly.
- Short property names (`sw`, `sw2`, `mp`, `pref`, `den`, `cx`) in the in-memory index, mirroring the old Bubble schema.

**Intentional complexity (does real work):**
- The 7-step fallback chain is necessary to handle the full matrix of: {has sw2, sw, swAny, mp} × {has requirePref} × {unique or allow duplicates}. It could be expressed more compactly but the logic is sound.
- `requirePref` as a hard gate is intentional — it ensures "strength_main" slots only pick exercises genuinely suited to that context. But it is the leading cause of FILL blocks when the allowed pool is small.

**The root cause of coverage gaps is not algorithm complexity — it is catalogue data.** The fix for a gap like "Hyrox / beginner / minimal equipment" is almost always one of:
- Add more exercises to the catalogue that work with minimal equipment AND match the slot's `sw`/`sw2`/`mp` values.
- Loosen a slot definition (remove `requirePref` from a slot that doesn't need strict preference gating, or add `swAny` alternatives).
- Change `requirePref` from a hard gate to a score bonus (+N points instead of `continue`).

The Recommendations tab in the admin panel (`/admin/exercises`) identifies exactly which catalogue entries are near-misses — one field change away from filling a gap.

---

## 5) Request / Data Flow  <!-- was §4 -->

### Identity bootstrap
1. Mobile app calls `POST /api/user/bootstrap` with an external `bubble_user_id`.
2. API upserts `app_user` and returns the internal `user_id` (UUID).

### Profile bootstrap
1. Mobile app calls `POST /api/client_profile/bootstrap` with profile fields (equipment, fitness rank, injury flags, goals).
2. API normalises option slugs and upserts `client_profile` linked to `app_user`.
3. Profile can be updated via `PATCH /api/client_profile/:id` (e.g. after onboarding step changes).
4. Profile becomes canonical in Postgres — it is the sole input source for generation.

### Program type resolution
`generateProgramV2.js` resolves `programType` in priority order:

1. **Explicit body field** — `req.body.programType` if present and not `"default"`.
2. **Goal-derived type** — profile `goals[]` are slugified and looked up in `GOAL_TO_PROGRAM_TYPE`:
   - `"Strength"` → `strength`
   - `"Hypertrophy"` → `hypertrophy`
   - `"Conditioning"` → `conditioning`
   - `"HYROX Workout"` → `hyrox` (slug: `hyrox_workout`)
3. **Profile programType** — `client_profile.programType` field if set.
4. **Fallback** — `"hypertrophy"`.

### Program generation + persist
1. Mobile app calls `POST /api/program/generate`.
2. `generateProgramV2.js` resolves `app_user` and `client_profile` from Postgres.
3. Resolves `programType` via the priority chain above.
4. Calls `getAllowedExerciseIds` to compute the exercise filter from the catalogue.
5. Calls `buildInputsFromDevProfile` to assemble the full pipeline `inputs` object.
6. Calls `runPipeline({ inputs, programType, request, db })`.
7. `runPipeline` fetches DB config, runs steps 01→06, returns `{ program, rows }`.
8. Calls `importEmitterPayload(rows)` to persist all data in a single DB transaction.
9. Calls `ensureProgramCalendarCoverage` to fill calendar rows for the mobile calendar view.
10. Returns `{ program_id, counts, idempotent, allowed_count }`.

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

## 6) Data Model

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
| V14 | `program_generation_config`, `program_rep_rule`, `narration_template` tables |
| V15 | `is_active` flag on `narration_template` |
| V16 | Unique constraint on `segment_exercise_log` |
| V17 | `strength_primary_region` on `exercise_catalogue` |
| V18 | `estimated_1rm_kg` on program exercise / log tables |
| V19 | Fix bodyweight exercise equipment slugs (removes incorrect `bodyweight` equipment requirement) |
| V20 | Drop legacy Bubble.io import columns from `exercise_catalogue` (`bubble_unique_id`, `bubble_creation_date`, `bubble_modified_date`) |
| V21 | Add Hyrox metadata to `exercise_catalogue`: `hyrox_role` (`race_station` \| `carry` \| `run_buy_in` \| `accessory`), `hyrox_station_index` (1–8) |
| V22 | Add `post_segment_rest_sec INTEGER DEFAULT 0` to `workout_segment` (inter-block rest for Hyrox programs) |

### Repeatable migrations (`R__*.sql`)
Seed data, re-applied whenever the file checksum changes:

| File | Contents |
|---|---|
| `R__seed_exercise_catalogue.sql` | Full exercise catalogue (83 exercises, including Hyrox-specific entries with `hyrox_role` and `hyrox_station_index`) |
| `R__seed_equipment_items.sql` | Equipment lookup rows |
| `R__seed_media_assets.sql` | Hero image asset rows |
| `R__seed_program_generation_config.sql` | Full `compiledConfig` JSONB for all four program types: `hypertrophy_default_v1`, `strength_default_v1`, `conditioning_default_v1`, `hyrox_default_v1` |
| `R__seed_program_rep_rules.sql` | Rep range / tempo / RIR rules |
| `R__seed_narration_template.sql` | Narration text templates (generic `prog_*`/`warmup_*` templates + Hyrox-specific `hyrx_*` templates) |

### Core ownership model
- `app_user.bubble_user_id` — external identifier supplied by the mobile client (legacy name; treated as an opaque string)
- `client_profile.user_id` — FK to `app_user`; all generation is scoped to this profile
- `program.user_id` — FK to `app_user`; all read/write enforces ownership

---

## 7) Environment & Deployment

### Docker Compose (local dev)
- `db`: Postgres 16
- `api`: Node 20, mounts `./api:/app` and `./assets:/app/assets`; `working_dir: /app`
- `flyway`: runs migrations from `./migrations`
- `minio` + `minio-init` + `minio-seed`: local S3-compatible object store for media assets

### Production
- Deployed to [Fly.io](https://fly.io) (`api/fly.toml`).
- Postgres: Fly managed Postgres.
- Media assets: served from `/app/assets/media-assets` (volume-mounted).
- CI/CD: GitHub Actions (`fly-deploy-api` workflow) — runs tests, Flyway migrations + `qa:seeds` smoke check, then deploys to Fly on every push to `main`.

### Key environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP listen port (default 3000) |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Postgres connection |
| `PGPOOL_MAX` | pg pool size (optional) |
| `ENGINE_KEY` | Auth header `x-engine-key` for the legacy `/generate-plan` route |
| `INTERNAL_API_TOKEN` | Auth header `X-Internal-Token` for guarded write routes and admin panel |
| `S3_PUBLIC_BASE_URL` | Base URL prepended to `image_key` when constructing media asset URLs. Must use LAN IP (not `localhost`) for on-device mobile dev. |

---

## 8) Key Architectural Decisions

### 1. Self-contained — no external platform dependency
All pipeline inputs (exercise catalogue, config, client profile) are sourced from Postgres. There are no runtime calls to any external API. The `bubble_*` naming in the schema is a legacy artefact; those fields are external-ID fields supplied by the mobile client.

### 2. Postgres as canonical writer
All generated program data is written in a single transaction via `importEmitterService`. Advisory locks and payload hashing provide deterministic idempotency.

### 3. DB-driven pipeline configuration
Rep rules, narration templates, program generation config (progression schedules, phase sequences), and media assets are all stored in Postgres and fetched at generation time. Configuration changes deploy via Flyway migration without code changes.

### 4. Six-step pipeline with explicit boundaries
Each step is a pure function (`program in → enriched program out`). Steps are independently testable. The orchestrator (`runPipeline.js`) owns all DB fetches and fallback resolution; steps themselves do not query the DB.

### 5. Emitter row format
Step 06 emits pipe-delimited strings (`PRG|WEEK|DAY|SEG|EX`) that are parsed and persisted by `importEmitterService`. This format provides a stable, inspectable wire format between the engine and the persistence layer. Column counts are validated on ingest: PRG=9, WEEK=4, DAY=14, SEG=20, EX=26.

### 6. Config-driven multi-type pipeline
Steps 01 and 02 are fully generic. Program-type behaviour (day templates, exercise slot definitions, block grouping semantics, set counts, progression) is driven entirely by the `program_generation_config_json` JSONB column. Adding a new program type requires only a new seed row — no code changes. The `compiledConfig` object is assembled and validated once in `runPipeline.js`, then threaded through all dependent steps. See §3 for the full config schema.

### 7. Known technical debt
- `bubble_*` column names are legacy; could be renamed to `external_user_id` etc. in a future migration.
- Some routes mount route-level `express.json()` middleware despite a global parser already being present.
- No centralised observability stack — logs are console JSON/text.

---

## 9) Local Dev vs TestFlight — Keeping Configs Separate

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

## 10) Admin Panel (`/admin`)

A laptop-only admin panel served by the existing API at `/admin/*`, guarded by `INTERNAL_API_TOKEN`. Not reachable from the mobile app or any deployed environment.

### Exercise Catalogue (`/admin/exercises`)

A full CRUD interface for `exercise_catalogue` served from `api/admin/exercises.html`.

**Tabs:**

| Tab | Purpose |
|---|---|
| Browse & Edit | Filterable, sortable table of all exercises. Click a row or Edit to open the edit drawer. |
| Catalogue Health | On-demand analysis: never-used exercises, low-utility exercises (≤4 eligible slots), oversupplied clusters (≥5 eligible per slot). |
| Recommendations | Ranked list of single-field edits that would fix the most coverage gaps. Each recommendation shows the field change as an amber pill, an explanation of impact, and a Show SQL button. |
| Migration Preview | Accumulated SQL for all queued changes; copyable and downloadable as a `.sql` file. |

**Filters (Browse tab):**

| Filter | Type | Description |
|---|---|---|
| Search | Text | Matches exercise ID or name |
| Class | Dropdown | `compound`, `isolation`, `engine`, etc. |
| Status | Dropdown | Active only / Archived only / All |
| Equipment Preset | Dropdown | `no_equipment`, `minimal_equipment`, `decent_home_gym`, `commercial_gym`, `crossfit_hyrox_gym` — shows only exercises whose equipment requirements are fully satisfied by the selected preset |
| Pattern | Text | Filters on `movement_pattern_primary` |
| Min Rank ≤ | Dropdown | 0–3; excludes exercises with a higher minimum fitness rank |
| Loadable | Dropdown | Yes / No |
| Region | Dropdown | `upper` / `lower` / `none` |

All column headers (ID, Name, Class, Pattern, Rank, Loadable, Region, Coverage, Status) are sortable — click to sort ascending, click again to sort descending.

**Edit flow:**
1. Click a row to open the edit drawer.
2. Make changes; a live impact preview shows how zero/low-coverage gaps change.
3. "Queue Change" adds the edit to the session queue (no immediate DB write).
4. Review accumulated SQL in the Migration Preview tab.
5. Copy/download the SQL and run it via Flyway (`R__seed_exercise_catalogue.sql`) or direct DB.

**Admin API endpoints (all guarded by `INTERNAL_API_TOKEN`):**

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/admin/exercise-catalogue/full-state` | All exercises, coverage gaps, equipment slugs, presets |
| `POST` | `/admin/exercise-catalogue/preview-change` | Live impact preview for a proposed edit |
| `POST` | `/admin/exercise-catalogue/clone-preview` | Generate a new ID for a cloned exercise |
| `POST` | `/admin/exercise-catalogue/session/queue-change` | Add an edit to the in-memory session queue |
| `GET` | `/admin/exercise-catalogue/session/pending` | List queued changes |
| `POST` | `/admin/exercise-catalogue/session/clear` | Clear the queue |
| `POST` | `/admin/exercise-catalogue/session/generate-migration` | Render queued changes as SQL |
| `GET` | `/admin/exercise-catalogue/recommendations` | Compute and return ranked fix recommendations |
| `GET` | `/admin/exercise-catalogue/catalogue-health` | Return never-used, low-utility, and oversupplied analyses |

### Config Editor (`/admin-ui/index.html`)

Structured editor for `program_generation_config` rows (builder, segmentation, progression). Allows editing day templates, slot definitions, set budgets, phase sequences, and block semantics without touching SQL.
