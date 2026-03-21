# Codex Spec: generate-plan-v2 Smoke Test

**Why:** `POST /generate-plan-v2` is the core product route. It was just migrated from an
in-memory Map lookup (`dev_user_id`) to a real Postgres profile fetch
(`getProfileByBubbleUserId`). The new path — `bubble_user_id` → DB profile → pipeline → response
— has no automated test. A broken profile lookup would fail every generation silently until a
real user hits it.

**Test strategy:** Extract the handler into a testable factory function; then write unit tests for
the validation/early-exit paths using mocks, and one integration test for the happy path using a
real DB connection and a stubbed pipeline.

---

## Context for Codex

Read before starting:
- `api/src/routes/generateProgramV2.js` — full source
- `api/src/routes/historyPrograms.js` — pattern for `createHistoryProgramsHandler(pool)`
- `api/test/runPipeline.repRules.integration.test.js` — pattern for real-DB integration tests
- `api/src/services/clientProfileService.js` — `getProfileByBubbleUserId` used in the route

The route currently has these early-exit paths that are easily unit-tested without a real DB:
1. Missing `bubble_user_id` → 400
2. Invalid `anchor_date_ms` → 400
3. Profile not found (`getProfileByBubbleUserId` returns null) → 404

The happy path requires:
- A real `app_user` + `client_profile` row in the DB
- `runPipeline` stubbed to return a minimal valid result (avoids the multi-second pipeline run)

---

## Prompt 1 — Extract Handler Factory

Open `api/src/routes/generateProgramV2.js`.

The route is currently registered as:
```js
generateProgramV2Router.post("/generate-plan-v2", requireInternalToken, async (req, res) => {
  // ... all logic inline
});
```

Extract the async handler body into an exported factory function. The router registration stays,
but delegates to the factory:

```js
export function createGenerateProgramV2Handler({
  db = pool,
  getProfile = getProfileByBubbleUserId,
  pipeline = runPipeline,
  getAllowed = getAllowedExerciseIds,
  buildInputs = buildInputsFromDevProfile,
  ensureCalendar = ensureProgramCalendarCoverage,
  emitPayload = importEmitterPayload,
} = {}) {
  return async function generateProgramV2Handler(req, res) {
    // entire current handler body, replacing:
    //   pool          → db
    //   getProfileByBubbleUserId → getProfile
    //   runPipeline   → pipeline
    //   getAllowedExerciseIds → getAllowed
    //   buildInputsFromDevProfile → buildInputs
    //   ensureProgramCalendarCoverage → ensureCalendar
    //   importEmitterPayload → emitPayload
  };
}
```

Update the router registration to use the factory with default deps:
```js
generateProgramV2Router.post(
  "/generate-plan-v2",
  requireInternalToken,
  createGenerateProgramV2Handler(),
);
```

Also: the module-level `let cachedInjuryColumn = null` cache will need to be inside the factory
(or remain module-level — either is acceptable, but note that tests will share the cache if it
stays module-level). Moving it inside the factory is cleaner for test isolation:
```js
export function createGenerateProgramV2Handler({ ... } = {}) {
  let cachedInjuryColumn = null;  // moved inside
  // resolveInjuryColumn closure captures cachedInjuryColumn
  async function resolveInjuryColumn(client) { ... }
  return async function generateProgramV2Handler(req, res) { ... };
}
```

### Verification for Prompt 1
```bash
node --check api/src/routes/generateProgramV2.js
cd api && npm test -- --test-concurrency=1
# All existing tests must pass — no behaviour change
```

---

## Prompt 2 — Unit Tests (validation / early-exit paths)

Create `api/test/generateProgramV2.route.test.js`.

These tests use mock deps only — no real DB, no pipeline run.

### Helpers

```js
function mockReq(body = {}, overrides = {}) {
  return {
    request_id: "test-req",
    body,
    log: { info() {}, debug() {}, warn() {}, error() {} },
    ...overrides,
  };
}

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
```

### Test cases

```
"missing bubble_user_id returns 400"
  handler = createGenerateProgramV2Handler({ getProfile: async () => null })
  req = mockReq({ anchor_date_ms: Date.now() })  // no bubble_user_id
  → res.statusCode === 400
  → res.body.code === "validation_error"
  → res.body.error matches /bubble_user_id/i

"non-finite anchor_date_ms returns 400"
  req = mockReq({ bubble_user_id: "buid-1", anchor_date_ms: "not-a-number" })
  → res.statusCode === 400
  → res.body.code === "validation_error"

"null anchor_date_ms is accepted (defaults to Date.now())"
  getProfile returns a valid profile object (see minimal profile below)
  pipeline = async () => ({ /* minimal valid pipeline result */ })
  db.connect() returns a mock setupClient that handles all queries
  req = mockReq({ bubble_user_id: "buid-1" })  // no anchor_date_ms
  → does NOT return 400 for anchor validation

"profile not found returns 404"
  handler = createGenerateProgramV2Handler({ getProfile: async () => null })
  req = mockReq({ bubble_user_id: "buid-unknown", anchor_date_ms: Date.now() })
  → res.statusCode === 404
  → res.body.code === "not_found"
```

For the "null anchor" test, if setting up the full mock DB chain is complex, it is acceptable to
just assert `res.statusCode !== 400` (i.e. passed validation). The test for the full flow is
covered by the integration test in Prompt 3.

**Minimal profile object** for mock `getProfile`:
```js
const minimalProfile = {
  id: "buid-test",
  goals: ["strength"],
  fitnessLevel: "intermediate",
  injuryFlags: [],
  goalNotes: "",
  equipmentPreset: "commercial_gym",
  equipmentItemCodes: ["barbell"],
  preferredDays: ["mon", "wed", "fri"],
  scheduleConstraints: "",
  heightCm: null,
  weightKg: null,
  minutesPerSession: 60,
  sex: null,
  ageRange: null,
  onboardingStepCompleted: 5,
  onboardingCompletedAt: null,
  programType: "strength",
};
```

### Verification for Prompt 2
```bash
node --test api/test/generateProgramV2.route.test.js
cd api && npm test -- --test-concurrency=1
```

---

## Prompt 3 — Integration Smoke Test (real DB, stubbed pipeline)

Add `api/test/generateProgramV2.integration.test.js`.

This test runs against the real test database (same as `runPipeline.repRules.integration.test.js`).
It seeds a minimal `app_user` + `client_profile`, calls the handler with a stubbed pipeline, and
asserts the response shape.

Read `api/test/runPipeline.repRules.integration.test.js` to understand the DB connection pattern
before writing this test.

### Test structure

```js
import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { createGenerateProgramV2Handler } from "../src/routes/generateProgramV2.js";

const TEST_BUBBLE_USER_ID = `smoke-test-user-${Date.now()}`;

// Minimal stub pipeline result — just enough to pass the emitter and response phases
const STUB_PIPELINE_RESULT = {
  ok: true,
  program: {
    id: "stub-program-id",
    title: "Stub Program",
    weeks: [],
    days: [],
    days_per_week: 3,
    duration_mins: 60,
    program_type: "strength",
  },
};

function stubPipeline() {
  return async () => STUB_PIPELINE_RESULT;
}
```

**Setup / teardown:**
- Before the test: insert `app_user` + `client_profile` rows using the `TEST_BUBBLE_USER_ID`
- After the test: delete those rows by `bubble_user_id` (in a `finally` block)

```js
async function seedTestUser(db) {
  const userResult = await db.query(
    `INSERT INTO app_user (bubble_user_id) VALUES ($1)
     ON CONFLICT (bubble_user_id) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [TEST_BUBBLE_USER_ID],
  );
  const pgUserId = userResult.rows[0].id;

  await db.query(
    `INSERT INTO client_profile (user_id, bubble_client_profile_id,
       fitness_level_slug, main_goals_slugs, equipment_items_slugs,
       injury_flags, preferred_days, minutes_per_session)
     VALUES ($1, $2, 'intermediate', ARRAY['strength'], ARRAY['barbell'],
             ARRAY[]::text[], ARRAY['mon','wed','fri'], 60)
     ON CONFLICT (bubble_client_profile_id) DO NOTHING`,
    [pgUserId, TEST_BUBBLE_USER_ID],
  );
}

async function cleanupTestUser(db) {
  await db.query(
    `DELETE FROM app_user WHERE bubble_user_id = $1`,
    [TEST_BUBBLE_USER_ID],
  );
}
```

**The smoke test:**

```
"generate-plan-v2: profile found → pipeline called → 200 response with program"

  setup: seedTestUser(pool)

  handler = createGenerateProgramV2Handler({
    db: pool,
    pipeline: stubPipeline(),
    // all other deps use their real defaults
  })

  req = {
    request_id: "smoke-test-req",
    body: {
      bubble_user_id: TEST_BUBBLE_USER_ID,
      anchor_date_ms: Date.now(),
      programType: "strength",
    },
    log: { info() {}, debug() {}, warn() {}, error() {} },
  }
  res = mockRes()

  await handler(req, res)

  → res.statusCode === 200 or 201
  → res.body.ok === true  (or res.body has a program property)

  teardown: cleanupTestUser(pool) in finally
```

**Important:** The stub pipeline must return a shape that the rest of the handler (phases 3–6 in
generateProgramV2.js: emitter, calendar coverage, generation_run update, response) can process
without crashing. Read the code after `const pipelineResult = await pipeline(...)` to understand
what fields are accessed on the result. If the stub result causes downstream errors, expand
`STUB_PIPELINE_RESULT` to include those fields — do not change the production code to accommodate
the test.

If the integration test is not feasible to complete in this prompt due to the pipeline stub
complexity, a passing test that verifies `res.statusCode !== 404` (proving the profile was
found in the DB) is acceptable as a first step.

### Verification for Prompt 3
```bash
node --test api/test/generateProgramV2.integration.test.js
cd api && npm test -- --test-concurrency=1
```
