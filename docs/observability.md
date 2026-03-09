# Observability Guide

This document defines the current observability posture in this repo and a minimal standard to converge on.

## Scope

- Backend: `api/` (Node/Express + pg).
- Client: React Native app is external to this repo; only API-facing boundaries are documented.

---

## 1) Logging

## Current

- Logging sink: `stdout/stderr` via `console.info|warn|error|log`.
- Format:
  - JSON logs are used in some paths (for example, request debug in `api/server.js`, import service events in `api/src/services/importEmitterService.js`, debug-allowed route logs).
  - Plain text logs are still present (for example, `console.log("generate-plan hit", ...)`, `console.error("generate-plan error:", err)`, startup log line).
- Correlation ID:
  - `x-request-id` is read in some routes.
  - If missing, some routes generate one (`randomUUID()`), especially import/generate flows.
  - Not globally enforced on every route.
- Error logging:
  - JSON parse failures are logged with content-type + raw length + truncated preview in `api/server.js`.
  - Final generic error handler logs stack if present.

## Recommended (Minimal Standard)

Adopt structured JSON logs everywhere in API.

Required log fields:
- `ts` (ISO timestamp)
- `level` (`debug|info|warn|error`)
- `event` (stable event name)
- `request_id`
- `route`
- `method`
- `status_code` (for completion/error events)
- `duration_ms` (for request completion)

Optional fields:
- `user_id`, `bubble_user_id`, `program_id`, `client_profile_id`
- `error_code`, `error_message`, `error_stack` (stack only on server side)

Redaction rules:
- Never log secrets (`ENGINE_KEY`, API tokens, DB passwords).
- Never log full request bodies for generation/import routes.
- Allow list metadata (body keys, lengths, counts), not payload content.

Example event names:
- `http.request.start`
- `http.request.finish`
- `http.request.error`
- `db.query`
- `pipeline.run.start`
- `pipeline.run.finish`
- `import_emitter.started`
- `import_emitter.committed`
- `import_emitter.idempotent_hit`

---

## 2) Correlation IDs

## Current

- `x-request-id` is consumed in selected routes (`importEmitter`, `generateProgram`, `debugAllowedExercises`).
- Some responses include `request_id`; not consistent across all endpoints.

## Recommended

- Middleware behavior for every request:
  - Read `x-request-id` from inbound headers.
  - If missing, generate UUID.
  - Store on `req.request_id`.
  - Set `X-Request-Id` response header.
- Include `request_id` in:
  - every log line tied to request scope,
  - every error response envelope.
- If calling downstream services (Bubble, future microservices), propagate the same header.

---

## 3) Request Logging

## Current

- There is targeted request logging for `POST /api/program/generate` in `api/server.js`.
- It logs safe metadata: content type/length, raw body length, body key preview.
- No global start/finish request logger.

## Recommended

Implement global request lifecycle logging:
- At request start: log route/method/request_id.
- At response finish: log status + duration.
- At response error path: log status + mapped error code + duration.

Keep targeted deep diagnostics behind a flag:
- Env toggle: `OBS_DEBUG_REQUESTS=true`.
- Only enable noisy payload-shape logs when debugging incidents.

---

## 4) Error Reporting

## Current

- JSON parse errors are correctly separated and mapped to `code: "invalid_json"`.
- Generic error handler returns `code: "internal_error"`.
- Route-level error mapping exists but is inconsistent in envelope shape and request_id presence.

## Recommended

Standard error envelope for all API routes:

```json
{
  "ok": false,
  "request_id": "<uuid>",
  "code": "validation_error|not_found|conflict|internal_error|...",
  "error": "Human-readable message",
  "details": []
}
```

Rules:
- Always include `request_id`.
- Use stable `code` values across routes.
- Include `details` only for actionable validation issues.
- Avoid leaking SQL internals in `error` strings.

---

## 5) DB Query Timing

## Current

- Transaction-level durations are logged in import service events (`duration_ms`).
- Per-query timing is not instrumented.

## Recommended

Add a light wrapper around `client.query` for timed logging/metrics:
- Record `duration_ms`, `row_count`, `query_name` (logical name, not raw SQL), success/failure.
- Log only sampled queries by default (for example, slow queries > 100ms).
- Never log full SQL with raw parameters for sensitive paths.

Suggested slow query threshold:
- `DB_SLOW_QUERY_MS=100` (env configurable).

---

## 6) Metrics

## Current

- No metrics endpoint (`/metrics`) and no Prometheus/OpenTelemetry metrics exporter in repo.

## Recommended

Expose a minimal metric set (Prometheus naming style):

HTTP:
- `http_requests_total{method,route,status_code}` (counter)
- `http_request_duration_ms{method,route,status_code}` (histogram)
- `http_requests_in_flight{route}` (gauge)

DB:
- `db_queries_total{query_name,status}` (counter)
- `db_query_duration_ms{query_name,status}` (histogram)
- `db_pool_in_use` (gauge)
- `db_pool_idle` (gauge)
- `db_pool_waiting` (gauge)

Domain/business:
- `program_generation_requests_total{program_type,status}`
- `program_generation_duration_ms{program_type,status}`
- `program_import_idempotent_hits_total`
- `program_import_rows_total{row_type}`
- `allowed_exercises_count` (histogram)

Reliability:
- `bubble_api_requests_total{endpoint,status}`
- `bubble_api_duration_ms{endpoint,status}`
- `errors_total{code,route}`

---

## 7) Tracing and Propagation

## Current

- No tracing SDK present (no OpenTelemetry instrumentation detected).
- No `traceparent` propagation implemented.

## Recommended

Adopt W3C Trace Context:
- Accept inbound `traceparent` and `tracestate` headers.
- Generate root span when absent.
- Propagate trace headers to downstream service calls (if any external APIs are added).
- Correlate `request_id` and `trace_id` in logs.

Initial span model:
- `http.server` span for each request.
- Child spans:
  - `db.query` (for key queries/transactions)
  - `pipeline.run`
  - `bubble.fetchInputs`
  - `importEmitterPayload`

Sampling (initial):
- 100% errors, 10% success traffic.

---

## 8) RN Client Logging Boundaries

## Current

- RN app code is not in this repository.

## Recommended

Client should:
- Generate and send `x-request-id` per API call if backend does not return one first.
- Propagate backend `X-Request-Id` into client-side error reports.
- Log request metadata only (route, status, duration, request_id).
- Avoid logging payloads containing profile or health-related data.

Client should not:
- Retry non-idempotent write operations blindly.
- Log full response payloads for generation/import endpoints in production.

---

## 9) Do / Don�t Examples

## Logging payloads

Do:

```json
{
  "ts": "2026-02-25T20:15:18.224Z",
  "level": "info",
  "event": "http.request.finish",
  "request_id": "7c301f4a-1e67-4e9a-bf4d-b31e2333b1eb",
  "method": "POST",
  "route": "/api/program/generate",
  "status_code": 200,
  "duration_ms": 842,
  "body_keys": ["bubble_user_id", "bubble_client_profile_id", "programType"]
}
```

Don�t:

```text
generate-plan hit application/json { bubble_user_id: "...", fullProfile: {...huge sensitive object...} }
```

## Error reporting

Do:

```json
{
  "ok": false,
  "request_id": "7c301f4a-1e67-4e9a-bf4d-b31e2333b1eb",
  "code": "validation_error",
  "error": "Missing bubble_client_profile_id"
}
```

Don�t:

```json
{
  "ok": false,
  "error": "insert or update on table \"client_profile\" violates foreign key constraint ..."
}
```

## Correlation propagation

Do:
- inbound request carries `x-request-id: abc-123`
- backend logs include `request_id=abc-123`
- Bubble outbound call includes same `x-request-id: abc-123`

Don�t:
- generate new unrelated IDs per internal function and lose cross-system linkage.

---

## 10) Implementation Checklist

1. Add global request-id middleware and response header.
2. Standardize error envelope + include `request_id` on all failures.
3. Replace remaining plain-text logs with structured JSON.
4. Add request start/finish middleware with duration.
5. Add DB query timing wrapper with slow-query logging.
6. Introduce metrics endpoint/exporter and counters/histograms listed above.
7. Add trace context extraction/propagation (`traceparent`) and key spans.
