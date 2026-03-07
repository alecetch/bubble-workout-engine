# Architecture Overview

This document summarizes the current architecture of `bubble-workout-engine` as implemented in this repository.

## 1) System Overview

The repo currently contains:
- A Node.js/Express API (`api/`)
- Flyway SQL migrations (`migrations/`)
- Project docs (`docs/`)

There is no React Native application code in this repository at this time. The mobile/client app appears to be external and integrates via HTTP APIs.

### High-Level Diagram

```text
+----------------------+            +-------------------------+
| Bubble App / Client  |            | React Native App (ext) |
| (auth + profile UI)  |            | (not in this repo)     |
+----------+-----------+            +-----------+-------------+
           |                                    |
           | HTTPS                              | HTTPS
           v                                    v
+---------------------------------------------------------------+
|                    Node/Express API (api/)                    |
|                                                               |
|  Routes                                                       |
|  - /api/user/bootstrap                                        |
|  - /api/client_profile/bootstrap                              |
|  - /api/program/generate                                      |
|  - /api/import/emitter                                        |
|  - /api/program/:id/overview                                  |
|  - /api/day/:id/full                                          |
|  - /api/client_profile/:id/allowed_exercises                 |
|                                                               |
|  Engine                                                       |
|  - runPipeline -> steps 01..06 -> emitted rows               |
|                                                               |
|  Services                                                     |
|  - importEmitterService (transactional ingest + idempotency) |
+--------------------------+------------------------------------+
                           |
                           | pg (pool)
                           v
+--------------------------------------------------+
| Postgres (db container)                          |
| - app_user, client_profile                       |
| - program, program_week, program_day, ...        |
| - exercise_catalogue, segment_exercise_log       |
+--------------------------+-----------------------+
                           ^
                           |
                           | Flyway migrate
+--------------------------+-----------------------+
| Flyway container (migrations/*.sql)              |
+--------------------------------------------------+

Additional dependency during generation:
API -> Bubble Data API (BUBBLE_API_BASE/BUBBLE_API_TOKEN)
for input fetches (client profile, catalog/config objects).
```

## 2) Backend Structure (Current)

### Entry point
- `api/server.js`
  - Configures global JSON parser with raw body capture.
  - Adds targeted debug logging for `POST /api/program/generate`.
  - Registers route modules under `/api`.
  - Includes JSON parse error handler and final generic error handler.
  - Exposes `GET /health` and legacy `POST /generate-plan`.

### Database access
- `api/src/db.js`
  - Exports shared `pg.Pool` configured by env vars.

### Route modules
- `api/src/routes/userBootstrap.js`
  - Upserts `app_user` by `bubble_user_id`.
- `api/src/routes/clientProfileBootstrap.js`
  - Upserts `client_profile` and ensures `app_user` exists.
- `api/src/routes/generateProgram.js`
  - Resolves Bubble IDs -> Postgres IDs, computes allowed exercise IDs,
    fetches Bubble inputs, runs pipeline, imports emitted rows to Postgres.
- `api/src/routes/importEmitter.js`
  - Thin wrapper over shared ingest service for raw emitter rows.
- `api/src/routes/readProgram.js`
  - Program overview/day detail read APIs.
  - Supports either `user_id` or `bubble_user_id` for ownership resolution.
- `api/src/routes/debugAllowedExercises.js`
  - Debug endpoint to inspect allowed exercise outputs by client profile.

### Service layer
- `api/src/services/importEmitterService.js`
  - Shared transactional ingestion logic.
  - Validates PRG/WEEK/DAY/SEG/EX row shapes and constraints.
  - Writes program/week/day/segment/exercise/calendar rows in one transaction.
  - Applies deterministic idempotency guard (hash + advisory lock + match query).

### Engine
- `api/engine/runPipeline.js`
  - Orchestrates steps 01..06.
  - Step 06 emits pipe-delimited PRG/WEEK/DAY/SEG/EX rows.
- `api/engine/steps/*.js`
  - Program construction, segmentation, progression, rep rules, narration, emit.
- `api/engine/getAllowedExercises.js`
  - SQL-based filter against `exercise_catalogue` using fitness/injury/equipment.

### Bubble integration
- `api/bubbleClient.js`
  - Fetches objects from Bubble Data API.
  - Used by generation flows to hydrate pipeline inputs.

## 3) Data Model & Persistence

Flyway migrations define schema evolution:
- `V1__create_program_schema.sql`: core program tables
- `V2__add_indexes.sql`: performance indexes
- `V3__create_app_user.sql`: Bubble user -> UUID mapping
- `V4__create_exercise_catalogue.sql`: exercise catalog in Postgres
- `V5__create_client_profile.sql`: client profile source-of-truth table

Core ownership model:
- `app_user.bubble_user_id` uniquely maps Bubble users to Postgres UUIDs.
- `client_profile.user_id` enforces ownership and links generation inputs to user.
- Generated programs (`program`, `program_day`, etc.) are persisted server-side.

## 4) Request/Data Flow (Login -> Fetch -> Cache -> Persist)

## Login / identity
1. User authenticates in Bubble/client (outside this repo).
2. Client calls `POST /api/user/bootstrap` with `bubble_user_id`.
3. API upserts into `app_user` and returns `user_id` (UUID).

## Profile bootstrap/persist
1. Client calls `POST /api/client_profile/bootstrap`.
2. API ensures `app_user` exists, normalizes option fields/slugs, upserts `client_profile`.
3. Profile becomes canonical in Postgres for exercise gating and generation context.

## Generation fetch + compute + persist
1. Client calls `POST /api/program/generate` with Bubble identifiers.
2. API resolves `app_user` and `client_profile` in Postgres.
3. API computes `allowed_exercise_ids` from `exercise_catalogue`.
4. API fetches broader Bubble inputs via `bubbleClient.fetchInputs(...)`.
5. API runs `runPipeline(...)` -> emitted PRG/WEEK/DAY/SEG/EX rows.
6. API calls `importEmitterPayload(...)` to persist all generated data in one DB transaction.
7. API returns `program_id`, counts, idempotent status, and allowed count.

## Read path
1. Client calls read routes (`/api/program/:id/overview`, `/api/day/:id/full`).
2. API resolves ownership from `user_id` or `bubble_user_id`.
3. API serves assembled program/day views from Postgres.

## Caching (current state)
- No distributed cache (Redis/Memcached) is implemented.
- Minor in-process memoization exists for schema-column detection
  (`injury_flags_slugs` vs `injury_flags`) in specific routes.
- Data consistency relies on Postgres and transactional writes.

## 5) Environment & Deployment Configuration

Runtime is containerized via `docker-compose.yml`:
- `db`: Postgres 16
- `api`: Node 20, runs `npm install && npm start` in `/app`
- `flyway`: runs migrations from `./migrations`

Environment variables used by API:
- `PORT`
- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- `PGPOOL_MAX` (optional)
- `ENGINE_KEY` (legacy `/generate-plan` auth)
- `BUBBLE_API_BASE`, `BUBBLE_API_TOKEN`

## 6) Key Architectural Decisions and Constraints

1. Postgres as canonical writer for generated program data
- The ingest path is centralized in `importEmitterService` and wrapped in transactions.

2. Deterministic idempotency for imports
- Import uses payload hashing + advisory lock + structural existence checks to avoid duplicates.

3. Separation of concerns
- Route handlers are increasingly thin; heavy ingest logic is in `src/services`.
- Engine logic is isolated under `api/engine` with explicit step boundaries.

4. Bubble compatibility with gradual migration
- Bubble IDs are mapped to UUIDs (`app_user`).
- Client/exercise data is progressively mirrored into Postgres while Bubble API remains an input source.

5. Constraints / technical debt visible in code
- Mixed route stack: both legacy `/generate-plan` and newer `/api/program/generate` exist.
- Some routes still declare `express.json()` locally while a global parser already exists.
- No RN/frontend code in-repo, so client architecture is only inferable from API contracts.
- No centralized observability stack yet (logs are console JSON/text).