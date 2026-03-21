# Codex Spec: Test Express 5 Async Error Forwarding

**Why:** Express 5 automatically forwards uncaught errors from async route handlers to the error
handler. This benefit is only realised if the final error handler in `server.js` uses the correct
4-argument signature `(err, req, res, next)` — which it does (lines 536–548). Without a test,
nothing in CI would catch a future regression where:
- Someone removes or incorrectly rewrites the global error handler
- Someone accidentally downgrades Express back to v4
- The error handler is moved after `app.listen()` and stops receiving errors

This test is the proof-of-wiring: it would have **failed** under Express 4 (request hangs or
process crashes), and **passes** under Express 5 with the current handler in place.

---

## Context for Codex

Read before starting:
- `api/server.js` lines 536–548 — the final generic error handler (shape to replicate in test)
- `api/src/utils/__tests__/mediaUrl.test.js` — the test style used in this project
  (`node:test` + `node:assert/strict`, no external test runner)
- `api/package.json` — confirms `"type": "module"` (ESM) and `"express": "^5.x.x"`

**Why a real HTTP request is necessary**

This cannot be tested with mock `req`/`res` objects. The behaviour being tested is Express 5's
internal async-route-to-error-handler plumbing. You must spin up a real Express app on a real
socket, throw an uncaught error from an async handler, and assert that the HTTP response is a
well-formed 500 — not a hang, not a crash.

**Port 0** — passing port `0` to `server.listen()` tells Node to assign a random available port.
Read it back from `server.address().port` after the listen callback fires. This avoids conflicts
with any other running service.

---

## Prompt 1 — Write the Test

Create `api/test/asyncErrorForwarding.test.js`.

The test must:
1. Build a **minimal, standalone Express app** — do NOT import `server.js` or `app` from anywhere.
   The test app mirrors only the relevant parts of `server.js`: one async throwing route + one
   4-argument error handler.
2. Start the server on port 0, make a real HTTP GET request using Node's built-in `node:http`
   module, assert the response, then close the server.
3. Cover three cases (see below).
4. Use only `node:test`, `node:assert/strict`, `node:http`, and `express` — no other imports.

### Helper to use in the test file

```js
function request(url) {
  return new Promise((resolve, reject) => {
    const http = await import("node:http"); // or top-level import
    http.get(url, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    }).on("error", reject);
  });
}
```

Write this as a regular top-level `import http from "node:http"` and a synchronous helper, not
using dynamic `import()`. The test file is ESM — top-level imports are fine.

### Helper to start / stop a server

```js
function startServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function stopServer(server) {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}
```

### Test cases

**Test 1: async handler without try/catch reaches the error handler**

```
name: "async route without try/catch — error reaches handler and returns 500"

app setup:
  - app.get("/throw", async (_req, _res) => { throw new Error("deliberate async error"); })
  - app.use((err, _req, res, _next) => {
      res.status(500).json({ ok: false, code: "internal_error", error: err.message });
    })

steps:
  1. start server on port 0
  2. GET http://127.0.0.1:{port}/throw
  3. assert response.status === 500
  4. assert response.body.ok === false
  5. assert response.body.code === "internal_error"
  6. assert response.body.error === "deliberate async error"
  7. stop server

key: this test would HANG under Express 4 (the async throw would not reach next(err) automatically)
```

**Test 2: async handler that rejects (returned rejected Promise) also reaches the error handler**

```
name: "async route that returns a rejected promise — error reaches handler and returns 500"

app setup:
  - app.get("/reject", async (_req, _res) => {
      await Promise.reject(new Error("rejected promise error"));
    })
  - same error handler as Test 1

steps:
  1. start server on port 0
  2. GET http://127.0.0.1:{port}/reject
  3. assert response.status === 500
  4. assert response.body.code === "internal_error"
  5. assert response.body.error === "rejected promise error"
  6. stop server
```

**Test 3: normal async handler that does NOT throw returns its own response unmodified**

```
name: "async route that resolves normally — error handler is not invoked"

app setup:
  - app.get("/ok", async (_req, res) => { res.status(200).json({ ok: true }); })
  - same error handler as Test 1

steps:
  1. start server on port 0
  2. GET http://127.0.0.1:{port}/ok
  3. assert response.status === 200
  4. assert response.body.ok === true
  5. stop server
```

### Implementation notes

- Each test gets its own app instance and its own server — do not share state between tests.
- Use `test("...", async (t) => { ... })` with `await` throughout.
- Always call `stopServer` in a `finally` block so the server is torn down even if an assertion
  fails:
  ```js
  const server = await startServer(app);
  try {
    const { status, body } = await request(`http://127.0.0.1:${server.address().port}/throw`);
    assert.equal(status, 500);
    // ...
  } finally {
    await stopServer(server);
  }
  ```

### Verification

```bash
node --test api/test/asyncErrorForwarding.test.js
```

All 3 tests must pass. Then run the full suite:
```bash
cd api && npm test -- --test-concurrency=1
```

All 172+ tests must pass (169 existing + 3 new).

---

## What this test is NOT doing

- It does not import `server.js` — that file calls `app.listen()` at module load time and requires
  a real database. This test uses its own isolated Express app.
- It does not test the exact `publicInternalError` sanitisation or `req.log` logging — those are
  covered by the existing unit tests for those utilities.
- It does not test rate limiting, auth, or any other middleware — just the async error forwarding
  wiring.
