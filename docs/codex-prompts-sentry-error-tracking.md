# Codex Spec: Sentry Error Tracking

**Why:** The Fly.io health check (`fly.toml` lines 24–29) already monitors `/health` every
10s and restarts unresponsive instances. That covers total outages. What it does NOT cover:

- 5xx errors from route handlers (app responds, but with errors)
- Unhandled promise rejections or thrown errors that reach the Express error handler
- Crashes between health check intervals

Without error tracking, production bugs are discovered by users, not by alerts. A broken
`/generate-plan-v2` endpoint would fail silently until a user reports it.

**Approach:** Sentry.io Node.js SDK. Free tier covers 5,000 errors/month (sufficient for
this scale). Sentry captures every unhandled error with stack trace, request context, and
environment label. New error types trigger an email alert by default.

**Scope:** Install SDK, initialise in `server.js`, wire the Sentry error handler, set the
DSN secret on Fly.io. No application logic changes.

---

## Pre-requisite (human step — not for Codex)

Before running this prompt, the developer must:

1. Create a free account at sentry.io
2. Create a new project → select "Node.js" platform
3. Copy the DSN (looks like `https://xxxxx@o0.ingest.sentry.io/0000000`)
4. Set the secret on Fly.io:
   ```bash
   fly secrets set SENTRY_DSN="https://xxxxx@o0.ingest.sentry.io/0000000" --app bubble-workout-api
   ```
5. Optionally set it locally in `api/.env` for local testing:
   ```
   SENTRY_DSN=https://xxxxx@o0.ingest.sentry.io/0000000
   ```

The `SENTRY_DSN` env var is the only new secret needed. All other config is in code.

---

## Prompt 1 — Install and wire Sentry

### Step 1: Install the SDK

```bash
cd api && npm install @sentry/node
```

Confirm `package.json` now has `"@sentry/node": "^x.x.x"` in dependencies.

### Step 2: Initialise Sentry at the top of `server.js`

Add this block **immediately after the existing `import` statements**, before any
`app = express()` or middleware setup. Sentry must be initialised before any other code
to ensure it instruments the correct modules:

```js
import * as Sentry from "@sentry/node";

// Sentry is no-op when SENTRY_DSN is absent (dev/test environments).
Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  // Capture 100% of errors; reduce to e.g. 0.2 if volume becomes an issue.
  sampleRate: 1.0,
});
```

### Step 3: Attach request handler middleware

Add this **immediately after `const app = express()`**, before any other middleware:

```js
// Sentry request handler — attaches request context to each captured error.
// Must come before all other middleware.
app.use(Sentry.expressErrorHandler ? Sentry.Handlers?.requestHandler?.() : (req, res, next) => next());
```

Wait — the correct modern Sentry v8 API does not use `Handlers.requestHandler()`. Use
the automatic Express instrumentation instead. With `@sentry/node` v8+, calling
`Sentry.init()` automatically instruments Express. No explicit request handler middleware
is needed.

**Simplified Step 3 for Sentry v8+:**

No additional middleware call is needed after `Sentry.init()`. The SDK automatically
instruments Express route handlers.

### Step 4: Add Sentry error handler to the error-handling chain

Find the existing final error handler in `server.js` (the 4-argument `(err, req, res, next)`
handler). Add the Sentry error handler **immediately before it**:

```js
// Sentry error handler — must come BEFORE the generic error handler and AFTER all routes.
Sentry.setupExpressErrorHandler(app);

// Existing generic error handler (unchanged):
app.use((err, req, res, next) => {
  // ... existing error handler body
});
```

`Sentry.setupExpressErrorHandler(app)` registers a 4-argument error handler internally
that captures errors and forwards them to the next handler. The existing generic error
handler continues to run and return the JSON response to the client.

### Step 5: Verify the integration does not break existing tests

```bash
cd api && npm test -- --test-concurrency=1
# All tests must continue to pass — Sentry is no-op when SENTRY_DSN is absent
```

The `enabled: !!process.env.SENTRY_DSN` flag ensures Sentry does nothing in CI or local
environments where the DSN is not set. Tests must not require SENTRY_DSN to pass.

---

## Verification (once deployed)

After deploying with `SENTRY_DSN` set:

1. Trigger a test error by calling a route that throws deliberately, or by checking
   Sentry's "Getting Started" page which includes a test button.

2. Confirm the error appears in the Sentry project dashboard within 30 seconds.

3. Confirm email alerts are configured:
   - Sentry → Project Settings → Alerts → create a rule:
     "When a new issue is created → notify via email"
   - This is a UI step, not a code step.

---

## What Sentry captures (after this change)

| Scenario | Captured? |
|----------|-----------|
| Unhandled async error in route handler | ✅ Express 5 + Sentry handler |
| Explicit `throw` reaching the error handler | ✅ |
| 5xx responses from the generic error handler | ✅ |
| App startup crash (import error, bad env var) | ❌ Sentry must be init'd before the crash |
| 4xx validation errors | ❌ These are handled responses, not errors |
| Health check failures | ❌ Fly.io catches these separately |

Startup crashes (e.g. missing required env var) are not catchable by Sentry unless
`Sentry.init()` runs before the crash. The weak-secret guard in `server.js` already
causes a controlled startup failure with a clear log message, which is visible in Fly.io
logs. This is acceptable.

---

## Out of scope

- Sentry performance monitoring / tracing (separate `tracesSampleRate` config — add later
  if latency visibility becomes a priority)
- Custom Sentry tags or user context (can be added to the request logger middleware later)
- Sentry source maps (useful for minified builds — this project runs plain ESM, not needed)
