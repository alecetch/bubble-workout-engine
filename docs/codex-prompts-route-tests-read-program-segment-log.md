# Codex Spec: readProgram + segmentLog Route Tests

**Why:** `GET /program/:id/overview`, `GET /day/:id/full`, and `PATCH /day/:id/complete`
are the routes the mobile app calls after program generation to render the workout
interface. `POST /segment-log` is called on every set logged during a workout. None have
automated tests. A SQL column rename in the program or exercise tables would cause blank
screens or silent data loss with no CI signal.

`segmentLog.js` also contains an inline 1RM formula (Epley/Brzycki) that currently has zero
test coverage. A bug there silently corrupts every strength metric logged.

---

## Context for Codex

Read before starting:
- `api/src/routes/readProgram.js` — three handlers, all use `pool.connect()`
- `api/src/routes/segmentLog.js` — two handlers (GET + POST), 1RM formula inline
- `api/test/historyPrograms.route.test.js` — factory + mock DB pattern to follow
- `api/src/routes/generateProgramV2.js` — `createGenerateProgramV2Handler(deps)` factory
  pattern to follow for the `pool.connect()` style

---

## Prompt 1 — Refactor `readProgram.js` for testability

**Step 1: Export pure helpers**

Add `export` to `parseEquipmentSlugs` and `segmentTypeLabel` so tests can reach them:
```js
export function parseEquipmentSlugs(rows) { ... }
export function segmentTypeLabel(segment_type) { ... }
```

**Step 2: Wrap handlers in a factory**

```js
export function createReadProgramHandlers(db = pool) {
  // Move resolveUserId inside the factory (it uses db)
  async function resolveUserId(client, query) { /* unchanged */ }

  async function programOverview(req, res) {
    // existing GET /program/:program_id/overview body
    // replace all `pool.connect()` with `db.connect()`
  }

  async function dayFull(req, res) {
    // existing GET /day/:program_day_id/full body
    // replace pool.connect() → db.connect()
  }

  async function dayComplete(req, res) {
    // existing PATCH /day/:program_day_id/complete body
    // replace pool.connect() → db.connect()
  }

  return { programOverview, dayFull, dayComplete };
}
```

**Step 3: Update route registrations**

```js
const handlers = createReadProgramHandlers();
readProgramRouter.get("/program/:program_id/overview", handlers.programOverview);
readProgramRouter.get("/day/:program_day_id/full", handlers.dayFull);
readProgramRouter.patch("/day/:program_day_id/complete", handlers.dayComplete);
```

### Verification for Prompt 1
```bash
node --check api/src/routes/readProgram.js
cd api && npm test -- --test-concurrency=1
# All existing tests pass — no behaviour change
```

---

## Prompt 2 — Write `readProgram.route.test.js`

Create `api/test/readProgram.route.test.js`.

### Mock helpers

```js
function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

// Pool mock: returns a client whose query() answers calls in order.
function mockPool(responses) {
  let i = 0;
  return {
    async connect() {
      return {
        async query(_sql, _params) {
          const r = responses[i++];
          if (!r) throw new Error(`Unexpected DB call at index ${i - 1}`);
          if (r instanceof Error) throw r;
          return r;
        },
        release() {},
      };
    },
  };
}

const VALID_UUID = "11111111-1111-1111-1111-111111111111";
const USER_UUID  = "22222222-2222-2222-2222-222222222222";
```

### `parseEquipmentSlugs` — pure, import directly

```
"returns empty array for empty rows"
  parseEquipmentSlugs([]) deep-equals []

"parses comma-separated slugs"
  parseEquipmentSlugs([{ equipment_items_slugs_csv: "barbell,dumbbells" }])
  → ["barbell", "dumbbells"]

"deduplicates slugs across rows"
  parseEquipmentSlugs([
    { equipment_items_slugs_csv: "barbell,dumbbells" },
    { equipment_items_slugs_csv: "barbell,kettlebell" },
  ])
  → ["barbell", "dumbbells", "kettlebell"]  // barbell only once

"ignores empty csv values"
  parseEquipmentSlugs([{ equipment_items_slugs_csv: "" }]) deep-equals []
```

### `segmentTypeLabel` — pure

```
"maps known segment types to labels"
  segmentTypeLabel("single")    === "Single"
  segmentTypeLabel("superset")  === "Superset"
  segmentTypeLabel("giant_set") === "Giant Set"
  segmentTypeLabel("amrap")     === "AMRAP"
  segmentTypeLabel("emom")      === "EMOM"

"returns unknown type as-is"
  segmentTypeLabel("custom_type") === "custom_type"
```

### `programOverview` handler — validation early-exits

For these tests, use `req.query.user_id = USER_UUID` to skip the user-lookup DB call.

```
"non-UUID program_id returns 400"
  handlers = createReadProgramHandlers(mockPool([]))
  req = { request_id: "t", params: { program_id: "not-a-uuid" },
          query: { user_id: USER_UUID }, log: { error(){} } }
  → res.statusCode === 400
  → res.body.code === "validation_error"

"non-UUID selected_program_day_id returns 400"
  req = { params: { program_id: VALID_UUID },
          query: { user_id: USER_UUID, selected_program_day_id: "bad-uuid" }, ... }
  → res.statusCode === 400

"program not found returns 404"
  pool returns rowCount: 0 for the first program query
  req = { params: { program_id: VALID_UUID }, query: { user_id: USER_UUID }, ... }
  → res.statusCode === 404
  → res.body.code === "not_found"
```

### `dayFull` handler — validation early-exits

```
"non-UUID program_day_id returns 400"
  req = { params: { program_day_id: "bad" }, query: { user_id: USER_UUID }, ... }
  → res.statusCode === 400

"day not found returns 404"
  pool returns rowCount: 0 for the day query
  → res.statusCode === 404
  → res.body.code === "not_found"
```

### `dayComplete` handler — validation early-exits

```
"non-UUID program_day_id returns 400"
  → res.statusCode === 400

"day not found or access denied returns 404"
  pool returns rowCount: 0 for UPDATE RETURNING
  → res.statusCode === 404
```

### Verification for Prompt 2
```bash
node --check api/test/readProgram.route.test.js
cd api && npm test -- --test-concurrency=1
```

---

## Prompt 3 — Refactor `segmentLog.js` for testability

**Step 1: Extract 1RM calculation as an exported pure function**

The inline computation inside `POST /segment-log` is business logic with no test coverage.
Extract it before the DB work:

```js
/**
 * Compute estimated 1RM in kg.
 * Uses Brzycki formula for lower-body exercises (more accurate for heavy rep ranges),
 * Epley for upper/unknown.
 * Returns null when inputs are invalid (zero weight, zero reps, non-finite values).
 */
export function compute1rmKg(weightKg, repsCompleted, region) {
  if (
    !Number.isFinite(weightKg) ||
    !Number.isFinite(repsCompleted) ||
    weightKg <= 0 ||
    repsCompleted < 1
  ) {
    return null;
  }
  const epley = weightKg * (1 + repsCompleted / 30);
  if (region === "lower" && repsCompleted < 37) {
    return Number(((weightKg * 36) / (37 - repsCompleted)).toFixed(2));
  }
  return Number(epley.toFixed(2));
}
```

Update the `POST /segment-log` handler to call `compute1rmKg(weightKg, repsCompleted, region)`
instead of the inline block.

**Step 2: Wrap handlers in a factory**

```js
export function createSegmentLogHandlers(db = pool) {
  async function resolveUserId(client, query) { /* same as existing */ }

  async function getSegmentLog(req, res) {
    // existing GET /segment-log body, pool.connect() → db.connect()
  }

  async function postSegmentLog(req, res) {
    // existing POST /segment-log body, pool.connect() → db.connect()
    // uses compute1rmKg(weightKg, repsCompleted, region)
  }

  return { getSegmentLog, postSegmentLog };
}
```

**Step 3: Update route registrations**

```js
const handlers = createSegmentLogHandlers();
segmentLogRouter.get("/segment-log", handlers.getSegmentLog);
segmentLogRouter.post("/segment-log", handlers.postSegmentLog);
```

### Verification for Prompt 3
```bash
node --check api/src/routes/segmentLog.js
cd api && npm test -- --test-concurrency=1
```

---

## Prompt 4 — Write `segmentLog.route.test.js`

Create `api/test/segmentLog.route.test.js`.

Reuse the `mockRes()` and `mockPool()` pattern from `readProgram.route.test.js`.

### `compute1rmKg` — pure function, no mock needed

```
"returns null for weight=0"
  compute1rmKg(0, 5, null) === null

"returns null for reps=0"
  compute1rmKg(100, 0, null) === null

"returns null for non-finite inputs"
  compute1rmKg(NaN, 5, null) === null
  compute1rmKg(100, Infinity, null) === null

"uses Epley formula for upper/unknown region"
  // Epley: weight * (1 + reps / 30)
  result = compute1rmKg(100, 10, null)
  expected = Number((100 * (1 + 10 / 30)).toFixed(2))
  → assert.equal(result, expected)  // 133.33

"uses Epley for lower region when reps >= 37"
  result = compute1rmKg(100, 37, "lower")
  expected = Number((100 * (1 + 37 / 30)).toFixed(2))
  → assert.equal(result, expected)

"uses Brzycki formula for lower region when reps < 37"
  // Brzycki: (weight * 36) / (37 - reps)
  result = compute1rmKg(100, 5, "lower")
  expected = Number(((100 * 36) / (37 - 5)).toFixed(2))
  → assert.equal(result, expected)  // 112.5

"returns consistent precision (2 decimal places)"
  result = compute1rmKg(80, 8, null)
  → String(result).split(".")[1].length <= 2
```

### `postSegmentLog` handler — validation early-exits

```
"missing program_id returns 400"
  req = { request_id: "t",
          body: { program_day_id: VALID_UUID, workout_segment_id: VALID_UUID,
                  rows: [{ program_exercise_id: VALID_UUID }] },
          log: { error(){} } }
  → res.statusCode === 400
  → res.body.code === "validation_error"

"missing workout_segment_id returns 400"
  → res.statusCode === 400

"missing program_day_id returns 400"
  → res.statusCode === 400

"empty rows array returns 400"
  req.body.rows = []
  → res.statusCode === 400
  → res.body.error matches /rows/i

"non-UUID program_exercise_id in rows returns 400"
  req.body.rows = [{ program_exercise_id: "bad" }]
  → res.statusCode === 400

"missing user identity returns 400"
  body includes all valid UUIDs but no user_id or bubble_user_id
  → res.statusCode === 400
```

### `getSegmentLog` handler — validation early-exits

```
"missing workout_segment_id returns 400"
  → res.statusCode === 400

"missing program_day_id returns 400"
  → res.statusCode === 400

"non-UUID workout_segment_id returns 400"
  → res.statusCode === 400
```

### Verification for Prompt 4
```bash
node --check api/test/segmentLog.route.test.js
cd api && npm test -- --test-concurrency=1
# All tests pass — target: 270+ passing, 0 failing
```
