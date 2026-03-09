# Database Schema Guide

This document reflects the current Postgres schema defined in `migrations/` and how it is used by the API code.

## Scope and Current State

- Database: Postgres (14+ target in migrations; local compose uses Postgres 16).
- Migration tool: Flyway (`V*__*.sql` files under `migrations/`).
- Core domain: generated training programs, day/segment/exercise structure, workout logs, user/profile bootstrap, and exercise catalogue filtering.

---

## Tables and Purpose

### 1) `app_user`
Purpose: maps external client-supplied user IDs (text) to internal Postgres UUIDs. The column is named `bubble_user_id` for historical reasons — it is now an opaque external identifier.

- Key columns:
  - `id uuid pk default gen_random_uuid()`
  - `bubble_user_id text not null unique`
  - `created_at`, `updated_at` (`timestamptz`)
- Used by:
  - `POST /api/user/bootstrap`
  - `POST /api/client_profile/bootstrap`
  - `POST /api/program/generate`
  - `GET` program/day read endpoints when resolving `bubble_user_id`

### 2) `client_profile`
Purpose: source-of-truth profile inputs (fitness/equipment/injury/preferences) tied to `app_user`.

- Key columns:
  - `id uuid pk`
  - `user_id uuid not null references app_user(id) on delete cascade`
  - `bubble_client_profile_id text not null unique`
  - `fitness_level_slug text`, `fitness_rank int check (fitness_rank >= 0)`
  - `equipment_items_slugs text[]`, `injury_flags text[]`, `preferred_days text[]`, `main_goals_slugs text[]`
  - profile metadata fields (`minutes_per_session`, `height_cm`, `weight_kg`, etc.)
  - archival/audit: `is_archived`, legacy timestamp/raw fields from original CSV import, `created_at`, `updated_at`
- Used by:
  - bootstrap upsert endpoint
  - generation route (`bubble_client_profile_id + user_id` lookup)
  - debug allowed-exercise endpoint

### 3) `exercise_catalogue`
Purpose: normalised exercise library seeded via Flyway repeatable migration and used for filtering allowed exercises at generation time.

- Key columns:
  - `exercise_id text pk`
  - gating fields: `is_archived`, `min_fitness_rank`, `contraindications_slugs text[]`, `equipment_items_slugs text[]`
  - option-like metadata: `movement_class`, `movement_pattern_primary`, swap groups, role/class fields
  - JSONB arrays/objects: `contraindications_json`, `equipment_json`, `preferred_in_json`, `target_regions_json`, `warmup_hooks`
  - audit fields: `bubble_unique_id` (legacy external ID from original CSV import), `bubble_creation_date`, `bubble_modified_date`, `slug`, `creator`
- Used by:
  - `engine/getAllowedExercises.js` query (rank, contraindication overlap, equipment containment)

### 4) `program`
Purpose: program header and lifecycle metadata for a generated plan.

- Key columns:
  - `id uuid pk`
  - `user_id uuid not null references app_user(id)` — ownership; RESTRICT on delete (V6)
  - `client_profile_id uuid null references client_profile(id) on delete set null` (V6)
  - program metadata (`program_title`, `program_summary`, `weeks_count`, `days_per_week`)
  - schedule anchors (`start_date`, `start_offset_days`, `start_weekday`, `preferred_days_sorted_json`)
  - status/revision/parent linkage (`status`, `revision`, `parent_program_id -> program(id)`)
  - `program_outline_json jsonb`
- Used by:
  - import pipeline writes
  - read routes (`overview`, `day/full` ownership checks)

### 5) `program_week`
Purpose: week-level grouping under a program.

- Key columns:
  - `id uuid pk`
  - `program_id fk -> program(id) on delete cascade`
  - `week_number int`, `focus`, `notes`, optional phase/title fields
- Constraints:
  - `unique(program_id, week_number)`

### 6) `program_day`
Purpose: day-level plan rows (schedule + generation/activity status).

- Key columns:
  - `id uuid pk`
  - `program_id fk -> program(id) on delete cascade`
  - `program_week_id fk -> program_week(id) on delete cascade`
  - day identity/order: `week_number`, `day_number`, `global_day_index`, `program_day_key`
  - schedule fields: `scheduled_offset_days`, `scheduled_weekday`, `scheduled_date`
  - format/state flags and optional call log JSON
- Constraints:
  - `unique(program_id, program_day_key)`
  - `unique(program_id, week_number, day_number)`

### 7) `program_calendar_day`
Purpose: denormalized calendar projection for program days.

- Key columns:
  - `id uuid pk`
  - `program_id fk`, `program_week_id fk`, `program_day_id fk` (all cascade)
  - `scheduled_date`, `scheduled_weekday`, `global_day_index`, `program_day_key`, training flag
- Constraints:
  - `unique(program_id, scheduled_date)`
  - `unique(program_id, program_day_key)`

### 8) `workout_segment`
Purpose: workout block/segment structure for each day.

- Key columns:
  - `id uuid pk`
  - `program_id fk -> program(id) on delete cascade`
  - `program_day_id fk -> program_day(id) on delete cascade`
  - segment keys/order (`segment_key`, `block_key`, `block_order`, `segment_order_in_block`)
  - display/prescription fields + `segment_scheme_json`
- Constraints:
  - `unique(program_day_id, segment_key)`
  - `unique(program_day_id, block_order, segment_order_in_block)`

### 9) `program_exercise`
Purpose: exercise prescription rows under day/segment.

- Key columns:
  - `id uuid pk`
  - `program_id fk -> program(id) on delete cascade`
  - `program_day_id fk -> program_day(id) on delete cascade`
  - `workout_segment_id fk -> workout_segment(id) on delete set null`
  - exercise identity/order/prescription fields
  - `equipment_items_slugs_csv text` (legacy CSV format for day equipment derivation)
- Constraints:
  - `unique(program_day_id, order_in_day)`
  - `unique(program_day_id, segment_key, order_in_block, exercise_id)`

### 10) `segment_exercise_log`
Purpose: user performance logging for prescribed exercises/segments.

- Key columns:
  - `id uuid pk`
  - `user_id uuid not null references app_user(id)` — RESTRICT on delete (V6)
  - `program_id fk -> program(id) on delete cascade`
  - `program_day_id fk -> program_day(id) on delete cascade`
  - optional refs: `workout_segment_id` and `program_exercise_id` (`on delete set null`)
  - performance values and `segment_log jsonb`
  - draft/completion lifecycle + timestamps

---

## Foreign Keys and Delete Behavior

- Cascades:
  - `program_week.program_id -> program.id`
  - `program_day.program_id -> program.id`
  - `program_day.program_week_id -> program_week.id`
  - `program_calendar_day.program_id -> program.id`
  - `program_calendar_day.program_week_id -> program_week.id`
  - `program_calendar_day.program_day_id -> program_day.id`
  - `workout_segment.program_id -> program.id`
  - `workout_segment.program_day_id -> program_day.id`
  - `program_exercise.program_id -> program.id`
  - `program_exercise.program_day_id -> program_day.id`
  - `segment_exercise_log.program_id -> program.id`
  - `segment_exercise_log.program_day_id -> program_day.id`
  - `client_profile.user_id -> app_user.id`
- Set null:
  - `program_exercise.workout_segment_id -> workout_segment.id`
  - `segment_exercise_log.workout_segment_id -> workout_segment.id`
  - `segment_exercise_log.program_exercise_id -> program_exercise.id`

---

## Indexes (Current)

Program hierarchy:
- `idx_program_user (user_id, created_at desc)`
- `idx_program_client_profile (client_profile_id, created_at desc)`
- `idx_program_week_program (program_id, week_number)`
- `idx_program_day_program_date (program_id, scheduled_date)`
- `idx_program_day_program_week (program_id, week_number, day_number)`
- `idx_program_day_key (program_day_key)`
- `idx_calendar_program_date (program_id, scheduled_date)`
- `idx_segment_day (program_day_id, block_order, segment_order_in_block)`
- `idx_segment_day_key (program_day_key)`
- `idx_ex_day (program_day_id, order_in_day)`
- `idx_ex_segment (program_day_id, segment_key, order_in_block)`
- `idx_ex_exercise_id (exercise_id)`

Logs:
- `idx_log_day (user_id, program_day_id)`
- `idx_log_ex (user_id, program_exercise_id)`
- `idx_log_day_order (user_id, program_day_id, order_index)`
- `idx_log_segment_order (user_id, workout_segment_id, order_index)`
- `idx_log_day_order_completed` partial where `is_draft=false`
- `idx_log_user_created_at (user_id, created_at)`
- `idx_log_exercise_created_at (user_id, program_exercise_id, created_at)`

Catalogue/profile:
- `idx_ex_cat_movement (movement_pattern_primary, movement_class)`
- `idx_ex_cat_rank (min_fitness_rank)`
- `idx_ex_cat_swap1`, `idx_ex_cat_swap2`
- GIN: `idx_ex_cat_equipment_items_gin`, `idx_ex_cat_contraindications_gin`
- `idx_client_profile_user_id`
- `idx_client_profile_user_archived (user_id, is_archived)`
- GIN: `idx_client_profile_equipment_items_gin`, `idx_client_profile_injury_flags_gin`, `idx_client_profile_preferred_days_gin`

Note: unique constraints also create backing indexes (e.g., `bubble_user_id`, `bubble_client_profile_id`, `(program_id, program_day_key)`).

---

## Constraints and Data Integrity

Common patterns used across schema:
- UUID PKs for write-heavy entities.
- `NOT NULL` with explicit defaults for state fields.
- `CHECK` constraints for non-negative numeric domain rules (counts, duration, order).
- Composite unique constraints to enforce deterministic ordering and key identity.
- `jsonb` for structured payloads (`program_outline_json`, call logs, segment schemes, logs).
- `text[]` plus GIN for list-option filtering (`equipment`, `injury`, contraindications).

---

## Enum Usage

No native Postgres enums are currently defined.

Instead, enum-like values are stored as text/text[] slugs:
- `fitness_level_slug`, `body_type_preference_slug`, `theme_slug`, etc.
- `day_type`, `segment_type`, `purpose`, `status`.

Implication: app code must enforce allowed values; database currently enforces presence/defaults but not strict enumerated domains.

---

## Migration Conventions

Observed Flyway convention:
- Filename format: `V<version>__<description>.sql`.
- Additive, forward-only migrations (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- Schema evolves via versioned SQL in repo root `migrations/`.
- Local docker compose runs Flyway container with mounted `./migrations` and `migrate` command.

Recommendation:
- Keep one concern per migration (table creation vs performance indexes already split in V1/V2).
- When introducing computed/idempotency fields, add explicit unique/index constraints in dedicated migration.

---

## Seed / Bootstrap Strategy

No static SQL seed migrations are present.

Current strategy is runtime/script bootstrap:
- `POST /api/user/bootstrap`: upsert `app_user` by `bubble_user_id`.
- `POST /api/client_profile/bootstrap`: upsert `client_profile` + ensure `app_user`.
- CSV import scripts:
  - `api/scripts/importExerciseCatalogueFromCsv.js`
  - `api/scripts/importClientProfilesFromCsv.js`
- Program data is created by canonical writer/import pipeline (`importEmitterPayload`).

Recommendation:
- Treat CSV import scripts as deterministic seed/data-load jobs per environment.
- Add runbook docs for ordering: `V* migrations -> user/profile bootstrap -> catalogue import -> profile import`.

---

## RLS Status and Recommended Pattern

Current state: no Row Level Security policies found (`ENABLE ROW LEVEL SECURITY` / `CREATE POLICY` not present in migrations).

Given multi-tenant ownership (`program.user_id`, `client_profile.user_id`, `segment_exercise_log.user_id`), recommended RLS pattern:
- Enable RLS on tenant-scoped tables (`program`, child program tables, `client_profile`, `segment_exercise_log`).
- Set session tenant context per request (`SET LOCAL app.user_id = '<uuid>'`).
- Policy style:
  - `USING (user_id = current_setting('app.user_id', true)::uuid)` for owner tables.
  - For child tables without `user_id`, use `EXISTS` join to parent `program` constrained by same setting.
- Keep service-role bypass only for trusted admin/import jobs.

---

## Missing / Candidate Indexes from Code Query Patterns

Based on current route/service SQL:

1. `program_day` "next selected day" query tie-breaker
- Query orders by computed bucket + `scheduled_date`, then `global_day_index`.
- Existing index: `(program_id, scheduled_date)`.
- Candidate: `idx_program_day_program_date_global` on `(program_id, scheduled_date, global_day_index)`.

2. `segment_exercise_log` potential program-level history scans
- There is no dedicated index on `(user_id, program_id, created_at)`.
- Candidate if history screens group by program: `idx_log_user_program_created_at`.

3. Idempotency lookup in `importEmitterPayload`
- Current check compares many columns on `program` + counts on child tables; this can get expensive at scale.
- Strong recommendation: persist `import_signature` on `program` and add unique index on `(user_id, import_signature)` for O(log n) idempotency checks.

4. Ownership-scoped profile lookup (optional)
- Query uses `WHERE bubble_client_profile_id = $1 AND user_id = $2`.
- Unique index on `bubble_client_profile_id` already exists and should be selective.
- Optional composite index `(user_id, bubble_client_profile_id)` only if future plans require user-first profile scans.

5. Column naming consistency risk
- Code dynamically handles `injury_flags_slugs` vs `injury_flags`; schema currently has `injury_flags`.
- Not an index gap, but a schema-contract consistency gap worth standardizing to avoid dynamic column resolution overhead and accidental query drift.

---

## Environment and Operational Notes

Primary DB env vars used by API:
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- Pool tuning currently in `api/src/db.js`: `PGPOOL_MAX` and `idleTimeoutMillis`.

Local compose:
- `db` service (`postgres:16`)
- `flyway` service applies migrations from `./migrations`
- `api` service connects via env vars above
