# Codex Spec: Security Infrastructure Tests

**Why this matters:** The security phases added `requireInternalToken`, `requireTrustedAdminOrigin`,
`resolveBubbleUser`, `rateLimits.js`, `chains.js`, `requestLogger`, `logger`, `publicInternalError`,
`auditLog`, and `validateExecutableSql`. None have tests. Without them a future refactor can silently
remove the auth guard from a route — the exact bug that existed before Phase 1 — and CI stays green.

**Test framework already in use:** Node.js built-in `node:test` + `node:assert/strict`. No Jest. No
additional test dependencies are needed. Runner command: `node --test` (already in `package.json`).

Existing patterns to follow (read these before starting):
- `api/src/utils/__tests__/mediaUrl.test.js` — env save/restore in `try/finally`, pure unit style
- `api/test/historyPrograms.route.test.js` — `createMockRes()`, mock DB object passed to handler

---

## Prompt 1 — Minor Refactors for Testability

Three functions need small changes before they can be unit-tested without module-cache tricks or real
database connections. Make only the changes described — do not alter any other behaviour.

### 1a. Export `validateExecutableSql` from `adminExerciseCatalogue.js`

File: `api/src/routes/adminExerciseCatalogue.js`

Change the function declaration from:
```js
function validateExecutableSql(sql) {
```
to:
```js
export function validateExecutableSql(sql) {
```

That is the only change to this file. The function body and all call-sites are unchanged.

### 1b. Make `publicInternalError` testable without env manipulation

File: `api/src/utils/publicError.js`

Currently the module-level `const IS_PRODUCTION` bakes the value at import time, making it impossible
to test both branches in the same test run without module-cache invalidation.

Replace the current implementation with:
```js
export function publicInternalError(err, isProduction = process.env.NODE_ENV === "production") {
  if (!isProduction) {
    return err?.message || "Internal server error";
  }
  return "Internal server error";
}
```

Remove the `const IS_PRODUCTION` line entirely. The default parameter re-reads `process.env` at call
time (consistent) and tests can pass `true` or `false` explicitly to cover both branches.

### 1c. Make `resolveBubbleUser` accept an optional `db` parameter

File: `api/src/middleware/resolveUser.js`

Currently hardcodes `import { pool }` with no way to inject a mock. Change the function signature to
accept an optional `db` parameter (defaulting to the imported `pool`), following the same pattern as
`createHistoryProgramsHandler(db)` in `historyPrograms.js`.

Replace:
```js
export async function resolveBubbleUser(req, res, next) {
```
with:
```js
export function makeResolveBubbleUser(db = pool) {
  return async function resolveBubbleUser(req, res, next) {
```
Close the new outer function at the end of the file with `  };\n}`.

Also export a default instance for all existing call-sites:
```js
export const resolveBubbleUser = makeResolveBubbleUser();
```

No call-site in `chains.js` or anywhere else needs to change — they all import `resolveBubbleUser`
which is now the default instance. Tests use `makeResolveBubbleUser(mockDb)`.

### Verification for Prompt 1
- `node --check api/src/routes/adminExerciseCatalogue.js` passes
- `node --check api/src/utils/publicError.js` passes
- `node --check api/src/middleware/resolveUser.js` passes
- `grep -n "resolveBubbleUser" api/src/middleware/chains.js` — import still works (no changes needed)
- No changes to any test files in this prompt

---

## Prompt 2 — Write the Test Files

Create four test files. Each uses only `node:test` and `node:assert/strict`. No external dependencies.

Use this helper in every file that tests middleware:
```js
function mockReq(overrides = {}) {
  return {
    request_id: "test-req-id",
    headers: {},
    query: {},
    get(name) { return this.headers[name.toLowerCase()] ?? undefined; },
    log: { error() {}, warn() {}, debug() {}, info() {} },
    ...overrides,
  };
}

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json  = (body) => { res.body = body; return res; };
  res.set   = (k, v) => { res.headers[k] = v; return res; };
  res.on    = (event, fn) => { res._listeners = res._listeners ?? {}; res._listeners[event] = fn; return res; };
  res.emit  = (event) => { res._listeners?.[event]?.(); };
  return res;
}
```

---

### File 1: `api/src/middleware/__tests__/auth.test.js`

Tests for `requireInternalToken` and `requireTrustedAdminOrigin`.

**`requireInternalToken` test cases:**

```
"valid INTERNAL_API_TOKEN passes"
  env: INTERNAL_API_TOKEN=secret-token-16ch, ENGINE_KEY unset
  req headers: x-internal-token: secret-token-16ch
  → next() called, res.statusCode === 200 (unchanged)

"valid ENGINE_KEY passes"
  env: ENGINE_KEY=engine-key-16chars, INTERNAL_API_TOKEN unset
  req headers: x-engine-key: engine-key-16chars
  → next() called

"wrong token returns 401"
  env: INTERNAL_API_TOKEN=correct-token-here, ENGINE_KEY unset
  req headers: x-internal-token: wrong-token-value
  → res.statusCode === 401, res.body.code === "unauthorized"

"missing token header returns 401"
  env: INTERNAL_API_TOKEN=correct-token-here
  req headers: (none)
  → res.statusCode === 401

"neither env var configured rejects all requests (fail-safe)"
  env: INTERNAL_API_TOKEN unset, ENGINE_KEY unset
  req headers: x-internal-token: anything
  → res.statusCode === 401, res.body.error includes "not configured"

"empty string token is rejected even if env matches empty (fail-safe)"
  env: INTERNAL_API_TOKEN="" (empty string)
  req headers: x-internal-token: ""
  → res.statusCode === 401 (engineConfigured also false → fail-safe path)
```

For each test: save env vars before the test, restore them in a `finally` block.

**`requireTrustedAdminOrigin` test cases:**

```
"GET request passes without Origin check"
  req: method=GET, headers: origin=https://evil.com
  → next() called

"POST without Origin header passes (non-browser request)"
  req: method=POST, headers: (no origin)
  → next() called

"POST with matching Origin passes"
  req: method=POST, headers: origin=http://localhost:3000, host=localhost:3000
  req.protocol = "http"
  → next() called

"POST with non-matching Origin returns 403"
  req: method=POST, headers: origin=https://attacker.com, host=localhost:3000
  req.protocol = "http"
  → res.statusCode === 403, res.body.code === "forbidden_origin"

"POST with ADMIN_ALLOWED_ORIGIN env matching passes"
  env: ADMIN_ALLOWED_ORIGIN=https://app.example.com
  req: method=POST, headers: origin=https://app.example.com, host=someother.host
  → next() called

"x-forwarded-proto used when present"
  req: method=POST
    headers: origin=https://myapp.fly.dev, host=myapp.fly.dev, x-forwarded-proto=https
  → next() called
```

Note: `requireTrustedAdminOrigin` calls `req.get(headerName)` — the `mockReq.get()` helper reads from
`req.headers` by lowercased key, which covers this.

---

### File 2: `api/src/middleware/__tests__/resolveUser.test.js`

Tests for `makeResolveBubbleUser` (from Prompt 1 refactor).

```
"missing bubble_user_id returns 401"
  req: query = {} (no bubble_user_id)
  → res.statusCode === 401, res.body.code === "unauthorized"

"empty string bubble_user_id returns 401"
  req: query = { bubble_user_id: "  " }
  → res.statusCode === 401

"unknown bubble_user_id returns 401"
  mockDb: query() returns { rowCount: 0, rows: [] }
  req: query = { bubble_user_id: "unknown-user" }
  → res.statusCode === 401, res.body.error matches "not found"

"known bubble_user_id sets req.auth.user_id and calls next()"
  mockDb: query() returns { rowCount: 1, rows: [{ id: "pg-uuid-here" }] }
  req: query = { bubble_user_id: "bubble-123" }
  → next() called, req.auth.user_id === "pg-uuid-here"

"DB error returns 500"
  mockDb: query() throws new Error("connection refused")
  req: query = { bubble_user_id: "bubble-123" }
  → res.statusCode === 500, res.body.code === "internal_error"
```

Construct the middleware with `makeResolveBubbleUser(mockDb)`. The `mockDb` is a plain object:
```js
const mockDb = { async query(_sql, _params) { return { rowCount: 1, rows: [{ id: "pg-uuid" }] }; } };
```

---

### File 3: `api/src/utils/__tests__/publicError.test.js`

Tests for `publicInternalError` (after Prompt 1 refactor).

```
"dev mode — returns err.message"
  call: publicInternalError(new Error("something broke"), false)
  → result === "something broke"

"dev mode — returns fallback when err has no message"
  call: publicInternalError({}, false)
  → result === "Internal server error"

"dev mode — returns fallback for null err"
  call: publicInternalError(null, false)
  → result === "Internal server error"

"production mode — always returns generic string"
  call: publicInternalError(new Error("detailed db error"), true)
  → result === "Internal server error"

"production mode — same generic string for null err"
  call: publicInternalError(null, true)
  → result === "Internal server error"
```

No env manipulation needed — `isProduction` is passed explicitly.

---

### File 4: `api/src/routes/__tests__/validateExecutableSql.test.js`

Tests for the exported `validateExecutableSql` from `adminExerciseCatalogue.js`.

```
// ALLOWED — must return { ok: true }
"INSERT INTO exercise_catalogue is allowed"
  sql: "INSERT INTO exercise_catalogue (exercise_id) VALUES ('x')"
  → { ok: true }

"UPDATE exercise_catalogue is allowed"
  sql: "UPDATE exercise_catalogue SET name = 'foo' WHERE exercise_id = 'x'"
  → { ok: true }

"DELETE FROM exercise_catalogue is allowed"
  sql: "DELETE FROM exercise_catalogue WHERE exercise_id = 'x'"
  → { ok: true }

"trailing semicolon is stripped and allowed"
  sql: "DELETE FROM exercise_catalogue WHERE exercise_id = 'x';"
  → { ok: true }

// BLOCKED — must return { ok: false } with a non-empty error string
"empty string is rejected"
  sql: ""
  → { ok: false, error: non-empty string }

"DROP TABLE is blocked"
  sql: "DROP TABLE exercise_catalogue"
  → { ok: false }

"TRUNCATE is blocked"
  sql: "TRUNCATE exercise_catalogue"
  → { ok: false }

"GRANT is blocked"
  sql: "GRANT ALL ON exercise_catalogue TO public"
  → { ok: false }

"REVOKE is blocked"
  sql: "REVOKE ALL ON exercise_catalogue FROM public"
  → { ok: false }

"COPY is blocked"
  sql: "COPY exercise_catalogue FROM '/tmp/evil'"
  → { ok: false }

"inline comment (--) is blocked"
  sql: "DELETE FROM exercise_catalogue WHERE exercise_id = 'x' -- injected"
  → { ok: false }

"block comment is blocked"
  sql: "DELETE FROM exercise_catalogue /* comment */ WHERE exercise_id = 'x'"
  → { ok: false }

"multi-statement (semicolon in middle) is blocked"
  sql: "DELETE FROM exercise_catalogue WHERE exercise_id = 'x'; DROP TABLE users"
  → { ok: false }

"INSERT on a different table is blocked"
  sql: "INSERT INTO users (id) VALUES ('admin')"
  → { ok: false }

"UPDATE on a different table is blocked"
  sql: "UPDATE app_user SET bubble_user_id = 'hacked'"
  → { ok: false }

"SELECT is blocked"
  sql: "SELECT * FROM exercise_catalogue"
  → { ok: false }
```

---

### File 5: `api/src/middleware/__tests__/requestLogger.test.js`

Tests for `requestLogger`.

```
"attaches req.log as a child logger with request_id"
  req: request_id = "req-abc-123", (no existing log)
  call requestLogger(req, res, next)
  → next() called
  → req.log is an object with methods (info, warn, error, debug)
  → (req.log is the logger child — verify it exists, not the full pino API)

"logs http.request.finish on res finish event with correct status and duration"
  req: request_id = "req-abc", method = "GET", url = "/health"
  res: statusCode = 200
  captured = []
  Override req.log so it records calls: req.log = { info(obj) { captured.push({level:"info",...obj}); }, ... }
  call requestLogger(req, res, next)
  trigger res.emit("finish")
  → captured has one entry
  → captured[0].event === "http.request.finish"
  → captured[0].status_code === 200
  → typeof captured[0].duration_ms === "number"

"uses warn level for 4xx responses"
  res.statusCode = 404
  → captured[0] logged at level "warn"

"uses error level for 5xx responses"
  res.statusCode = 500
  → captured[0] logged at level "error"
```

For the `requestLogger` tests, the challenge is that `requestLogger` calls `logger.child(...)` from
the singleton pino instance. Rather than mocking pino, just verify the structural contract:
- After `requestLogger` runs, `req.log` is truthy and has `info`, `warn`, `error`, `debug` methods.
- For the finish event level tests: spy on the child logger by replacing `req.log` after
  `requestLogger` runs (the finish handler closes over `req.log`, which is set synchronously):

```js
// After calling requestLogger(req, res, next), replace req.log with a spy:
const calls = [];
req.log = {
  info:  (obj) => calls.push({ level: "info",  ...obj }),
  warn:  (obj) => calls.push({ level: "warn",  ...obj }),
  error: (obj) => calls.push({ level: "error", ...obj }),
  debug: (obj) => calls.push({ level: "debug", ...obj }),
};
res.statusCode = 404;
res.emit("finish");
assert.equal(calls[0].level, "warn");
assert.equal(calls[0].event, "http.request.finish");
```

---

### Verification for Prompt 2

After creating the files, run:
```bash
node --test api/src/middleware/__tests__/auth.test.js
node --test api/src/middleware/__tests__/resolveUser.test.js
node --test api/src/utils/__tests__/publicError.test.js
node --test api/src/routes/__tests__/validateExecutableSql.test.js
node --test api/src/middleware/__tests__/requestLogger.test.js
```

All tests must pass. Then run the full suite:
```bash
node --test
```
All pre-existing tests must also continue to pass (the Prompt 1 refactors are backward-compatible).

**Expected final count:** 5 new test files, ~35 new test cases, zero pre-existing test regressions.

---

## What Is NOT in Scope

- `auditLog.js` — it calls `pool.query` which requires a DB connection. Integration-test coverage is
  sufficient; a unit test that mocks `pool` adds low value here.
- `rateLimits.js` — express-rate-limit behaviour is well-tested upstream; covering the config values
  in a unit test is low value.
- `chains.js` — it is a pure re-export of middleware; the individual middleware are tested above.
- `logger.js` — pino itself is tested upstream; the singleton config (redaction, transport) is
  validated by the requestLogger tests passing.
- End-to-end HTTP route tests for auth — the unit tests above cover the middleware directly, which
  is higher signal than spinning up an Express server in CI.
