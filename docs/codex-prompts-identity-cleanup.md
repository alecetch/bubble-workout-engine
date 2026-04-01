# Codex Prompts — Identity Cleanup and Bubble Deprecation

**Prerequisite reading:** `docs/ticket-rename-bubble-user-id.md`

These prompts implement the approved identity cleanup plan in two releases.

## Release 1

- R1-A: Remove dev request body aliases
- R1-B: Enforce 1:1 on `client_profile(user_id)` via low-lock migration
- R1-C: Rename `app_user.bubble_user_id` → `subject_id`

## Release 2

- R2-A: Remove `bubble_client_profile_id` from service layer and schema
- R2-B: Rename `equipment_items.bubble_id` → `external_id`
- R2-C: Rename `buildInputsFromDevProfile.js` → `buildInputsFromProfile.js`
- R2-D: Drop Bubble legacy columns from `client_profile` *(requires stakeholder sign-off)*

---

## Prompt R1-A — Remove dev request body aliases

```
You are working in the api/ directory of a Node/Express workout engine (ESM modules throughout).

## Context

The route handler in api/src/routes/generateProgramV2.js currently accepts three
fallback aliases when reading the user identity from the request body:

  const user_id = s(req.body?.user_id || req.body?.bubble_user_id || req.body?.dev_user_id);

  const client_profile_id = s(
    req.body?.client_profile_id ||
    req.body?.bubble_client_profile_id ||
    req.body?.dev_client_profile_id ||
    req.body?.clientProfileId,
  );

The `dev_user_id` and `dev_client_profile_id` aliases are uncontrolled escape hatches
with no legitimate callers. They must be removed. The legitimate aliases
(`bubble_user_id`, `bubble_client_profile_id`, `clientProfileId`) are retained
because they are used by the mobile client and must not be changed yet.

## Task

In api/src/routes/generateProgramV2.js, make exactly these two changes:

1. Remove `req.body?.dev_user_id` from the user_id fallback chain.
   Result must be:
     const user_id = s(req.body?.user_id || req.body?.bubble_user_id);

2. Remove `req.body?.dev_client_profile_id` from the client_profile_id fallback chain.
   Result must be:
     const client_profile_id = s(
       req.body?.client_profile_id ||
       req.body?.bubble_client_profile_id ||
       req.body?.clientProfileId,
     );

Do not change anything else in this file.
Do not add comments.
Do not reformat surrounding code.

## Verification

After the change:

  grep -n "dev_user_id\|dev_client_profile_id" api/src/routes/generateProgramV2.js
  # Must return zero results

  cd api && node --check src/routes/generateProgramV2.js
  # Must succeed

  cd api && npm test -- --test-concurrency=1
  # Must pass
```

---

## Prompt R1-B — Enforce 1:1 on `client_profile(user_id)` via low-lock migration

```
You are working in the migrations/ directory of a Flyway-managed PostgreSQL schema.
The application uses Docker Compose: `docker compose run --rm flyway migrate` applies
pending migrations.

## Context

client_profile has a FK column user_id referencing app_user(id). The intended invariant
is one profile per user, but there is no database constraint enforcing this. This prompt
adds that constraint using the correct low-lock PostgreSQL pattern.

CREATE UNIQUE INDEX CONCURRENTLY cannot run inside a transaction. Flyway wraps
migrations in transactions by default. The correct way to override this per-script
in current Flyway is to place a .conf sidecar file alongside the .sql file, with
the content `executeInTransaction=false`. Flyway reads this file automatically
when it finds a migration with a matching name.

## Task

### Step 0 — Pre-check (must be run manually before applying migrations)

Run this query against the database and verify it returns zero rows:

  SELECT user_id, COUNT(*)
  FROM client_profile
  GROUP BY user_id
  HAVING COUNT(*) > 1;

If any rows are returned, do not proceed — report the violation and halt.

### Step 1 — Create: migrations/V27__create_unique_index_client_profile_user_id.sql

  CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_client_profile_user_id
    ON client_profile(user_id);

No comments inside the file. No transaction control statements. This file contains
only the CREATE UNIQUE INDEX CONCURRENTLY statement.

### Step 2 — Create: migrations/V27__create_unique_index_client_profile_user_id.sql.conf

  executeInTransaction=false

This sidecar file is placed in the same migrations/ directory alongside the .sql file.
The filename must match the .sql filename exactly, with .conf appended. Flyway reads
it automatically and executes V27 outside a transaction.

### Step 3 — Create: migrations/V28__add_unique_constraint_client_profile_user_id.sql

  -- Promotes the index created in V27 to a named constraint.
  -- This is a fast metadata operation; no table scan occurs.
  ALTER TABLE client_profile
    ADD CONSTRAINT uq_client_profile_user_id
    UNIQUE USING INDEX uq_client_profile_user_id;

This is a normal transactional migration. No .conf sidecar needed.

## Do not modify

- Any application source code
- Any existing migration file

## Verification

  docker compose run --rm flyway migrate
  # V27 and V28 must both show as Successfully applied

  docker compose exec db psql -U postgres -d postgres -c "
    SELECT conname, contype FROM pg_constraint
    WHERE conname = 'uq_client_profile_user_id';
  "
  # Must return one row with contype = 'u'

  docker compose exec db psql -U postgres -d postgres -c "
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'client_profile'
      AND indexname = 'uq_client_profile_user_id';
  "
  # Must return one row
```

---

## Prompt R1-C — Rename `app_user.bubble_user_id` → `subject_id`

```
You are working in a Node/Express API (ESM modules, api/ directory) with a
Flyway-managed PostgreSQL schema (migrations/ directory).

## Context

app_user.bubble_user_id is the external user identity token sent by the mobile client
on every request. The column is being renamed to subject_id to reflect its correct
architectural meaning (the OAuth/OIDC subject identifier). The rename is purely a
column name change — all values remain identical.

IMPORTANT: The request body parameter name `bubble_user_id` sent by the mobile client
is NOT changing in this prompt. The function readRequestedUserId() in userIdentity.js
reads `source?.bubble_user_id` from the request — this stays as-is. Only the DB column
name and the application SQL that references it as a column change.

This prompt must be deployed atomically: apply the Flyway migration, then start the
updated application. Do not run one without the other.

## Task

### 1. Add Flyway migration: migrations/V29__rename_app_user_bubble_user_id_to_subject_id.sql

  -- Rename the external user identity column. All values are preserved.
  -- Application code must be updated in the same release as this migration.
  ALTER TABLE app_user RENAME COLUMN bubble_user_id TO subject_id;

### 2. Update api/src/services/clientProfileService.js

In the upsertUser function, update the INSERT statement:
  FROM: INSERT INTO app_user (bubble_user_id) VALUES ($1) ON CONFLICT (bubble_user_id)
  TO:   INSERT INTO app_user (subject_id) VALUES ($1) ON CONFLICT (subject_id)

In the getProfileByUserId function, update the WHERE clause:
  FROM: WHERE au.bubble_user_id = $1
  TO:   WHERE au.subject_id = $1

### 3. Update api/src/utils/userIdentity.js

In the findInternalUserIdByExternalId function, update the WHERE clause:
  FROM: WHERE bubble_user_id = $1
  TO:   WHERE subject_id = $1

Do not change the readRequestedUserId function — it reads from the request body
(`source?.bubble_user_id`), not from the DB column. That line is intentionally
unchanged and will remain until the mobile client is updated.

### 4. Update api/src/routes/generateProgramV2.js

Find the inline INSERT INTO app_user statement (around line 199). Update it:
  FROM: INSERT INTO app_user (bubble_user_id) VALUES ($1) ON CONFLICT (bubble_user_id)
  TO:   INSERT INTO app_user (subject_id) VALUES ($1) ON CONFLICT (subject_id)

### 5. Update api/test/generateProgramV2.integration.test.js

In seedTestUser(), update the INSERT:
  FROM: INSERT INTO app_user (bubble_user_id) VALUES ($1) ON CONFLICT (bubble_user_id)
  TO:   INSERT INTO app_user (subject_id) VALUES ($1) ON CONFLICT (subject_id)

In cleanupTestUser(), update both statements that reference the column:
  FROM: SELECT id FROM app_user WHERE bubble_user_id = $1
  TO:   SELECT id FROM app_user WHERE subject_id = $1

  FROM: DELETE FROM app_user WHERE bubble_user_id = $1
  TO:   DELETE FROM app_user WHERE subject_id = $1

  FROM: WHERE au.bubble_user_id = $1
  TO:   WHERE au.subject_id = $1

### 6. Update api/src/routes/__tests__/validateExecutableSql.test.js

Find the test string: "UPDATE app_user SET bubble_user_id = 'hacked'"
Update to:           "UPDATE app_user SET subject_id = 'hacked'"

### 7. Check api/src/middleware/resolveUser.js

Verify this file contains no direct SQL reference to the bubble_user_id column.
It delegates to findInternalUserIdByExternalId() from userIdentity.js, which is
updated in step 3. If any direct column reference is found, update it to subject_id.

## Do not change

- The line `source?.bubble_user_id` in readRequestedUserId() in userIdentity.js
  — this is the request body parameter name, not the DB column
- Any other request body parameter names accepted from the mobile client
- Any existing migration file other than the new V29

## Verification

  docker compose run --rm flyway migrate
  # V29 must show as Successfully applied

  docker compose exec db psql -U postgres -d postgres -c "
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'app_user' AND column_name = 'subject_id';
  "
  # Must return one row

  grep -rn "bubble_user_id" api/src/ api/test/
  # Must return exactly one result:
  #   api/src/utils/userIdentity.js  →  source?.bubble_user_id
  # This is the request body field name intentionally retained for mobile client
  # compatibility. Any occurrence beyond this one is an error.

  cd api && npm test -- --test-concurrency=1
  # All tests must pass
```

---

## Prompt R2-A — Remove `bubble_client_profile_id` from service layer and schema

```
You are working in a Node/Express API (ESM modules, api/ directory) with a
Flyway-managed PostgreSQL schema (migrations/ directory).

## Prerequisites (must be complete before starting this prompt)

- R1-B is deployed: UNIQUE (user_id) constraint exists on client_profile
- R1-C is deployed: app_user column is named subject_id
- Confirmed: no mobile client consumer reads `bubble_client_profile_id` from
  any API response body

## Context

client_profile.bubble_client_profile_id is a redundant external identifier that
duplicates the user identity already expressed by user_id → app_user.subject_id.
It was the ON CONFLICT target for profile upsert and a dual-lookup key in profile
queries. With UNIQUE (user_id) now enforced, the user_id FK is the correct and
sufficient upsert target.

This prompt has two distinct deployment steps. Do not combine them into one commit
or one release. The sequence is:

  Step A: Application code change — remove all reads and writes of bubble_client_profile_id
  Step B: Manual verification gate — confirm the column is no longer written after Step A deploy
  Step C: Flyway migration — drop the column

Steps A and C are implemented in this prompt. Step B is a manual gate between them.

## Step A: Application code changes

### 1. api/src/services/clientProfileService.js

**upsertProfile function:** Replace entirely. The new version uses ON CONFLICT (user_id).
The second parameter `legacyProfileKey` is removed:

  async function upsertProfile(pgUserId) {
    const result = await db.query(
      `
      INSERT INTO client_profile (user_id)
      VALUES ($1)
      ON CONFLICT (user_id)
      DO NOTHING
      RETURNING id
      `,
      [pgUserId],
    );

    if (result.rowCount > 0) {
      return result.rows[0].id;
    }

    const selectResult = await db.query(
      `
      SELECT id
      FROM client_profile
      WHERE user_id = $1
      LIMIT 1
      `,
      [pgUserId],
    );

    return selectResult.rows[0]?.id ?? null;
  }

Update all call sites of upsertProfile — they must now pass only pgUserId (one argument).

**getProfileById function:** Remove the OR branch for bubble_client_profile_id:

  FROM: WHERE cp.id::text = $1 OR cp.bubble_client_profile_id = $1
  TO:   WHERE cp.id::text = $1

**patchProfile function:** Remove the OR branch:

  FROM: WHERE id::text = $${values.length} OR bubble_client_profile_id = $${values.length}
  TO:   WHERE id::text = $${values.length}

**toApiShape function:** Remove the fallback and the field entirely:

  FROM: id: row.id ?? row.bubble_client_profile_id,
  TO:   id: row.id,

Do not include bubble_client_profile_id as a returned field under any name.

### 2. api/src/routes/generateProgramV2.js

**Inline profile UPDATE SQL (around line 228):** Update the WHERE clause:

  FROM: WHERE id::text = $13 OR bubble_client_profile_id = $13
  TO:   WHERE id::text = $13

**upsertProfile call site:** Remove the second argument if it is being passed.
Match the updated single-argument signature from clientProfileService.js.

Verify that `bubble_client_profile_id` no longer appears in the request body
parsing block (it should have been removed in R1-A). If it is still present, remove it.

### 3. api/src/routes/debugAllowedExercises.js

Remove bubble_client_profile_id from the SELECT list:
  Remove the line selecting: bubble_client_profile_id

Remove bubble_client_profile_id from both places it appears in the response JSON:
  Remove: bubble_client_profile_id: profile.bubble_client_profile_id,
  (There are two such occurrences — remove both.)

### 4. api/src/services/buildInputsFromDevProfile.js

In the return value of buildInputsFromDevProfile(), remove from clientProfile.response:
  Remove: bubble_client_profile_id: devProfile?.id ?? null,

### 5. api/test/generateProgramV2.integration.test.js

**seedTestUser INSERT:** Remove bubble_client_profile_id from the column list and the
corresponding VALUES placeholder. Switch ON CONFLICT target to user_id:

  INSERT INTO client_profile (user_id, fitness_level_slug, main_goals_slugs,
    equipment_items_slugs, injury_flags, preferred_days, minutes_per_session)
  VALUES ($1, 'intermediate', ARRAY['strength'], ARRAY['barbell'],
          ARRAY[]::text[], ARRAY['mon','wed','fri'], 60)
  ON CONFLICT (user_id) DO NOTHING

**cleanupTestUser:** Remove the separate DELETE targeting bubble_client_profile_id:

  FROM: await db.query(
    `DELETE FROM client_profile WHERE bubble_client_profile_id = $1`,
    [TEST_BUBBLE_USER_ID]);
  TO:   (remove this line — client_profile rows are deleted by the app_user cascade)

## Step B: Manual verification gate (run after Step A is deployed, before Step C)

Before deploying Step A, record the baseline count:

  SELECT COUNT(*) AS baseline
  FROM client_profile
  WHERE bubble_client_profile_id IS NOT NULL;

Note the number. After Step A is deployed and the application has handled live traffic
for a period sufficient to cover normal usage patterns (at minimum, one full program
generation request), run the same query again:

  SELECT COUNT(*) AS after_deploy
  FROM client_profile
  WHERE bubble_client_profile_id IS NOT NULL;

The after_deploy count must be less than or equal to the baseline count. Any increase
means something is still writing to the column — investigate before proceeding to Step C.

Also confirm:

  grep -rn "bubble_client_profile_id" api/src/ api/test/
  # Must return zero results

## Step C: Flyway migration to drop the column

Create migrations/V30__drop_client_profile_bubble_client_profile_id.sql:

  -- bubble_client_profile_id was a legacy Bubble platform identifier.
  -- The UNIQUE (user_id) constraint (V27/V28) replaced it as the upsert target.
  -- All application code references were removed before this migration was applied.
  -- Step B baseline verification confirmed no new writes after the code change.
  ALTER TABLE client_profile DROP COLUMN IF EXISTS bubble_client_profile_id;

## Verification (after Step C)

  docker compose run --rm flyway migrate
  # V30 must show as Successfully applied

  docker compose exec db psql -U postgres -d postgres -c "
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'client_profile'
      AND column_name = 'bubble_client_profile_id';
  "
  # Must return zero rows

  cd api && npm test -- --test-concurrency=1
  # All tests must pass
```

---

## Prompt R2-B — Rename `equipment_items.bubble_id` → `external_id`

```
You are working in a Node/Express API (ESM modules, api/ directory) with a
Flyway-managed PostgreSQL schema (migrations/ directory).

## Context

equipment_items.bubble_id is a NOT NULL UNIQUE column that serves as the natural
key for equipment item rows. It was named for the Bubble platform, which is fully
deprecated. It is being renamed to external_id. All values are preserved — this
is a column rename only.

The column is referenced in:
- The Flyway repeatable seed migration (R__seed_equipment_items.sql) — updating
  this file changes its checksum, causing Flyway to re-run it on next migrate.
  This is intentional and safe because all inserts use ON CONFLICT DO UPDATE.
- The admin equipment list and create routes in adminExerciseCatalogue.js
- Smoke seed check queries in api/scripts/sql/smoke_seed_checks.sql

## Task

### 1. Add Flyway migration: migrations/V31__rename_equipment_items_bubble_id_to_external_id.sql

  -- Rename the legacy Bubble platform identifier to a neutral external_id.
  -- All values are preserved.
  ALTER TABLE equipment_items RENAME COLUMN bubble_id TO external_id;

### 2. Update migrations/R__seed_equipment_items.sql

Replace all occurrences of `bubble_id` throughout the file:
- In all INSERT column lists: bubble_id → external_id
- In the ON CONFLICT clause: ON CONFLICT (bubble_id) → ON CONFLICT (external_id)
- In the comment at the top of the file if it references bubble_id

### 3. Update api/src/routes/adminExerciseCatalogue.js

**Equipment list SELECT (around line 1239):**
  FROM: SELECT id, bubble_id, name, category, exercise_slug, ...
  TO:   SELECT id, external_id, name, category, exercise_slug, ...

**Equipment create (around lines 1256-1262):**
  FROM: const bubble_id = `admin_${Date.now()}`;
        (bubble_id, name, category, ...)
        [bubble_id, name, ...]
  TO:   const external_id = `admin_${Date.now()}`;
        (external_id, name, category, ...)
        [external_id, name, ...]

### 4. Update api/scripts/sql/smoke_seed_checks.sql

Replace all occurrences of `bubble_id` with `external_id`. There are references in:
- The COUNT check predicate (WHERE bubble_id LIKE 'seed_eq_%')
- The SELECT output column list
- The WHERE filter in the listing query

## Verification

  docker compose run --rm flyway migrate
  # V31 must show as Successfully applied
  # R__seed_equipment_items must show as re-applied (checksum changed)

  docker compose exec db psql -U postgres -d postgres -c "
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'equipment_items' AND column_name = 'external_id';
  "
  # Must return one row

  docker compose exec db psql -U postgres -d postgres -c "
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'equipment_items' AND column_name = 'bubble_id';
  "
  # Must return zero rows

  grep -rn "bubble_id" api/src/ api/scripts/ migrations/
  # Must return zero results

  cd api && npm test -- --test-concurrency=1
  # All tests must pass
```

---

## Prompt R2-C — Rename `buildInputsFromDevProfile.js` → `buildInputsFromProfile.js`

```
You are working in the api/ directory of a Node/Express workout engine (ESM modules).

## Prerequisites

R2-A must be complete. The bubble_client_profile_id reference inside
buildInputsFromDevProfile.js was removed as part of R2-A step 4. This prompt
handles the file rename and function rename only.

## Context

api/src/services/buildInputsFromDevProfile.js is a production input mapping module
for the program generation pipeline. The "Dev" in the name is a historical artifact.
It is production code and should be named to reflect that.

## Task

### 1. Rename the file

  api/src/services/buildInputsFromDevProfile.js
  → api/src/services/buildInputsFromProfile.js

### 2. Rename the exported function

  FROM: export function buildInputsFromDevProfile(devProfile, exerciseRows)
  TO:   export function buildInputsFromProfile(profile, exerciseRows)

Update all internal references to the parameter name from `devProfile` to `profile`.
There are approximately 10 occurrences within the function body
(devProfile?.preferredDays, devProfile?.equipmentItemCodes, devProfile?.fitnessLevel,
devProfile?.id, devProfile?.minutesPerSession, devProfile?.heightCm, devProfile?.weightKg,
devProfile?.equipmentPreset, devProfile?.goalNotes, devProfile?.scheduleConstraints).

### 3. Find and update all import sites

  grep -rn "buildInputsFromDevProfile" api/

Update each import to use the new path and function name:
  FROM: import { buildInputsFromDevProfile } from '...buildInputsFromDevProfile.js';
  TO:   import { buildInputsFromProfile } from '...buildInputsFromProfile.js';

Update each call site from buildInputsFromDevProfile(...) to buildInputsFromProfile(...).

### 4. Rename the internal helper mapExerciseRowsToBubbleResults

This unexported function has a Bubble reference in its name. Rename it:
  FROM: function mapExerciseRowsToBubbleResults(exerciseRows)
  TO:   function mapExerciseRowsToResults(exerciseRows)

Update the one call site inside the same file.

## Verification

  node --check api/src/services/buildInputsFromProfile.js
  # Must succeed

  grep -rn "buildInputsFromDevProfile\|DevProfile\|BubbleResults" api/src/ api/test/
  # Must return zero results

  cd api && npm test -- --test-concurrency=1
  # All tests must pass
```

---

## Prompt R2-D — Drop Bubble legacy columns from `client_profile`

**Requires stakeholder sign-off before execution. Do not run without explicit approval.**

```
You are working in the migrations/ directory of a Flyway-managed PostgreSQL schema.

## Prerequisites (all must be satisfied before running this prompt)

1. Stakeholder has confirmed: the CSV import workflow is permanently retired and
   will not be used for any future data recovery, migration, or onboarding scenario.
2. Stakeholder has confirmed: there is no compliance, legal, or recovery requirement
   to retain the original Bubble import metadata in the live database.
3. If data archival is required, the following export has been run and the output
   preserved before this migration is applied:

     COPY (
       SELECT id, bubble_creation_date, bubble_modified_date,
              bubble_user_raw, slug, creator
       FROM client_profile
       WHERE bubble_creation_date IS NOT NULL
          OR bubble_modified_date IS NOT NULL
          OR bubble_user_raw IS NOT NULL
     ) TO '/tmp/client_profile_bubble_archive.csv' CSV HEADER;

## Columns being dropped

From client_profile:
- bubble_creation_date  (timestamptz, nullable — Bubble export timestamp)
- bubble_modified_date  (timestamptz, nullable — Bubble export timestamp)
- bubble_user_raw       (text, nullable — raw user field from Bubble CSV)
- slug                  (text, nullable — Bubble export artifact, unreferenced in app code)
- creator               (text, nullable — Bubble export artifact, unreferenced in app code)

None of these columns are read or written by any application code. Verify with:

  grep -rn "bubble_creation_date\|bubble_modified_date\|bubble_user_raw\|\
\.slug\b\|\.creator\b" api/src/ api/test/
  # Must return zero results before proceeding

## Task

### 1. Create migration: migrations/V32__drop_client_profile_bubble_legacy_columns.sql

  -- Drop Bubble CSV import artifacts from client_profile.
  -- These columns were populated by importClientProfilesFromCsv.js (now retired)
  -- and are not referenced by any application code.
  -- Stakeholder sign-off obtained before this migration was written.
  ALTER TABLE client_profile
    DROP COLUMN IF EXISTS bubble_creation_date,
    DROP COLUMN IF EXISTS bubble_modified_date,
    DROP COLUMN IF EXISTS bubble_user_raw,
    DROP COLUMN IF EXISTS slug,
    DROP COLUMN IF EXISTS creator;

### 2. Mark api/scripts/importClientProfilesFromCsv.js as retired

Add the following comment block at the very top of the file, before any imports:

  // RETIRED — 2026
  // This script was used for a one-time Bubble CSV import.
  // The target columns (bubble_creation_date, bubble_modified_date, bubble_user_raw,
  // slug, creator) have been dropped from client_profile (V32).
  // Do not run this script. Retained for historical reference only.

Do not delete the file.

## Verification

  docker compose run --rm flyway migrate
  # V32 must show as Successfully applied

  docker compose exec db psql -U postgres -d postgres -c "
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'client_profile'
      AND column_name IN (
        'bubble_creation_date', 'bubble_modified_date',
        'bubble_user_raw', 'slug', 'creator'
      );
  "
  # Must return zero rows

  cd api && npm test -- --test-concurrency=1
  # All tests must pass
```
