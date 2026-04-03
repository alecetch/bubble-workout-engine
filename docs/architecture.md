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
|  - GET/PATCH /api/me (user identity)                          |
|  - POST /api/client-profiles  (create/upsert profile)         |
|  - GET  /api/client-profiles/:id                              |
|  - PATCH /api/client-profiles/:id                             |
|  - PATCH /api/users/me                                        |
|  - POST /api/generate-plan-v2  (program generation)           |
|  - POST /api/import/emitter                                   |
|  - GET  /api/program/:id/overview                             |
|  - GET  /api/day/:id/full                                     |
|  - PATCH /api/day/:id/complete                                |
|  - GET  /api/client_profile/:id/allowed_exercises             |
|  - GET  /api/segment-log, POST /api/segment-log               |
|  - GET  /api/v1/history/*  (programs, timeline, PRs, exercises)|
|  - GET  /api/reference-data, /api/media-assets                |
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
| - password_reset_token                           |
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

Client profile and user identity routes are defined inline in `server.js` (not in separate route module files):

| Route | Purpose |
|---|---|
| `GET /api/me` | Return current user identity |
| `PATCH /api/users/me` | Patch user-level fields |
| `POST /api/client-profiles` | Create / upsert `client_profile` |
| `GET /api/client-profiles/:id` | Read profile by ID |
| `PATCH /api/client-profiles/:id` | Patch profile fields |

Route module files (`api/src/routes/`):

| File | Route(s) | Purpose |
|---|---|---|
| `generateProgramV2.js` | `POST /api/generate-plan-v2` | Full generation + persist flow (see §4) |
| `importEmitter.js` | `POST /api/import/emitter` | Raw emitter row ingest (for external callers) |
| `readProgram.js` | `GET /api/program/:id/overview`, `GET /api/day/:id/full`, `PATCH /api/day/:id/complete` | Program + day read views and day completion |
| `debugAllowedExercises.js` | `GET /api/client_profile/:id/allowed_exercises` | Debug: exercise filtering by profile |
| `segmentLog.js` | `GET /api/segment-log`, `POST /api/segment-log` | Workout set logging |
| `loggedExercises.js` | `GET /api/logged-exercises` | Per-exercise log history |
| `historyPrograms.js` | `GET /api/v1/history/programs` | Completed/active program list |
| `historyTimeline.js` | `GET /api/v1/history/timeline` | Chronological workout feed |
| `historyOverview.js` | `GET /api/v1/history/overview` | Aggregate stats |
| `historyPersonalRecords.js` | `GET /api/v1/history/personal-records` | PRs by exercise |
| `historyExercise.js` | `GET /api/v1/history/exercise/:id` | Per-exercise history |
| `sessionHistoryMetrics.js` | `GET /api/session-history-metrics` | Session-level metrics |
| `prsFeed.js` | `GET /api/prs-feed` | Recent PR feed |
| `adminExerciseCatalogue.js` | `GET\|POST /admin/exercise-catalogue/*` | Exercise catalogue admin (see §9) |
| `adminObservability.js` | `GET /api/admin/observability/*` | Generation run stats and error log |
| `adminNarration.js` | `GET\|POST /admin/narration/*` | Narration template management |
| `adminConfigs.js` | `GET\|PUT /admin/configs/:key` | Program generation config CRUD |
| `adminCoverage.js` | `GET /api/admin/coverage/*` | Slot coverage analysis |
| `auth.js` | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` | Password reset OTP flow |
| `adminUsers.js` | `GET /admin/users`, `DELETE /admin/users/:id` | Admin user management (internal token guarded) |

### Service layer (`api/src/services/`)

| File | Purpose |
|---|---|
| `emailService.js` | `sendPasswordResetEmail({ to, code })` — provider-agnostic email abstraction (see §12) |
| `clientProfileService.js` | `makeClientProfileService(db)` factory — `upsertUser`, `upsertProfile`, `getProfileByBubbleUserId`, `patchProfile`. Handles `app_user` and `client_profile` upserts with deterministic column mapping. |
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
│   │       ├── sw            Single sw (swap_group_id_1) value to match
│   │       ├── sw2           Single sw2 (swap_group_id_2) value to match
│   │       ├── swAny         Array of sw values — candidate scores +10 if its sw matches any element
│   │       ├── sw2Any        Array of sw2 values — candidate scores +12 if its sw2 matches any element
│   │       ├── mp            Movement pattern filter (+4 if matched)
│   │       ├── requirePref   Preference tier ("strength_main" | "hypertrophy_secondary")
│   │       ├── pref_mode     "strict" (default) | "soft" — whether requirePref is a hard gate or a score bonus
│   │       ├── pref_bonus    Score bonus for soft pref match (default 4, only used when pref_mode = "soft")
│   │       ├── preferLoadable  Favour barbell/dumbbell exercises in this slot
│   │       ├── strength_equivalent_bonus  true → +3 bonus for exercises tagged strength_equivalent
│   │       ├── fill_fallback_slot  Fallback slot key if this slot cannot be filled
│   │       └── variants      Optional array of equipment-profile-conditional overrides:
│   │           └── { when: { equipment_profile: "full"|"minimal"|"bodyweight" },
│   │                 ...any slot fields above }
│   │             The builder merges the matching variant over the base slot at generation time.
│   │             Slots without variants behave exactly as before (full backward compatibility).
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
| Change which exercises are selected (swap groups) | `sw` / `sw2` / `swAny` / `sw2Any` / `mp` fields on the relevant slot (or variant) |
| Change preference tier (strength vs hypertrophy selection) | `requirePref` on the slot, or `slot_defaults` for the whole block letter |
| Soften a preference requirement (score bonus instead of hard gate) | `pref_mode: "soft"` on the slot or variant; optionally set `pref_bonus` (default 4) |
| Boost strength-oriented exercises when pref is soft | `strength_equivalent_bonus: true` on the slot; `strength_equivalent = true` on qualifying exercises in the catalogue |
| Change exercise selection for low-equipment users | Add a `variants` array to the slot; the builder resolves the matching variant from `"full"` / `"minimal"` / `"bodyweight"` derived from the user's equipment slugs |
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

Exercise selection runs in four phases: a SQL pre-filter, an equipment profile derivation, an in-memory preparation, and a per-slot selection loop.

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

| Gate | Logic | Example |
|---|---|---|
| Active | `is_archived = false` | Skips archived exercises |
| Rank | `min_fitness_rank <= user_rank` | Rank 0 (beginner) only sees exercises with `min_fitness_rank = 0` |
| Injury | `contraindications_slugs` does NOT overlap `injury_flags` | User with `lower_back` flag never sees exercises marked as contraindicated |
| Equipment | `exercise.equipment_items_slugs` is a subset of `user_equipment` (`<@`) | A barbell squat requires `barbell`; a user with only `bodyweight` cannot be assigned it |

The result is a flat `exercise_id[]` — the **allowed pool** for this user. All subsequent selection logic operates only within this pool.

### Phase 2 — Equipment profile derivation (`deriveEquipmentProfile`)

At the start of Step 01, the builder coerces the user's full equipment slug list into one of three coarse profiles:

```
deriveEquipmentProfile(equipment_items_slugs):
  if slugs contains any of {barbell, trap_bar, hack_squat, leg_press, cable} → "full"
  if slugs contains any of {dumbbells, kettlebells, sandbag, rings}          → "minimal"
  otherwise                                                                   → "bodyweight"
```

This profile is stored in `builderState.equipmentProfile` and is used to resolve slot variants (Phase 3). It is also emitted as `debug.equipment_profile` in the generation output.

### Phase 3 — In-memory preparation and slot variant resolution (Step 01 setup)

**Index construction:** The allowed pool is trimmed by removing exercises whose `movement_class` is in the config's `excludeMovementClasses` list (for strength/hypertrophy: `cardio`, `conditioning`, `locomotion`). The trimmed pool becomes the `allowedSet` — a `Set<exercise_id>` constant for the entire day loop. Catalogue rows are simultaneously compiled into a compact `byId` index holding: `sw`, `sw2`, `mp`, `pref`, `den`, `cx`, `load`, `mc`, `tr`, `strength_equivalent`.

**Slot variant resolution (`resolveSlotVariant`):** Before each slot is filled, the builder checks whether the slot has a `variants` array. If it does, it selects the first variant whose `when.equipment_profile` matches the derived profile, and merges that variant's fields over the base slot. Fields not present in the variant are inherited from the base. If no variant matches (or `variants` is absent), the base slot is used unchanged — full backward compatibility.

```
resolveSlotVariant(slotDef, equipmentProfile):
  match = slotDef.variants?.find(v => v.when.equipment_profile === equipmentProfile)
  if no match → return slotDef (base slot, unchanged)
  return merge(slotDef, match)  // variant fields overwrite base; "slot" name always from base
```

A `slot_resolved` debug event is emitted per slot showing which profile was active, whether a variant matched, and the resolved `sw2`, `swAny`, `sw2Any`, and `pref_mode`.

### Phase 4 — Per-slot selection (`fillSlot` → `pickWithFallback`)

For each resolved slot the engine runs `pickWithFallback` — an ordered fallback chain that tries progressively looser criteria until it finds a match or gives up:

```
Step 0 — Avoid repeat sw2
  If sw2 was already used today, try sw/swAny/mp without sw2 (avoids repeated compound movement)

Step 1 — sw2/sw2Any + requirePref          [strict match + preference gate]
Step 2 — sw/swAny + requirePref
Step 3 — mp + requirePref

  (if requirePref is set and pref_mode is "strict" and steps 1–3 all failed, drop pref and retry:)

Step 4 — sw2/sw2Any only
Step 5 — sw/swAny only
Step 6 — mp only

  (if all unique-exercise attempts failed, allow already-used exercises:)

Step 7 — sw2/sw2Any / sw/swAny / mp, ignoring usedWeek
```

When `pref_mode: "soft"` is set on the resolved slot, Steps 1–3 do **not** hard-reject exercises missing the pref tag — instead the pref presence becomes a score bonus (see scoring table below). This means Steps 4–6 rarely fire for soft-pref slots, eliminating the common silent-fallthrough problem.

If every step returns null, a last-resort `pickSeedExerciseForSlot` runs — tries sw2/sw2Any, then sw/swAny, then mp, then the first available non-conditioning exercise in the pool. If even that returns null, the slot becomes a **FILL block** (adds 1 extra set to the nearest existing slot).

### Scoring within each step (`pickBest`)

Each attempt calls `pickBest`, which iterates `allowedSet` and scores every candidate. All structural terms are cumulative — an exercise can score on multiple terms simultaneously (e.g. sw2Any match +12 and mp match +4 = 16). A candidate must reach a structural score > 0 or it is rejected before any bonuses apply.

| Condition | Score delta | Notes |
|---|---|---|
| `sw2` exact match OR `sw2Any` array contains `ex.sw2` | +12 | At most one sw2/sw2Any term fires per candidate |
| `sw` exact match OR `swAny` array contains `ex.sw` | +10 | At most one sw/swAny term fires per candidate |
| `mp` match | +4 | Stacks with sw2/sw matches |
| Structural score = 0 (no sw2/sw/mp match) | **rejected** | No bonuses can rescue a zero-score candidate |
| `requirePref` set, `pref_mode: "strict"`, exercise lacks pref | **rejected** | Hard gate — runs after structural scoring |
| `requirePref` set, `pref_mode: "soft"`, exercise has pref | +`pref_bonus` (default 4) | Soft preference bonus |
| `strength_equivalent_bonus: true` on slot, `ex.strength_equivalent = true` | +3 | Catalogue boolean field; never a hard filter |
| `preferIsolation` (C-block) + exercise is isolation class | +1.5 | |
| `preferCompound` (A-block) + exercise is compound class | +1.5 | |
| `preferLoadable` + exercise is loadable | +1.0 | |
| `preferLoadable` + exercise is not loadable | -0.1 | |
| Target region overlaps already-used regions (1 region) | -0.3 | |
| Target region overlaps already-used regions (2+ regions) | -1.5 | |
| Low density (`den = 1`) | +0.2 | |
| Low complexity (`cx = 1`) | +0.05 | |

The highest-scoring candidate wins.

### Equipment-aware swap group vocabulary

Two parallel sets of swap group values exist in the catalogue:

| Type | Column | Examples | Used by |
|---|---|---|---|
| Compound rollup groups | `swap_group_id_2` (sw2) | `squat_compound`, `hinge_compound`, `push_horizontal_compound` | Full-equipment slot variants (`sw2: "squat_compound"`) |
| Pattern groups | `swap_group_id_1` (sw) | `squat_pattern`, `hinge_pattern`, `push_horizontal_pattern` | Minimal/bodyweight slot variants (`swAny: ["squat_pattern"]`) |

Both columns are single-value strings — an exercise carries exactly one `sw` and one `sw2`. Broader matching across multiple groups uses the slot-side `swAny` (for sw values) or `sw2Any` (for sw2 values) arrays. These must never be mixed: `squat_compound` is an sw2 value and must not appear inside `swAny`.

The `strength_equivalent` boolean (default `false`) marks exercises that produce a meaningful strength stimulus despite not being classic barbell compounds (e.g. goblet squat, inverted row, KB deadlift). It is set in the catalogue seed and read by `pickBest` when a slot activates `strength_equivalent_bonus: true`.

### A/B slot coverage — current state

After V23 (equipment-aware variants), **A and B slots have zero coverage gaps** for both `strength_default_v1` and `hypertrophy_default_v1` across all equipment presets and fitness ranks. The fix involved three coordinated changes:

1. **New catalogue exercises** — 13 new exercises (`pistol_squat`, `inverted_row`, `kb_deadlift`, `feet_elevated_inverted_row`, etc.) tagged with pattern-group `sw`/`sw2` values and `strength_equivalent = true` where appropriate.
2. **Reclassification UPDATEs** — existing exercises (`double_db_front_squat`, `kb_romanian_deadlift`, `ring_row`, etc.) had their `sw`/`sw2` overwritten to the new pattern group values.
3. **Slot variants** — A and B slots in both strength and hypertrophy configs were given three-variant arrays (`full`/`minimal`/`bodyweight`), each with appropriate `swAny`, `pref_mode`, and `strength_equivalent_bonus` settings.

### Complexity assessment

**Accidental complexity (legacy from Bubble.io origin):**
- Double-representation of exercise data: DB rows → `buildCatalogJsonFromBubble` → JSON string → `buildIndex` → `byId` object. This was a translation layer for an old Bubble API format and could be collapsed to direct DB-row indexing.
- Short property names (`sw`, `sw2`, `mp`, `pref`, `den`, `cx`) in the in-memory index, mirroring the old Bubble schema.

**Intentional complexity (does real work):**
- The 7-step fallback chain handles the full matrix of {sw2/sw2Any, sw/swAny, mp} × {requirePref strict/soft} × {unique/allow-dup}. With `pref_mode: "soft"`, Steps 4–6 are rarely reached, making the chain effectively 3 steps in normal use.
- Equipment profile derivation and variant resolution add one function call per slot but keep all equipment-awareness in config rather than in code — adding a new equipment tier requires only a new variant in the seed.

**The root cause of historical coverage gaps was catalogue data, not algorithm complexity.** The Recommendations tab in the admin panel (`/admin/exercises`) identifies exercises that are one field-change away from filling a gap.

---

## 5) Request / Data Flow  <!-- was §4 -->

### Identity bootstrap
1. Mobile app calls `GET /api/me` to retrieve or create the current user identity (keyed by `bubble_user_id` header).
2. API upserts `app_user` via `clientProfileService.upsertUser` and returns the internal `user_id` (UUID).

### Profile bootstrap
1. Mobile app calls `POST /api/client-profiles` with profile fields (equipment, fitness rank, injury flags, goals).
2. API normalises option slugs and upserts `client_profile` linked to `app_user` via `clientProfileService.upsertProfile`.
3. Profile can be updated via `PATCH /api/client-profiles/:id` (e.g. after onboarding step changes).
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
1. Mobile app calls `POST /api/generate-plan-v2`.
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
| V23 | Add `strength_equivalent BOOLEAN DEFAULT false` to `exercise_catalogue` (marks exercises that produce a meaningful strength stimulus without being classic barbell compounds) |
| V24 | Add debug/observability columns to `generation_run`: `config_key`, pipeline timing, error details (all nullable; existing rows unaffected) |
| V25 | Add `admin_audit_log` table (records admin panel config and catalogue changes with timestamp and actor) |
| V26 | Add onboarding fields to `client_profile`: `sex`, `age_range`, `onboarding_step_completed`, `onboarding_completed_at` |
| V27–V33 | (Various schema additions — equipment, auth, profile fields) |
| V34 | Change `fk_program_user` and `fk_log_user` FK constraints to `ON DELETE CASCADE` (enables hard-delete of `app_user` without FK violations) |
| V35 | Add `password_reset_token` table: `id`, `user_id` (FK → `app_user` CASCADE), `code_hash`, `expires_at`, `used_at`, `created_at` |

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
- `mailpit`: local SMTP catch-all (port 1025 SMTP, port 8025 web UI at http://localhost:8025). All outbound email is captured here in local dev — no messages reach real inboxes.

### Production
- Deployed to [Fly.io](https://fly.io) (`api/fly.toml`).
- Postgres: Fly managed Postgres.
- Media assets: served from `/app/assets/media-assets` (volume-mounted).
- CI/CD: Two GitHub Actions workflows:
  - **`ci.yml`** — runs on every push and PR to `main`. Spins up a Postgres 16 service container, runs Flyway migrations, then `npm test -- --test-concurrency=1` with all integration tests enabled (no skips). PRs cannot be merged if any test fails.
  - **`fly-deploy.yml`** — runs on push to `main` after CI passes. Runs `qa:seeds` smoke check then deploys to Fly.

### Key environment variables

| Variable | Purpose |
|---|---|
| `PORT` | HTTP listen port (default 3000) |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Postgres connection |
| `PGPOOL_MAX` | pg pool size (optional) |
| `ENGINE_KEY` | Auth header `x-engine-key` for the legacy `/generate-plan` route |
| `INTERNAL_API_TOKEN` | Auth header `X-Internal-Token` for guarded write routes and admin panel |
| `S3_PUBLIC_BASE_URL` | Base URL prepended to `image_key` when constructing media asset URLs. Must use LAN IP (not `localhost`) for on-device mobile dev. |
| `EMAIL_PROVIDER` | `console` (logs to stdout), `smtp` (Mailpit / any SMTP server), or `resend` (Resend API). Default: `console`. |
| `EMAIL_SMTP_HOST` | SMTP hostname (e.g. `mailpit` in Docker Compose). Required when `EMAIL_PROVIDER=smtp`. |
| `EMAIL_SMTP_PORT` | SMTP port (e.g. `1025` for Mailpit). Required when `EMAIL_PROVIDER=smtp`. |
| `EMAIL_FROM_ADDRESS` | Sender address in outbound email (e.g. `noreply@formai.local` locally, verified sender in prod). |
| `EMAIL_APP_NAME` | App name shown in email copy (e.g. `Formai`). |
| `RESEND_API_KEY` | Resend API key. Required when `EMAIL_PROVIDER=resend`. Set as a Fly secret — never commit to source. |

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
- **`bubble_*` column names** — legacy from old Bubble.io integration; `app_user.bubble_user_id` and `client_profile.bubble_client_profile_id` could be renamed to generic external-ID fields. Deferred — ticket at `docs/ticket-rename-bubble-user-id.md`.
- **Route-level JSON middleware** — some routes mount `express.json()` despite a global parser already being present in `server.js`. Low risk, cosmetic cleanup only.
- **Error alerting** — production errors are discovered by users, not alerts. Fly.io health check (`/health`, every 10s) covers total outages; 5xx route errors are not alerted. Sentry integration is planned — ticket at `docs/ticket-sentry-error-tracking.md`.

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

---

## 11) Engineering Maturity Assessment

**Score: 8.8 / 10 — Production-ready** *(assessed March 2026)*

### Test coverage summary

| Suite | File | Tests |
|---|---|---|
| Pipeline step 01 | `engine/steps/__tests__/01_buildProgramFromDefinition.test.js` | ~40 |
| Pipeline step 02 | `engine/steps/__tests__/02_segmentProgram.test.js` | ~35 |
| Pipeline step 03 | `engine/steps/__tests__/03_applyProgression.test.js` | ~30 |
| Pipeline steps 04–06 | existing `__tests__/` suites | ~80 |
| Exercise selector | `engine/__tests__/exerciseSelector.test.js` | ~60 |
| Selector strategies | `engine/__tests__/selectorStrategies.test.js` | ~15 |
| `clientProfileService` | `services/__tests__/clientProfileService.test.js` | 15 |
| `generateProgramV2` route | `test/generateProgramV2.route.test.js` | 4 |
| `generateProgramV2` integration | `test/generateProgramV2.integration.test.js` | 1 |
| `readProgram` route | `test/readProgram.route.test.js` | ~15 |
| `segmentLog` route | `test/segmentLog.route.test.js` | ~15 |
| `historyPrograms` route | `test/historyPrograms.route.test.js` | ~10 |
| Async error forwarding | `test/asyncErrorForwarding.test.js` | ~5 |
| **Total** | | **~299** |

All 299 tests pass in CI (`ci.yml`) with a real Postgres 16 instance. Zero tests skipped.

### What's covered
- All 6 pipeline steps independently unit-tested
- Exercise selector scoring, fallback chain, and strategy resolution
- All mobile-critical route handlers (validation, not-found, success paths): `readProgram`, `segmentLog`, `historyPrograms`, `generateProgramV2`
- `clientProfileService` upsert + patch logic
- Express 5 async error forwarding
- CI gates PRs — broken main is caught before deploy

### Known acceptable gaps
- **Admin routes** (`adminNarration`, `adminConfigs`, `adminCoverage`, `adminObservability`) — no unit tests. Admin panel is internal-only; breakage is visible immediately and not user-facing.
- **`prsFeed`, `sessionHistoryMetrics`, `loggedExercises`** — no route tests. Read-only, low-complexity endpoints; breakage is detectable via manual smoke test.

### Deferred roadmap
- Sentry error tracking — `docs/ticket-sentry-error-tracking.md`
- `bubble_user_id` → `user_key` rename — `docs/ticket-rename-bubble-user-id.md`

---

## 12) Authentication — Password Reset

### Overview

Password reset uses a 6-digit OTP (one-time code) sent by email. No magic link or redirect URL is needed — the user enters the code directly in the mobile app. This approach works without a registered domain, making it viable from day one with a free Resend sender address.

### Flow

```
Mobile: ResetPasswordScreen
  │  POST /api/auth/forgot-password  { email }
  ▼
API: look up app_user by email
     generate random 6-digit code (crypto.randomInt)
     SHA-256 hash the code → store in password_reset_token (expires 15 min)
     send email via emailService
     always return 200 (never reveal whether email exists)
  │
  ▼
Mobile: ResetPasswordCodeScreen
  │  POST /api/auth/reset-password  { email, code, new_password }
  ▼
API: look up unexpired, unused token for email
     SHA-256 hash the submitted code → compare to stored hash
     if match: bcrypt-hash new_password → update app_user.password_hash
               mark token used_at = now()
               delete all refresh_token rows for user (force re-login everywhere)
     return 200 or 400 (invalid/expired code)
  │
  ▼
Mobile: success screen → navigate to Login
```

### Rate limiting

Both routes are rate-limited to **5 requests per 15 minutes per IP** (via `express-rate-limit`).

### Email service (`api/src/services/emailService.js`)

Provider-agnostic abstraction controlled by `EMAIL_PROVIDER`:

| Provider | Value | Use case |
|---|---|---|
| Console | `console` | Default — logs email content to stdout; no external dependency |
| SMTP | `smtp` | Local dev with Mailpit; also works with any SMTP relay |
| Resend | `resend` | Production — Resend API, works without a custom domain using `onboarding@resend.dev` |

The service exposes:
- `sendPasswordResetEmail({ to, code })` — sends the branded reset email
- `hashCode(code)` — SHA-256 hex digest (shared with auth routes)

### Local dev setup

Mailpit runs as a Docker Compose service. It catches all outbound SMTP on port 1025 and provides a web UI at **http://localhost:8025**.

Required `api/.env` additions:
```
EMAIL_PROVIDER=smtp
EMAIL_SMTP_HOST=mailpit
EMAIL_SMTP_PORT=1025
EMAIL_FROM_ADDRESS=noreply@formai.local
EMAIL_APP_NAME=Formai
```

### Production (Fly.io) setup

Use Resend with the `onboarding@resend.dev` sender until a verified domain is configured. Set secrets via CLI:

```sh
fly secrets set EMAIL_PROVIDER=resend
fly secrets set RESEND_API_KEY=<your-key>
fly secrets set EMAIL_FROM_ADDRESS=onboarding@resend.dev
fly secrets set EMAIL_APP_NAME=Formai
```

Once a domain is added and verified in the Resend dashboard, update `EMAIL_FROM_ADDRESS` to `noreply@yourdomain.com`.

### Mobile screens

| Screen | File | Purpose |
|---|---|---|
| `ResetPasswordScreen` | `mobile/src/screens/auth/ResetPasswordScreen.tsx` | Collects email, calls `forgot-password`, navigates to code entry screen |
| `ResetPasswordCodeScreen` | `mobile/src/screens/auth/ResetPasswordCodeScreen.tsx` | Collects 6-digit code + new password, calls `reset-password`, shows success state |

Both screens are registered in `AuthNavigator` (`ResetPassword` and `ResetPasswordCode` routes). The code screen uses `textContentType="oneTimeCode"` so iOS can auto-fill the code from the SMS/email notification.

### Database

`password_reset_token` table (V35 migration):

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → `app_user(id)` ON DELETE CASCADE |
| `code_hash` | TEXT | SHA-256 hex of the 6-digit code |
| `expires_at` | TIMESTAMPTZ | 15 minutes from creation |
| `used_at` | TIMESTAMPTZ | Null until redeemed; set on successful reset |
| `created_at` | TIMESTAMPTZ | Now |

Index: `idx_prt_user` on `(user_id)` for fast lookup.
