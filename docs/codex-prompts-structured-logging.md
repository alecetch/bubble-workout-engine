# Codex Implementation Prompts — Structured Logging

Three sequential prompts. Each must be verified before the next begins.

**Context you must understand before starting:**

The codebase uses ESM (`import`/`export`) throughout — no CommonJS `require()`.
The existing `importEmitterService.js` already has a hand-rolled `logEvent(level, event, payload)`
function that emits JSON to stdout. This is the best existing pattern and will be replaced by
the shared logger.

`observability.md` defines the target log format. The required fields per log line are:
- `ts` — ISO-8601 timestamp string
- `level` — string (`"debug"`, `"info"`, `"warn"`, `"error"`)
- `event` — stable dot-namespaced event name (e.g. `"http.request.finish"`)
- `request_id` — UUID, present on all request-scoped logs

Optional fields depending on event: `method`, `url`, `status_code`, `duration_ms`,
`program_id`, `user_id`, `error_message`, `error_stack` (server-side only).

Redaction rules (from `observability.md`):
- Never log `ENGINE_KEY`, `INTERNAL_API_TOKEN`, `password`, `authorization` header values.
- Never log full request bodies for generation/import routes.
- Log metadata (body key names, lengths, counts) not payload content.

---

## Prompt 1 — Logger module, request lifecycle middleware, server.js wiring

### Files to read before writing anything

- `api/server.js` — full file. Note: `requestId` middleware is already in place and sets
  `req.request_id`. The logger must pick this up.
- `api/src/middleware/requestId.js` (if it exists) — understand how `req.request_id` is set.
- `api/package.json` — note the existing dependencies before adding new ones.

### Part 1a — Install pino

Add to `api/package.json` dependencies:
- `"pino": "^9.0.0"` — production logger

Add to `api/package.json` devDependencies:
- `"pino-pretty": "^13.0.0"` — human-readable output in local dev

Run `npm install` inside `api/`.

### Part 1b — Create `api/src/utils/logger.js`

```js
import pino from "pino";

/**
 * Singleton pino logger.
 *
 * Production (NODE_ENV=production): emits NDJSON to stdout.
 * Development: emits pretty-printed output via pino-pretty.
 *
 * All log lines include `ts` (ISO string) and string `level`.
 * Pass `event` as a field in every structured call:
 *   logger.info({ event: "pipeline.run.finish", program_id }, "Pipeline done");
 *   req.log.error({ event: "auth.resolve_user.error", err }, "resolveBubbleUser failed");
 */

const isProd = process.env.NODE_ENV === "production";

const transport = isProd
  ? undefined
  : { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } };

const logger = pino({
  level: process.env.LOG_LEVEL || "info",

  // Output ISO timestamp as `ts` instead of epoch ms as `time`
  timestamp: () => `,"ts":"${new Date().toISOString()}"`,

  // Emit `level` as a string ("info") not a number (30)
  formatters: {
    level: (label) => ({ level: label }),
  },

  // Redact sensitive fields anywhere in the log object tree
  redact: {
    paths: [
      "ENGINE_KEY",
      "INTERNAL_API_TOKEN",
      "password",
      "req.headers.authorization",
      "req.headers["x-internal-token"]",
      "req.headers["x-engine-key"]",
      "*.password",
      "*.token",
      "*.secret",
    ],
    censor: "[REDACTED]",
  },

  transport,
});

export default logger;
```

**Important:** pino's `timestamp` option replaces the default `time` field. The leading comma
in the string `,"ts":"..."` is intentional — pino inserts it correctly into the NDJSON output.

### Part 1c — Create `api/src/middleware/requestLogger.js`

This middleware:
1. Logs `http.request.start` at DEBUG level when each request arrives.
2. Attaches a child logger (`req.log`) with `request_id` bound to every log line in scope.
3. Logs `http.request.finish` at INFO level (or WARN if `status >= 400`, ERROR if `status >= 500`)
   on `res.on("finish")`, including `status_code` and `duration_ms`.

```js
import logger from "../utils/logger.js";

export function requestLogger(req, res, next) {
  const startMs = Date.now();

  // Bind request_id to every log line produced within this request
  req.log = logger.child({ request_id: req.request_id });

  req.log.debug({
    event: "http.request.start",
    method: req.method,
    url: req.url,
  });

  res.on("finish", () => {
    const duration_ms = Date.now() - startMs;
    const status_code = res.statusCode;
    const level = status_code >= 500 ? "error" : status_code >= 400 ? "warn" : "info";

    req.log[level]({
      event: "http.request.finish",
      method: req.method,
      url: req.url,
      status_code,
      duration_ms,
    });
  });

  next();
}
```

### Part 1d — Wire into `api/server.js`

**Step 1:** Add import at the top of `server.js`:
```js
import logger from "./src/utils/logger.js";
import { requestLogger } from "./src/middleware/requestLogger.js";
```

**Step 2:** Add `app.use(requestLogger)` immediately after `app.use(requestId)`:
```js
app.use(requestId);
app.use(requestLogger);  // ← add this line
app.use(helmet(...));
```

**Step 3:** Replace the startup validation `console.error` calls (the fail-fast secret checks at the
top of `server.js`) with logger calls. Because these run before the HTTP server starts,
use the root logger (not `req.log`):
```js
// Before:
console.error(`[startup] ${message}`);
process.exit(1);

// After:
logger.fatal({ event: "server.startup.fatal", message }, "Startup validation failed");
process.exit(1);
```

**Step 4:** Replace `console.log(\`API listening on :${port}\`)` at the bottom of `server.js`:
```js
logger.info({ event: "server.listening", port }, `API listening on :${port}`);
```

**Step 5:** Replace all remaining `console.error` / `console.log` calls in `server.js`:

| Current call | Replacement |
|---|---|
| `console.error("health error:", err?.stack \|\| err)` | `req.log.error({ event: "http.health.error", err: err?.message }, "Health check failed")` |
| `console.error("reference-data equipment_items error:", err)` | `req.log.error({ event: "http.reference_data.error", err: err?.message }, "reference-data error")` |
| `console.error("media-assets error:", err)` | `req.log.error({ event: "http.media_assets.error", err: err?.message }, "media-assets error")` |
| `console.error("equipment-items error:", err)` | `req.log.error({ event: "http.equipment_items.error", err: err?.message }, "equipment-items error")` |
| `console.log("[profile-patch]", ...)` | `req.log.debug({ event: "dev.profile_patch", id: req.params.id, patch }, "profile patch applied")` |
| `console.log("[profile-patch] goals after patch:", ...)` | remove — already captured in the above debug line |
| JSON parse error handler `console.error(JSON.stringify({...}))` | `req.log.warn({ event: "http.invalid_json", content_type, raw_body_length, raw_body_preview }, "Invalid JSON body")` |
| `console.error("Unhandled error:", err?.stack \|\| err)` | `req.log.error({ event: "http.unhandled_error", err: err?.message, stack: err?.stack }, "Unhandled error")` |

**Important:** `req.log` is available in these handlers because `requestLogger` middleware runs
before all routes. The JSON parse error handler and generic error handler are Express error
middleware — they also have `req` in scope.

### Verification

Restart the API (`docker compose restart api`). Make a request to `/health`. Check logs:

```bash
docker compose logs api --tail 20
```

In production mode you should see NDJSON lines like:
```json
{"level":"info","ts":"2026-03-20T14:00:01.000Z","request_id":"abc-123","event":"http.request.start","method":"GET","url":"/health"}
{"level":"info","ts":"2026-03-20T14:00:01.012Z","request_id":"abc-123","event":"http.request.finish","method":"GET","url":"/health","status_code":200,"duration_ms":12}
```

In dev mode you should see pino-pretty formatted output.

---

## Prompt 2 — Replace console.* in routes and services

### Context

`req.log` (a pino child logger with `request_id` bound) is now available on every request after
Prompt 1. Use `req.log` inside route handlers and middleware. For service files that don't have
`req` in scope (e.g. `importEmitterService.js`), import the root `logger` directly and pass
`request_id` as a field.

### Files to read before writing anything

- `api/src/routes/generateProgramV2.js` — read in full, note every `console.*` call
- `api/src/services/importEmitterService.js` — read the `logEvent()` function and all its callers
- `api/src/routes/debugAllowedExercises.js` — read in full
- `api/src/middleware/resolveUser.js` — read in full
- `api/src/utils/auditLog.js` — read in full
- Each of: `historyExercise.js`, `historyOverview.js`, `historyPersonalRecords.js`,
  `historyPrograms.js`, `historyTimeline.js` — find the `console.error` call in each

### Part 2a — `generateProgramV2.js`

This file has five `console.*` calls. Replace each:

| Current | Event name | Level | Notes |
|---|---|---|---|
| `console.log("[generateProgramV2] program-type resolution", {...})` | `pipeline.type_resolution` | `debug` | Use `req.log.debug` |
| `console.error("generate-plan-v2 setup error:", err)` | `pipeline.setup.error` | `error` | Include `err: err?.message`, `stack: err?.stack` |
| `console.error("markFailed gen_run error:", e)` | `pipeline.mark_failed.error` | `error` | Include `err: e?.message`. No `req` in scope here — use `logger` root |
| `console.error("markFailed program error:", e)` | `pipeline.mark_failed.error` | `error` | Same as above |
| `console.error("generation_run debug persist failed (non-fatal):", debugErr?.message)` | `pipeline.debug_persist.error` | `warn` | Non-fatal, use `warn` not `error` |
| `console.error("generate-plan-v2 pipeline/import error:", err)` | `pipeline.error` | `error` | Include `err: err?.message`, `stack: err?.stack` |

For `markFailed` calls: `markFailed` is a closure inside the route handler and has access to
`req` via closure scope. Use `req.log.error(...)` there too.

Add `import logger from "../utils/logger.js";` at the top — needed for any logger use outside
request scope if required. But since `req` is available via closure for all the calls above,
prefer `req.log`.

### Part 2b — `importEmitterService.js`

This file has a hand-rolled `logEvent(level, event, payload)` function. Replace it:

**Step 1:** Add import at top of file:
```js
import logger from "../utils/logger.js";
```

**Step 2:** Delete the entire `logEvent()` function (lines ~68–85).

**Step 3:** Find every call to `logEvent(level, event, payload)` in the file and replace with:
```js
// Before:
logEvent("info", "import_emitter.started", { request_id, user_id, program_id });

// After:
logger.info({ event: "import_emitter.started", request_id, user_id, program_id });
```
Apply the same pattern for every `logEvent` call. The event name strings remain unchanged —
they already follow the correct dot-namespace convention.

### Part 2c — `debugAllowedExercises.js`

The file currently does:
```js
console.info(JSON.stringify({ ts: new Date().toISOString(), ...payload }));
```

Replace with:
```js
import logger from "../utils/logger.js";
// ...
req.log.info({ event: "debug.allowed_exercises", ...payload });
```

Remove the manual `JSON.stringify` — pino handles serialization. Remove `ts` from the payload
if it was only being added manually — pino adds `ts` from its timestamp config.

### Part 2d — `resolveUser.js`

Replace:
```js
console.error("resolveBubbleUser error:", err);
```
With:
```js
req.log.error({ event: "auth.resolve_user.error", err: err?.message }, "resolveBubbleUser DB error");
```

### Part 2e — `auditLog.js`

Replace:
```js
console.error("admin audit log failed (non-fatal):", err?.message || err);
```
With:
```js
logger.warn({ event: "audit.write.error", err: err?.message }, "Admin audit log write failed (non-fatal)");
```

Add `import logger from "./logger.js";` at the top of `auditLog.js`.

### Part 2f — History route files (5 files)

Each has a single `console.error("history-X error:", error)` call. Apply the same pattern to all:

```js
// historyExercise.js
req.log.error({ event: "history.exercise.error", err: error?.message }, "history-exercise query failed");

// historyOverview.js
req.log.error({ event: "history.overview.error", err: error?.message }, "history-overview query failed");

// historyPersonalRecords.js
req.log.error({ event: "history.personal_records.error", err: error?.message }, "history-personal-records query failed");

// historyPrograms.js
req.log.error({ event: "history.programs.error", err: error?.message }, "history-programs query failed");

// historyTimeline.js
req.log.error({ event: "history.timeline.error", err: error?.message }, "history-timeline query failed");
```

None of these files need to import `logger` — `req.log` is available in all route handlers
after Prompt 1.

### Verification

After completing all replacements:

1. Run `grep -rn "console\." api/server.js api/src/routes/ api/src/services/ api/src/middleware/ api/engine/`
   — the output should be **empty** (zero remaining `console.*` calls in the paths above).

2. Restart the API and trigger a program generation. Check logs contain structured JSON lines for
   `pipeline.type_resolution`, `pipeline.run.start`/`finish` (if those were added), and
   the request lifecycle events.

3. Run `npm test` in `api/` — all existing tests must pass unchanged.

---

## Prompt 3 — Key domain event logging

### Context

Prompts 1–2 established the logger and replaced all existing `console.*` calls. This prompt
adds structured log lines at meaningful domain event points that currently emit nothing.
These are the events named in `observability.md` that don't exist yet.

Add only the events listed below — do not add logging beyond this list.

### Files to read before writing anything

- `api/src/routes/generateProgramV2.js` — locate the pipeline start/finish points
- `api/src/services/importEmitterService.js` — find the idempotent-hit detection and commit points

### Part 3a — Pipeline lifecycle events in `generateProgramV2.js`

After `runPipeline()` is called and `pipelineOut` is validated (rows confirmed non-empty), add:

```js
// After pipelineOut validation, before Phase 4 import
req.log.info({
  event: "pipeline.run.finish",
  program_type: programType,
  config_key: pipelineOut?.debug?.step1?.config_key ?? null,
  equipment_profile: pipelineOut?.debug?.step1?.equipment_profile ?? null,
  fill_failed: pipelineOut?.debug?.step1?.fill_failed ?? null,
  emitter_rows: rows.length,
  generation_run_id,
}, "Pipeline completed");
```

Before `runPipeline()` is called, add:

```js
req.log.info({
  event: "pipeline.run.start",
  program_type: programType,
  days_per_week: daysPerWeek,
  duration_mins: mappedMinutesPerSession ?? 50,
  fitness_rank: mappedFitnessRank,
  allowed_exercise_count: allowedIds.length,
  generation_run_id,
}, "Pipeline starting");
```

### Part 3b — Import emitter lifecycle events in `importEmitterService.js`

The existing `logEvent()` calls (now replaced with `logger.*` in Prompt 2) may already cover
`import_emitter.started` and `import_emitter.committed`. Verify the following events exist
after Prompt 2:

- `import_emitter.started` — logged when the function begins
- `import_emitter.committed` — logged after the transaction commits, including row counts
- `import_emitter.idempotent_hit` — logged when a duplicate import is detected and skipped

If any are missing, add them. These are already named in `observability.md` and the original
`logEvent()` calls used these exact names — they should carry over from Prompt 2 intact.

### Verification

Trigger a full program generation. Check that logs contain all of the following event names
in order:

1. `http.request.start`
2. `pipeline.run.start`
3. `pipeline.run.finish`
4. `import_emitter.started`
5. `import_emitter.committed`
6. `http.request.finish` (status_code 200, duration_ms > 0)

Run `docker compose logs api --tail 50 | grep '"event"'` to see the event stream.

---

## Implementation notes for all prompts

### Pino field ordering

pino merges the fields object into the log line before `msg`. The output order will be:
`level`, `ts`, then the bound child fields (e.g. `request_id`), then the call-site fields,
then `msg`. This is correct and matches the observability spec.

### Never log error stacks in responses

`err?.stack` may be logged to the server (stdout/Fly.io logs) but must never be included in
API responses. The existing `publicInternalError()` utility handles this correctly — do not
change it.

### Error serialization

pino has a built-in `err` serializer that handles `Error` objects (formats `message`, `stack`,
`type`). When passing an Error instance, pass it as `err: errorInstance` not as
`err: err.message` if you want the full serialization. For cases where only the message is
safe to log (no stack), use `err: err?.message`. Prefer `err: err?.message` for route-level
errors that might contain user data in the stack trace. Use the full error object only for
internal/infrastructure errors.

### `req.log` availability

`req.log` is set by the `requestLogger` middleware in Prompt 1. It is available in:
- All route handlers (after `app.use(requestLogger)`)
- All Express middleware that runs after `requestLogger`
- Closure-captured `req` references within route handlers (e.g. `markFailed`)

It is NOT available in:
- Module-level startup code
- Service functions that don't receive `req` as a parameter

For the latter, import the root `logger` directly.

### Dev vs prod output

In dev (`NODE_ENV !== "production"`), pino-pretty formats logs as human-readable colourised
text. In production (Fly.io, `NODE_ENV=production`), raw NDJSON goes to stdout and Fly's log
infrastructure handles it. No additional configuration is needed for Fly.io log drains.

### Test compatibility

The tests in `api/engine/__tests__/` and `api/src/services/__tests__/` do not test log output.
Replacing `console.*` with `logger.*` is transparent to them. If any test spies on
`console.error`, update the spy target to the logger. Run `npm test` to confirm.
