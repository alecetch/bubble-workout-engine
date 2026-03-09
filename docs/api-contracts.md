# API Contracts

This document reflects the **current implemented API behavior** in `api/server.js` and `api/src/routes/*`.

Base URL examples assume local Docker setup:
- `http://localhost:3000`

## Conventions (Current)

## Error envelope (most routes)
Most `/api/*` routes use:
```json
{
  "ok": false,
  "code": "validation_error|not_found|internal_error|...",
  "error": "Human-readable message",
  "details": []
}
```

Notes:
- `details` is optional.
- Some routes include `request_id` on error (not universal).
- Non-API unmatched routes return Express default HTML 404.

## Auth

> **Current mode: internal token (temporary).**
> TODO: replace with per-user JWT or session auth before public launch.

### Write routes (`POST /api/*`)
All four write routes now require:
```
X-Internal-Token: <value>
```
where `<value>` must match env var `INTERNAL_API_TOKEN`.

Applies to:
- `POST /api/user/bootstrap`
- `POST /api/client_profile/bootstrap`
- `POST /api/program/generate`
- `POST /api/import/emitter`

Missing or incorrect token returns:
```json
{
  "ok": false,
  "request_id": "<uuid>",
  "code": "unauthorized",
  "error": "Invalid or missing X-Internal-Token"
}
```
Status: `401`

If `INTERNAL_API_TOKEN` is not set in the environment, all write requests are rejected (fail-safe).

### Read routes (`GET /api/*`)
- Currently unauthenticated. TODO: add auth before public launch.

### Legacy route
- `POST /generate-plan` enforces a separate `x-engine-key` header (unchanged).

## Pagination
- No endpoint currently supports explicit pagination (`limit/offset/cursor`) in responses.

---

## 1) Health

### GET `/health`
Auth: none

Request DTO: none

Success response:
```json
{
  "ok": true,
  "dbTime": "2026-02-25T...Z"
}
```

Errors:
- `500 internal_error` (from final server error handler)

Idempotency: read-only; idempotent.

Example:
```bash
curl http://localhost:3000/health
```

---

## 2) Legacy Plan Generation (No Postgres persist)

### POST `/generate-plan`
Auth: required header `x-engine-key == ENGINE_KEY`

Request DTO:
```json
{
  "clientProfileId": "<bubble thing id>",
  "programType": "hypertrophy"
}
```
- `programType` defaults to `"hypertrophy"`.

Success response:
```json
{
  "ok": true,
  "plan": {
    "programType": "hypertrophy",
    "program": {},
    "rows": []
  }
}
```

Errors:
- `401`: `{"ok":false,"error":"Unauthorized"}`
- `500`: `{"ok":false,"error":"<message>"}`
- JSON parse failures globally: `400` with `code: "invalid_json"`

Filtering/pagination: none.

Idempotency: no explicit idempotency guard; does not persist to DB in this route.

Example:
```bash
curl -X POST http://localhost:3000/generate-plan \
  -H "Content-Type: application/json" \
  -H "x-engine-key: $ENGINE_KEY" \
  -d '{"clientProfileId":"1765...","programType":"hypertrophy"}'
```

---

## 3) User Bootstrap

### POST `/api/user/bootstrap`
Auth: none

Request DTO:
```json
{
  "bubble_user_id": "1765627765942x341683062868803600"
}
```
Rules:
- required, trimmed string
- must be length >= 6

Success response:
```json
{
  "ok": true,
  "user_id": "<uuid>",
  "bubble_user_id": "<input>"
}
```

Errors:
- `400 validation_error`
- `409 unique_violation` (defensive; upsert normally avoids this)
- `500 schema_missing|internal_error`

Filtering/pagination: none.

Idempotency:
- Effectively idempotent via `INSERT ... ON CONFLICT (bubble_user_id) DO UPDATE ...`.

Example:
```bash
curl -X POST http://localhost:3000/api/user/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"bubble_user_id":"1765627765942x341683062868803600"}'
```

---

## 4) Client Profile Bootstrap

### POST `/api/client_profile/bootstrap`
Auth: none

Request DTO (minimum):
```json
{
  "bubble_user_id": "1765...",
  "bubble_client_profile_id": "1765..."
}
```
Optional fields accepted (normalized/upserted):
- `display_name`
- `fitness_level` / `fitness_level_slug`
- `equipment_items_slugs` or `equipment_items_slugs_csv`
- `injury_flags`
- `preferred_days`
- `main_goals` / `main_goals_slugs`
- `minutes_per_session`, `height_cm`, `weight_kg`
- `body_type_preference`, `equipment_items_text`, `equipment_notes`, `equipment_preset`
- `goal_notes`, `ok_with_gymless_backup`, `program_intensity_preference`
- `schedule_constraints`, `theme`
- `bubble_creation_date`, `bubble_modified_date`, `slug`, `creator`, `bubble_user_raw`, `is_archived`

Success response:
```json
{
  "ok": true,
  "client_profile_id": "<uuid>",
  "user_id": "<uuid>",
  "bubble_client_profile_id": "<input>"
}
```

Errors:
- `400 validation_error|foreign_key_violation`
- `409 unique_violation`
- `500 schema_missing|internal_error`

Filtering/pagination: none.

Idempotency:
- Idempotent by `bubble_client_profile_id` (`ON CONFLICT DO UPDATE`).
- Also upserts `app_user` in the same transaction.

Example:
```bash
curl -X POST http://localhost:3000/api/client_profile/bootstrap \
  -H "Content-Type: application/json" \
  -d '{
    "bubble_user_id":"1765...",
    "bubble_client_profile_id":"1765...",
    "fitness_level":"Intermediate",
    "preferred_days":"Thurs , Tues , Sat"
  }'
```

---

## 5) Allowed Exercises Debug

### GET `/api/client_profile/:id/allowed_exercises`
Auth: none

Path params:
- `id`: UUID client profile id (required)

Request DTO: none

Success response:
```json
{
  "ok": true,
  "client_profile_id": "<uuid>",
  "bubble_client_profile_id": "1765...",
  "inputs": {
    "fitness_rank": 1,
    "injury_flags_slugs": [],
    "equipment_items_slugs": ["barbell","dumbbells"]
  },
  "allowed_count": 123,
  "allowed_ids_preview": ["ex_001","ex_002"],
  "duration_ms": 12
}
```

Errors:
- `400 validation_error` (invalid UUID)
- `404 not_found`
- `500 internal_error`

Filtering/pagination: none. Preview list is capped to first 50.

Idempotency: read-only; idempotent.

Example:
```bash
curl "http://localhost:3000/api/client_profile/9e.../allowed_exercises"
```

---

## 6) Program Generate + Persist (v2)

### POST `/api/program/generate`
Auth: none

Request DTO:
```json
{
  "bubble_user_id": "1765...",
  "bubble_client_profile_id": "1765...",
  "programType": "hypertrophy",
  "anchor_date_ms": 1761052800000
}
```
Rules:
- `bubble_user_id` required
- `bubble_client_profile_id` required
- `programType` optional, defaults to `hypertrophy`
- `anchor_date_ms` optional, defaults to `Date.now()`
- if provided, `anchor_date_ms` must be finite number

Processing summary:
1. Resolve `app_user` from `bubble_user_id`
2. Resolve `client_profile` (must belong to user)
3. Compute allowed exercise ids from Postgres catalog
4. Assemble pipeline inputs via `buildInputsFromDevProfile` (reads exercise catalogue, config rows, and client profile from Postgres — no external API calls)
5. Inject `allowed_exercise_ids`, `pg_user_id`, `pg_client_profile_id`
6. Run pipeline (`runPipeline`) to produce emitter rows
7. Import rows transactionally via `importEmitterPayload`
8. Ensure calendar coverage via `ensureProgramCalendarCoverage`

Success response:
```json
{
  "ok": true,
  "program_id": "<uuid>",
  "idempotent": false,
  "counts": {
    "weeks": 8,
    "days": 24,
    "segments": 96,
    "exercises": 192
  },
  "allowed_count": 123
}
```

Errors:
- `400 validation_error`
- `404 not_found` (`User not bootstrapped`, `Client profile not found`)
- `500 internal_error`

Filtering/pagination: none.

Idempotency:
- Underlying import step is idempotent (advisory lock + payload signature + structural match).
- Route surfaces `idempotent` from importer result.

Example:
```bash
curl -X POST http://localhost:3000/api/program/generate \
  -H "Content-Type: application/json" \
  -d '{
    "bubble_user_id":"1765...",
    "bubble_client_profile_id":"1765...",
    "programType":"hypertrophy",
    "anchor_date_ms":1761052800000
  }'
```

---

## 7) Raw Emitter Import

### POST `/api/import/emitter`
Auth: none

Request DTO (preferred):
```json
{
  "user_id": "<uuid>",
  "anchor_date_ms": 1761052800000,
  "rows": ["PRG|...", "WEEK|...", "DAY|...", "SEG|...", "EX|..."]
}
```
Alternative payload:
```json
{
  "user_id": "<uuid>",
  "anchor_date_ms": 1761052800000,
  "emitter_output": "PRG|...\nWEEK|...\nDAY|..."
}
```

Validation:
- `user_id` required
- `anchor_date_ms` required finite number
- rows required (`rows[]` or `emitter_output`)
- strict row shape validation:
  - `PRG` 9 cols
  - `WEEK` 4 cols
  - `DAY` 14 cols
  - `SEG` 19 cols
  - `EX` 26 cols

Success response:
```json
{
  "ok": true,
  "program_id": "<uuid>",
  "counts": {
    "weeks": 8,
    "days": 24,
    "segments": 96,
    "exercises": 192
  },
  "idempotent": true
}
```

Error response:
```json
{
  "ok": false,
  "request_id": "<uuid>",
  "code": "validation_error|foreign_key_violation|...",
  "error": "...",
  "details": []
}
```

Filtering/pagination: none.

Idempotency:
- Explicit deterministic idempotency in `importEmitterService`.

Example:
```bash
curl -X POST http://localhost:3000/api/import/emitter \
  -H "Content-Type: application/json" \
  -d '{"user_id":"6d...","anchor_date_ms":1761052800000,"rows":["PRG|..."]}'
```

---

## 8) Program Overview Read

### GET `/api/program/:program_id/overview`
Auth: none

Path params:
- `program_id` UUID required

Query params:
- `user_id` UUID (preferred if present)
- `bubble_user_id` text (used if `user_id` absent)
- `selected_program_day_id` UUID (optional)

User resolution:
- If `user_id` provided, must be UUID.
- Else requires `bubble_user_id` and resolves via `app_user`.

Success response:
```json
{
  "ok": true,
  "program": {
    "program_id": "<uuid>",
    "program_title": "...",
    "program_summary": "...",
    "weeks_count": 8,
    "days_per_week": 3,
    "start_date": "2026-02-25",
    "status": "active"
  },
  "weeks": [{ "week_number": 1, "focus": "...", "notes": "..." }],
  "calendar_days": [],
  "selected_day": { "program_day_id": "<uuid>", "equipment_slugs": [] }
}
```

Errors:
- `400 validation_error|invalid_input`
- `404 not_found`
- `500 internal_error|schema_missing`

Filtering/pagination:
- No pagination.
- Calendar sorted by `scheduled_date`.

Idempotency: read-only; idempotent.

Example:
```bash
curl "http://localhost:3000/api/program/2b.../overview?bubble_user_id=1765..."
```

---

## 9) Day Full Read

### GET `/api/day/:program_day_id/full`
Auth: none

Path params:
- `program_day_id` UUID required

Query params:
- `user_id` UUID OR `bubble_user_id` text (same resolution rules as overview)

Success response:
```json
{
  "ok": true,
  "day": {
    "program_day_id": "<uuid>",
    "program_id": "<uuid>",
    "scheduled_date": "2026-02-25",
    "week_number": 1,
    "day_number": 1,
    "is_completed": false,
    "has_activity": false
  },
  "segments": [
    {
      "workout_segment_id": "<uuid>",
      "segment_key": "B1_S1",
      "items": [
        {
          "program_exercise_id": "<uuid>",
          "exercise_id": "ex_001",
          "order_in_day": 1
        }
      ]
    }
  ]
}
```

Errors:
- `400 validation_error|invalid_input`
- `404 not_found`
- `500 internal_error|schema_missing`

Filtering/pagination:
- No pagination.
- Segment order: `block_order, segment_order_in_block`
- Exercise order: `order_in_day`

Idempotency: read-only; idempotent.

Example:
```bash
curl "http://localhost:3000/api/day/9c.../full?user_id=9e..."
```

---

## 10) Global JSON Parse Errors

For malformed JSON requests parsed by global middleware:
- Status: `400`
- Body:
```json
{
  "ok": false,
  "code": "invalid_json",
  "error": "Invalid JSON"
}
```

---

## Inconsistencies / Contract Gaps Found

1. Envelope inconsistency
- `POST /generate-plan` uses `{ok,error}` without `code`.
- Most `/api/*` routes use `{ok,code,error,details?}`.

2. Path inconsistency
- Two generation endpoints exist with different semantics:
  - `/generate-plan` (legacy stub — no longer the primary path; no Postgres import)
  - `/api/program/generate` (new path, resolves IDs, computes allowed list, persists via importer)

3. Auth inconsistency
- Only `/generate-plan` enforces `x-engine-key`; `/api/*` endpoints currently unauthenticated.

4. Input parser middleware inconsistency
- Global JSON parser exists, but `userBootstrap` and `clientProfileBootstrap` also mount route-level `express.json(...)`.

5. Query/column mismatch in read route
- `/api/program/:program_id/overview` reads `program_exercise.equipment_items_slugs_csv`,
  while schema/migrations also use `equipment_items_slugs` in other contexts.

6. Helper naming inconsistency
- Allowed-exercise helper file path is `engine/getAllowedExercises.js`, but exported symbol is `getAllowedExerciseIds` and comments reference `getAllowedExerciseIds.js`.

7. Pagination support absent
- No list endpoint returns paging metadata; large programs/days return full arrays.