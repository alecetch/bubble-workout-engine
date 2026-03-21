# Codex Spec: Upgrade Express v4 → v5

**Why:** Express 5 has been stable since late 2024. Key benefit for this codebase: async route
handlers that throw or reject now automatically propagate to the error handler — no more silent
swallowing of errors if someone writes `async (req, res) => { doSomething() }` without a catch.
Express 4 will eventually stop receiving security patches.

**Scope:** One command, one file change, one verification run. No application code needs to change.

---

## Pre-upgrade compatibility check

This codebase has been audited against the Express 5 breaking change list. All items are clean:

| Breaking change | Status |
|-----------------|--------|
| Wildcard `*` routes (path-to-regexp v8 is stricter) | None in codebase |
| `app.del()` removed (use `app.delete()`) | Not used |
| `res.send(statusCode)` removed (use `res.sendStatus()`) | Not used — all routes use `res.status(n).json(...)` |
| `app.param()` / `router.param()` callback signature changed | Not used |
| `req.path` stripping mount prefix | Not relied on |
| `next("router")` / `next("route")` behaviour | Not used |

Third-party package compatibility:
- `express-rate-limit@8.3.1` — supports Express 5 ✓
- `helmet@8.1.0` — supports Express 5 ✓
- No other packages have direct Express peer dependencies

---

## Prompt 1 — Install and Verify

### Task

1. In the `api/` directory, run:
   ```bash
   npm install express@5
   ```
   This updates `express` in both `node_modules/` and `package.json`. Confirm `package.json`
   now shows `"express": "^5.x.x"` (where x.x is the installed minor/patch).

2. Run the full test suite:
   ```bash
   cd api && npm test -- --test-concurrency=1
   ```
   All tests must pass. If any test fails, report the failure with the full error message before
   making any code changes — do not attempt to fix failures blindly.

3. Start the server and confirm the health check responds:
   ```bash
   # In one terminal:
   node api/server.js &
   # In another:
   curl -s http://localhost:3000/health | jq .
   # Expected: { "ok": true, "dbTime": "..." }
   # (or a DB connection error if no local DB — that's fine; a 500 from /health is also
   #  acceptable here as long as it is NOT a startup crash or 404)
   ```

4. Do **not** remove any `try/catch` blocks from route handlers. Express 5 will forward uncaught
   async errors to the error handler automatically, but the existing `try/catch` blocks add value:
   - They call `req.log.error(...)` with structured context before responding
   - They use `publicInternalError(err)` to sanitize the error message in production
   - They are the correct defence-in-depth pattern — keep them

### Expected outcome

- `package.json` `express` version starts with `^5.`
- `package-lock.json` updated
- `npm test` — 169+ tests pass, 0 fail
- Server starts without errors and `/health` returns a JSON response

### If tests fail

The most likely causes on Express 5 are:

1. **Path parameter mismatch** — if a test constructs a URL with a path param that doesn't match
   a route's `:param` pattern. Check the failing test's route path.

2. **`express-rate-limit` warning** — v8.3.x may log a deprecation notice but still functions.
   Warnings are acceptable; test failures are not.

3. **`req.query` type change** — Express 5's query parser (still `qs` under the hood) behaves
   identically to Express 4 for the query string patterns used in this codebase (simple key=value
   pairs). If a test fails on `req.query` access, report the exact assertion.

Report any failure before attempting a fix. The upgrade should be zero-code-change; any required
code fix is a sign of a pre-existing latent bug that Express 5 is surfacing.

---

## What is NOT in scope

- Removing `try/catch` blocks (keep them — they are structured logging points)
- Updating ESLint or TypeScript configs (not present in this project)
- Changing any middleware signatures — Express 5 middleware is backward-compatible with 4-arg
  error handlers `(err, req, res, next)` and 3-arg handlers `(req, res, next)`
- Updating `express-rate-limit` or `helmet` — both are already on versions that support Express 5
