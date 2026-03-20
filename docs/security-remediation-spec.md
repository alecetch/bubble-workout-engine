# Security Remediation Spec — bubble-workout-engine

**Author role:** Principal Security Engineer / Application Security Architect
**Date:** 2026-03-20
**Standards applied:** OWASP ASVS 5.0, OWASP API Security Top 10 2023, OWASP MASVS 2.0

> This is a repo-specific implementation spec for Codex, not a generic checklist.
> Every finding is grounded in actual files and routes.

---

## A. Codebase Findings

### A1. Architecture and trust model

The system is a **Bubble.io-integrated** workout engine. The intended production trust model is:

```
[Mobile App] → [Bubble.io backend] → [This API (with ENGINE_KEY)] → [Postgres]
```

Bubble authenticates users, then calls this API on their behalf, forwarding `bubble_user_id` in query parameters or request body alongside the `ENGINE_KEY` / `INTERNAL_API_TOKEN` header. The API trusts the `bubble_user_id` **only because it arrived alongside a valid internal token**. This is a backend-to-backend integration pattern, not a direct mobile-to-API pattern.

This context is essential to the threat model: the primary risk is not an attacker with a browser, but:
1. A route missing the internal token guard (direct client access)
2. A compromised internal token (full horizontal privilege escalation)
3. A Bubble backend vulnerability forwarding wrong user IDs

### A2. Actual auth/authz model

| Mechanism | Where | Strength |
|---|---|---|
| `requireInternalToken` | Most `/v1/history/*`, `/admin/*`, `/generate-plan-v2` | Medium — single shared bearer token, constant-time compare, no rotation |
| `resolveBubbleUser` middleware | `/v1/history/*` | Trusts `bubble_user_id` from query param after token check passes |
| `resolveUserId()` function | `readProgram.js`, `segmentLog.js`, several others | Trusts `user_id` UUID from query param, no ownership re-verification |
| No auth | `/health`, `/reference-data`, `/equipment-items`, `/media-assets` | None — intentionally open (read-only data) |
| **No auth** | `/logged-exercises`, `/prs-feed`, `/session-history-metrics`, `/exercise-summary` | **None — accepts `bubble_user_id` from query without internal token** |
| Dev-only in-memory | `/me`, `/client-profiles/*` | Hardcoded `DEV_USER_ID = "dev-user-1"` |

### A3. Key attack surfaces

1. **Routes missing `requireInternalToken`** — callable directly by anyone with internet access
2. **`bubble_user_id` / `user_id` from query parameters** — horizontal privilege escalation if internal token is bypassed
3. **Single long-lived internal token** — no rotation, no per-service scoping
4. **Admin SQL generation** (`R__exercise_catalogue_edits.sql`, snapshot tool) — generates and executes SQL, file written to disk
5. **Admin UI localStorage token storage** — token accessible to any JS in the same origin
6. **No rate limiting anywhere** — DB-heavy endpoints DoS-able
7. **No security headers** (Helmet) — clickjacking, MIME-sniffing, etc.
8. **Error responses** in some paths include internal error messages

### A4. Data flows (security-relevant)

```
Mobile → Bubble backend → POST /generate-plan-v2 [ENGINE_KEY required]
Mobile → Bubble backend → GET /v1/history/* [ENGINE_KEY + bubble_user_id]
Mobile → Bubble backend → GET /logged-exercises [NO AUTH ← gap]
Mobile → Bubble backend → GET /prs-feed [NO AUTH ← gap]
Admin browser → GET/POST /admin/* [ENGINE_KEY in X-Internal-Token header, stored in localStorage]
Admin browser → POST /admin/exercise-catalogue/session/export-snapshot [writes to disk]
Flyway → migrations/* [SQL executed with DB owner credentials at deploy time]
```

---

## B. Threat Model

### Trust boundaries

```
UNTRUSTED: Internet, mobile app clients, unauthenticated HTTP callers
TRUSTED: Bubble.io backend (presents ENGINE_KEY), Admin browser (presents ENGINE_KEY)
HIGHLY TRUSTED: Flyway migration runner (DB owner credentials)
INTERNAL: Postgres (private network), MinIO (private network in prod)
```

### Attacker types

| Type | Capability | Primary risk |
|---|---|---|
| **Passive external attacker** | Unauthenticated HTTP calls | Access unprotected routes; read other users' exercise/PR history |
| **Active external attacker** | Fuzzes IDs on unprotected routes | Full BOLA on `/logged-exercises`, `/prs-feed`, read all users' data |
| **Compromised internal token** | Presents valid ENGINE_KEY | Full horizontal privilege escalation, program injection for any user |
| **Malicious admin** | Access to admin UI | Arbitrary SQL injection via exercise catalogue snapshot, config manipulation |
| **DoS attacker** | High-frequency HTTP calls | DB resource exhaustion via analytics/generation endpoints |

### Sensitive assets

- `bubble_user_id` — links to real Bubble users
- `program_exercise`, `program_day` — personal workout history
- `generation_run.step1_stats_json` — user fitness profile data
- `ENGINE_KEY` / `INTERNAL_API_TOKEN` — complete API access
- Narration templates, PGC configs — proprietary business logic
- Media asset URLs — S3-backed content

---

## C. Findings by Severity

---

### CRITICAL

---

#### C-01: BOLA on exercise history, PR feed, and session metrics routes

**Affected files/routes:**
- `api/src/routes/loggedExercises.js` — `GET /logged-exercises`, `GET /exercise-summary`
- `api/src/routes/prsFeed.js` — `GET /prs-feed`
- `api/src/routes/sessionHistoryMetrics.js` — `GET /session-history-metrics`

**Why it matters:**
These routes have **no `requireInternalToken` middleware**. They accept `bubble_user_id` or `user_id` directly from query parameters and return that user's complete exercise history, personal records, and session metrics. Any internet-accessible caller that knows (or enumerates) a victim's `bubble_user_id` can read their full workout history.

**Exploit scenario:**
```bash
curl "https://api.example.com/logged-exercises?bubble_user_id=victim_bubble_id&limit=100"
# Returns victim's complete exercise history — no token required
```

**Remediation:** Add `requireInternalToken` middleware to all four routes. Verify against the route table in `api/server.js`.

---

#### C-02: `resolveBubbleUser` middleware silent fallthrough

**Affected files:**
- `api/src/middleware/resolveUser.js`
- All `/v1/history/*` routes that rely on it

**Why it matters:**
`resolveBubbleUser` calls `next()` when `bubble_user_id` is absent from the request, instead of rejecting the request. Downstream route handlers that check `req.auth?.user_id` will receive `undefined` and may behave unexpectedly — returning empty results or triggering an unhandled error that leaks internals.

**Code:**
```js
if (!bubbleUserId) {
  return next();  // ← proceeds without setting req.auth
}
```

**Exploit scenario:**
A request to `/v1/history/overview` with no `bubble_user_id` and a valid internal token proceeds unauthenticated, then either errors internally or returns unexpected data.

**Remediation:** Change the fallthrough to a `401` rejection:
```js
if (!bubbleUserId) {
  return res.status(401).json({ ok: false, code: "unauthorized", error: "bubble_user_id required" });
}
```

---

#### C-03: `user_id` accepted from query parameters without ownership verification

**Affected files:**
- `api/src/routes/readProgram.js` — `resolveUserId()` function
- `api/src/routes/segmentLog.js`
- `api/src/routes/loggedExercises.js`
- `api/src/routes/prsFeed.js`

**Why it matters:**
`resolveUserId()` in `readProgram.js` accepts a `user_id` UUID directly from `req.query` and returns it as the verified user identity. While subsequent queries do join on `user_id`, the auth check is:

> "Does this program belong to the user_id you gave me?"

— not:

> "Does the caller own this user_id?"

If the caller is the Bubble backend presenting a valid internal token, this is fine by design. But with `requireInternalToken` as the only gate, a stolen token grants BOLA for every user in the system.

**Code:**
```js
if (user_id) {
  if (!isUuid(user_id)) throw new ValidationError("Invalid user_id");
  return user_id;  // ← returns caller-supplied UUID as authoritative identity
}
```

**Remediation:** This is acceptable given the Bubble integration model, but requires the internal token to be treated with the same security posture as a user session token. See C-04 for token hardening.

---

#### C-04: Single long-lived internal token with no rotation mechanism

**Affected files:**
- `api/src/middleware/auth.js`
- `api/.env.example`
- All routes guarded by `requireInternalToken`

**Why it matters:**
`ENGINE_KEY` and `INTERNAL_API_TOKEN` are the only authorization mechanism protecting every user's data. There is no rotation mechanism, no expiry, no scoping per service, and no audit trail of which service is using which token. If either token leaks (logs, CI secrets, a compromised Bubble environment), the attacker has full access to every user's data permanently.

**Exploit scenario:**
Token leaks into CI logs. Attacker calls any history endpoint with `?bubble_user_id=<enumerated_id>` + `ENGINE_KEY` header. Reads all users' programs, workout history, PRs.

**Remediation:**
1. Add startup check that `ENGINE_KEY` is at least 32 characters and not equal to `"change-me"` — crash on startup if not met
2. Separate `ENGINE_KEY` (Bubble→API) from `INTERNAL_API_TOKEN` (admin UI→API) — they should be different values
3. Add failed-auth rate limiting (`express-rate-limit` on auth failures, not just total requests)
4. Document a key rotation runbook in `docs/`

---

### HIGH

---

#### H-01: No rate limiting on any endpoint

**Affected files:** `api/server.js` (no rate-limiting middleware present)

**Why it matters:**
Every endpoint — including `/health` (DB query), generation (`runPipeline()` is expensive: multiple DB queries + algorithmic work), analytics aggregations (full table scans on `program_exercise`), and admin observability queries — is callable without any throttle. A single attacker can:
- Exhaust the Postgres connection pool via rapid `/health` calls
- Trigger repeated program generations (each creates DB rows + runs a full pipeline) via `/generate-plan-v2`
- Cause sustained high load on analytics endpoints

**Remediation:**
Add `express-rate-limit` (already a zero-dependency package compatible with this stack). Add two rate limiters in `server.js`:
1. Global limiter: `windowMs: 60_000, max: 300` — applied to all routes
2. Generation limiter: `windowMs: 60_000, max: 5` — applied only to `POST /generate-plan-v2`
3. Admin limiter: `windowMs: 60_000, max: 120` — applied to `/admin/*`

---

#### H-02: No security headers (Helmet)

**Affected files:** `api/server.js`

**Why it matters:**
The admin UI is a browser application served at `/admin/*`. Without security headers:
- **No `X-Frame-Options` / `frame-ancestors`** — admin UI can be embedded in an attacker iframe (clickjacking)
- **No `X-Content-Type-Options: nosniff`** — MIME-type sniffing attacks on uploaded/stored content
- **No `Content-Security-Policy`** — any future XSS has full browser capability
- **No `Referrer-Policy`** — admin page URLs leak in HTTP Referer headers to external requests
- **No `Permissions-Policy`** — unnecessary browser API access

**Remediation:**
`npm install helmet` in `api/`. Add `app.use(helmet())` as the first middleware in `server.js`. For the admin UI, add a strict CSP:
```js
app.use("/admin", helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],  // Chart.js CDN
      styleSrc: ["'self'", "'unsafe-inline'"],  // inline styles in admin pages
      imgSrc: ["'self'", "data:"],
    },
  },
}));
```

---

#### H-03: Admin UI auth token stored in `localStorage`

**Affected files:**
- `api/admin/index.html`
- `api/admin/observability.html`
- `api/admin/coverage.html`
- `api/admin/exercises.html`

**Why it matters:**
The `ENGINE_KEY`/`INTERNAL_API_TOKEN` is stored in `localStorage`, which persists across browser sessions and is accessible to any JavaScript running on the same origin. If XSS were ever introduced (via a future innerHTML bug, a CDN compromise of Chart.js, or a third-party script), the token would be exfiltrated. The token grants access to all user data.

**Remediation:**
Switch all admin pages from `localStorage` to `sessionStorage`. This does not solve XSS token theft but eliminates persistent storage across browser sessions and reduces the window of exposure. For a future hardening pass, consider an HTTP-only session cookie pattern for the admin token.

---

#### H-04: Production error responses may include internal error messages

**Affected files:** `api/server.js` error handler (lines ~416–428)

**Why it matters:**
The generic error handler includes `err?.message` in the response body:
```js
res.status(err.status || 500).json({
  ok: false,
  code: err.code || "internal_error",
  error: err?.message || "Internal server error",
});
```
Postgres error messages (e.g. `duplicate key value violates unique constraint "program_pkey"`) contain table names, constraint names, and sometimes data values. These are informative to attackers mapping the schema.

**Remediation:**
For 5xx errors, replace `err.message` with a generic string in production. Only pass `err.message` through for known error classes (`ValidationError`, `NotFoundError`) where the message is explicitly safe. Add `if (err.status >= 500 && process.env.NODE_ENV === "production") message = "Internal server error"` guard.

---

#### H-05: Admin exercise catalogue snapshot writes arbitrary SQL to disk and executes it

**Affected files:**
- `api/src/routes/adminExerciseCatalogue.js` — `buildSnapshotSql()`, `session/generate-migration` route
- `api/src/routes/adminExerciseCatalogue.js` — `session/export-snapshot` route

**Why it matters:**
The `generate-migration` endpoint:
1. Builds SQL from queued pending changes (which include user-editable strings)
2. Writes that SQL to `migrations/R__exercise_catalogue_edits.sql` on disk
3. **Immediately executes all pending SQL against the live database**

The `export-snapshot` endpoint writes a complete snapshot of the exercise catalogue to the same file.

Any admin action that injects malicious content into exercise fields (e.g. a `name` containing `'; DROP TABLE program_exercise; --`) would be written to the migration file and executed. The `sqlLiteral()` function escapes single quotes, which prevents basic injection — but this pattern (generate SQL from admin-edited data, then execute it) is inherently high-risk.

**Why `sqlLiteral()` is not sufficient alone:**
The migration file is committed to git and run by Flyway in production with DB-owner credentials. An XSS-or-CSRF attack that injects a malicious exercise name would embed that SQL in the migration file permanently.

**Remediation:**
1. Keep `sqlLiteral()` as-is (it is correct for SQL string escaping)
2. Add a **pre-execute review step**: the `generate-migration` endpoint should NOT automatically execute SQL. It should write the file and return the SQL for human review. Execution should be a separate, explicit confirm step.
3. Add a server-side SQL content validation pass before execution: reject any SQL string that contains `;` beyond statement terminators, `--`, `/*`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`, `COPY`, `\i` patterns.
4. Log every SQL execution event with timestamp and token identity to a persistent audit table.

---

### MEDIUM

---

#### M-01: User enumeration via distinct 404 vs 401 responses

**Affected files:**
- `api/src/middleware/resolveUser.js`
- `api/src/routes/loggedExercises.js`, `prsFeed.js`, `sessionHistoryMetrics.js`

**Why it matters:**
When `bubble_user_id` refers to a non-existent user, the API returns `401 User not found`. When it refers to an existing user, it returns their data. This allows an attacker to enumerate valid `bubble_user_id` values by observing the difference in responses — a prerequisite for the BOLA attacks in C-01 and C-03.

**Remediation:**
For unauthenticated enumeration attempts (i.e. where `requireInternalToken` fails or is absent), return a generic `401 Unauthorized` without specifying whether the user exists. The distinction between "user not found" and "access denied" should only be visible to authenticated internal callers.

---

#### M-02: No CSRF protection on admin state-changing endpoints

**Affected files:** All admin HTML pages, admin routes in `adminExerciseCatalogue.js`, `adminConfigs.js`

**Why it matters:**
The admin endpoints use a custom `X-Internal-Token` header for auth. Custom headers cannot be sent cross-origin by the browser's default `fetch()` without CORS preflight (SOP protects this). However:
- If the admin page is ever vulnerable to XSS, the token from `localStorage` can be read and used in a custom-header request — CSRF protection becomes the only remaining defence
- Mutation endpoints that accept `Content-Type: application/json` but fall back to form data could be CSRF-able in edge cases

**Remediation:**
This is a medium-priority item given the custom header mitigates the primary CSRF vector. Add a `SameSite=Strict` attribute instruction to any future cookie-based token. Add `Origin` header validation in `requireInternalToken` for browser-sourced requests.

---

#### M-03: Admin observability exposes all users' generation data without scoping

**Affected files:** `api/src/routes/adminObservability.js`

**Why it matters:**
The `/admin/api/observability/runs` endpoint returns every `generation_run` row in the database, including `step1_stats_json` which contains user fitness profile data (equipment profile, fitness rank, duration preference, selected exercise IDs). There is no user-level scoping. Any admin token holder can see every user's fitness profile metadata.

This is acceptable in a single-operator admin tool but becomes a privacy liability as user count grows (GDPR/CCPA relevance).

**Remediation:**
Add a `user_id` filter parameter (optional) to observability endpoints. Document that this endpoint contains personal fitness data and should only be accessed for legitimate operational purposes. In a future privacy pass, consider whether `step1_stats_json` should be stored without user-identifiable fields.

---

#### M-04: No startup validation of critical environment variables

**Affected files:** `api/server.js`

**Why it matters:**
If `ENGINE_KEY` is unset, empty, or equal to `"change-me"`, `requireInternalToken` rejects all requests. However, there is no startup-time check or clear error message. A misconfigured deployment silently fails authentication for all routes rather than refusing to start with a clear explanation.

**Remediation:**
Add an environment validation block at the top of `server.js` (before `app.listen`):
```js
const REQUIRED_SECRETS = ["ENGINE_KEY", "DATABASE_URL"];
const WEAK_DEFAULTS = ["change-me", "minioadmin", "app", "password", "secret"];
for (const key of REQUIRED_SECRETS) {
  const val = process.env[key] ?? "";
  if (!val || val.length < 16) {
    console.error(`FATAL: ${key} is missing or too short. Refusing to start.`);
    process.exit(1);
  }
  if (WEAK_DEFAULTS.includes(val.toLowerCase())) {
    console.error(`FATAL: ${key} is set to a known weak default. Refusing to start.`);
    process.exit(1);
  }
}
```

---

#### M-05: `/health` endpoint makes a DB query with no auth and no rate limiting

**Affected files:** `api/server.js` — `GET /health`

**Why it matters:**
The health endpoint runs `SELECT now()` against Postgres on every call. With no rate limiting, it can be used to exhaust the DB connection pool. It also provides a timing oracle: response latency reveals DB reachability and approximate load.

**Remediation:**
Add rate limiting (max 10 req/s from any IP). Optionally add a `Connection: close` header to prevent connection keep-alive abuse.

---

#### M-06: No audit log for admin mutations

**Affected files:**
- `api/src/routes/adminExerciseCatalogue.js`
- `api/src/routes/adminConfigs.js`
- `api/src/routes/adminNarration.js`

**Why it matters:**
Every mutation to the exercise catalogue (add, edit, archive, delete, snapshot) is applied to the database with no record of who did it, when, or from which IP. The migration file captures the SQL but not the actor. If an exercise is accidentally deleted or a harmful config change is made, there is no audit trail.

**Remediation:**
Create an `admin_audit_log` table:
```sql
CREATE TABLE admin_audit_log (
  id         bigserial PRIMARY KEY,
  ts         timestamptz NOT NULL DEFAULT now(),
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  detail     jsonb,
  ip         text
);
```
Write to it in a helper function called from every admin mutation route. This is also the mechanism for future admin user identification when admin auth is strengthened.

---

#### M-07: `docker-compose.yml` has weak default credentials that ship with the repo

**Affected files:** `docker-compose.yml`

**Why it matters:**
```yaml
POSTGRES_USER: app
POSTGRES_PASSWORD: app
MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
```
These defaults are committed to a public or semi-public git repo. A developer who forgets to set `.env` overrides will run with these credentials. If the DB port is exposed (it is, on port 5432 in the compose file), external access with default credentials is trivial.

**Remediation:**
1. Remove the `ports: "5432:5432"` mapping from the `db` service — Postgres should not be exposed to the host except for local dev. Add a comment instructing developers to add it temporarily if needed.
2. Remove default fallbacks from MinIO: `${MINIO_ROOT_PASSWORD:-minioadmin}` → `${MINIO_ROOT_PASSWORD}` (fail if not set).
3. Add a compose override file `docker-compose.dev.yml` with development-only ports rather than exposing them in the base compose.

---

### LOW

---

#### L-01: `localStorage` token persists after browser close

Already covered in H-03. Separate note: admin pages have no session expiry mechanism. A token stolen from a shared machine will remain valid indefinitely.

**Remediation:** Switch to `sessionStorage`. Add a 30-minute idle timeout in the admin JS that clears the token and redirects to the token prompt.

---

#### L-02: Chart.js loaded from CDN without Subresource Integrity (SRI)

**Affected files:** `api/admin/observability.html`

**Why it matters:**
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```
If jsDelivr is compromised or the URL is hijacked, malicious JavaScript runs in the admin context with access to the admin token in `localStorage`.

**Remediation:**
Add `integrity` and `crossorigin` attributes:
```html
<script
  src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
  integrity="sha384-[HASH]"
  crossorigin="anonymous"></script>
```
Generate the hash with: `openssl dgst -sha384 -binary chart.umd.min.js | openssl base64 -A`

---

#### L-03: `narration_template` content is admin-editable and rendered in mobile output

**Affected files:**
- `api/src/routes/adminNarration.js`
- `api/engine/steps/05_applyNarration.js`

**Why it matters:**
Narration templates contain text strings that are written into workout plans and eventually displayed in the mobile app. An admin-editable text field that flows into mobile-rendered content is a stored XSS vector if the mobile app ever renders it as HTML. While React Native does not render HTML by default, any future WebView component or HTML export would be at risk.

**Remediation:**
Add a content-safety validation pass when saving narration templates: reject any template body containing `<`, `>`, `javascript:`, `data:`, or URL-like patterns. This is low-risk in the current RN setup but establishes a safe habit.

---

#### L-04: Dependency audit — no automated scanning in CI

**Affected files:** `.github/workflows/fly-deploy.yml`, `api/package.json`

**Why it matters:**
The CI pipeline runs `npm test` but not `npm audit`. Current `api/` dependencies are minimal (`express`, `pg`, `dotenv`, `luxon`) and have no known critical CVEs at time of review. However:
- `express@4.19.2` — check for any patches since; Express 5 is available
- `pg@8.18.0` — actively maintained, current
- `dotenv@17.3.1` — current
- No automated tracking of future vulnerability disclosures

**Remediation:**
Add `npm audit --audit-level=high` to the CI pipeline as a blocking step before deploy. Add Dependabot config (`.github/dependabot.yml`) for automated PRs on dependency updates.

---

#### L-05: `fly.toml` / deployment secrets not validated before production migration runs

**Affected files:** `.github/workflows/fly-deploy.yml`

**Why it matters:**
The CI workflow connects to the production Fly.io Postgres database via MPG proxy and runs Flyway migrations. If the workflow runs on a PR branch (not just `main`), it would run untested migration SQL against production. Currently the workflow trigger is `push to main on paths: api/**, migrations/**` — which is correct — but there is no explicit branch guard.

**Remediation:**
Add `if: github.ref == 'refs/heads/main'` to the deployment job to make the branch restriction explicit rather than relying solely on the `on.push.branches` trigger.

---

## D. Recommended Remediation Plan for Codex

### Files that will change

| File | Changes needed |
|---|---|
| `api/server.js` | Add Helmet, rate limiter, env validation, remove DB port from compose note |
| `api/src/middleware/auth.js` | Strengthen fallthrough; add failed-auth logging |
| `api/src/middleware/resolveUser.js` | Remove silent fallthrough — return 401 |
| `api/src/routes/loggedExercises.js` | Add `requireInternalToken` |
| `api/src/routes/prsFeed.js` | Add `requireInternalToken` |
| `api/src/routes/sessionHistoryMetrics.js` | Add `requireInternalToken` |
| `api/src/routes/adminExerciseCatalogue.js` | Add SQL safety validation before execute; add audit log write; separate generate from execute |
| `api/admin/*.html` | Switch `localStorage` → `sessionStorage`; add SRI to Chart.js; add session idle timeout |
| `api/package.json` | Add `helmet`, `express-rate-limit` |
| `docker-compose.yml` | Remove exposed Postgres port; remove MinIO default fallbacks |
| `.github/workflows/fly-deploy.yml` | Add `npm audit`, explicit branch guard |
| `migrations/` | New migration for `admin_audit_log` table |

### Migration needed?

Yes — one new Flyway versioned migration for `admin_audit_log`:
```sql
-- V25__admin_audit_log.sql
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id        bigserial    PRIMARY KEY,
  ts        timestamptz  NOT NULL DEFAULT now(),
  action    text         NOT NULL,
  entity    text         NOT NULL,
  entity_id text,
  detail    jsonb,
  ip        text
);
CREATE INDEX idx_audit_log_ts ON admin_audit_log (ts DESC);
CREATE INDEX idx_audit_log_entity ON admin_audit_log (entity, entity_id);
```

### Mobile/admin/API — which changes affect each?

| Layer | Changes required |
|---|---|
| **API** | All critical and high findings |
| **Admin UI** | H-02 (CSP), H-03 (sessionStorage), L-02 (SRI), L-01 (idle timeout) |
| **Mobile** | No code changes — C-01 fix (adding requireInternalToken) may break any direct mobile calls to those endpoints. Verify Bubble backend is the actual caller before deploying. |
| **CI/CD** | L-04 (npm audit), L-05 (branch guard) |
| **Infra** | M-07 (docker-compose) |

---

## E. Secure-by-Default Improvements

### E1. Shared validation utility (`api/src/utils/validate.js`)

Create a single validation module used by all routes:
```js
export function requireUuid(val, name) { ... }
export function requireEnum(val, allowed, name) { ... }
export function clampInt(val, min, max, def) { ... }
export function safeString(val, maxLen = 512) { ... }
export function requireNonEmpty(val, name) { ... }
```
Many routes have ad-hoc versions of these. Centralising them makes security audits easier.

### E2. Centralized auth middleware chain

Define a set of composed middleware chains in `api/src/middleware/chains.js`:
```js
export const publicRead  = [];
export const internalApi = [requireInternalToken];
export const internalWithUser = [requireInternalToken, resolveBubbleUser];
export const adminOnly   = [requireInternalToken]; // future: add adminRole check
```
Use these in `server.js` rather than inlining middleware per route. This makes it impossible to accidentally omit auth from a route.

### E3. Rate limiting strategy

```js
// api/src/middleware/rateLimits.js
import rateLimit from "express-rate-limit";

export const globalLimiter = rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true });
export const generationLimiter = rateLimit({ windowMs: 60_000, max: 5 });
export const adminLimiter = rateLimit({ windowMs: 60_000, max: 120 });
export const authFailLimiter = rateLimit({ windowMs: 15 * 60_000, max: 20, skipSuccessfulRequests: true });
```

### E4. Admin audit log helper

```js
// api/src/utils/auditLog.js
export async function auditLog(pool, { action, entity, entityId, detail, req }) {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? req.socket.remoteAddress;
  await pool.query(
    `INSERT INTO admin_audit_log (action, entity, entity_id, detail, ip) VALUES ($1,$2,$3,$4::jsonb,$5)`,
    [action, entity, entityId ?? null, JSON.stringify(detail ?? {}), ip]
  ).catch(err => console.error("audit log write failed:", err.message));
}
```
Calls to `auditLog()` should be fire-and-forget (never let audit log failure break a request).

### E5. SQL content safety validator

Before executing any admin-generated SQL:
```js
const FORBIDDEN_SQL_PATTERNS = [/\bDROP\b/i, /\bTRUNCATE\b/i, /\bGRANT\b/i, /\bREVOKE\b/i, /\bCOPY\b/i, /\/\*/, /xp_/i];
function assertSqlSafe(sql) {
  for (const pat of FORBIDDEN_SQL_PATTERNS) {
    if (pat.test(sql)) throw new Error(`Rejected: SQL contains forbidden pattern ${pat}`);
  }
}
```
This is a defence-in-depth measure — `sqlLiteral()` handles injection, this handles privilege escalation.

### E6. Dependency scanning in CI

`.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/api"
    schedule:
      interval: "weekly"
  - package-ecosystem: "npm"
    directory: "/mobile"
    schedule:
      interval: "weekly"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "monthly"
```

---

## F. Implementation Phases for Codex

### Phase 1 — Critical quick wins (highest risk, lowest effort)

**Estimated scope: 4 file changes, no migration**

**1a. Add `requireInternalToken` to three unprotected routes**

Files to edit: `api/server.js` or the three route files directly.

Add `requireInternalToken` middleware import and apply to:
- `GET /logged-exercises`
- `GET /exercise-summary`
- `GET /prs-feed`
- `GET /session-history-metrics`

Verify by calling each endpoint without the header — should return 401.

**1b. Fix `resolveBubbleUser` silent fallthrough**

File: `api/src/middleware/resolveUser.js`

Change the early return when `bubbleUserId` is missing from `next()` to:
```js
return res.status(401).json({ ok: false, code: "unauthorized", error: "Authentication required" });
```

**1c. Add environment variable startup validation**

File: `api/server.js`

Add before `app.listen()`: check that `ENGINE_KEY` is ≥ 32 characters and not a known weak default. Exit with a clear error message if not.

**1d. Remove Postgres port exposure from docker-compose**

File: `docker-compose.yml`

Remove or comment out `ports: "5432:5432"` from the `db` service. Add a comment explaining how to re-add it temporarily for local DB access.

---

### Phase 2 — Security middleware and rate limiting

**Estimated scope: `api/package.json` + `api/server.js`**

**2a. Add Helmet**

```
npm install helmet --save
```
Add `app.use(helmet())` as the first middleware in `server.js`. Add scoped CSP for admin routes (Chart.js CDN allowlist).

**2b. Add rate limiting**

```
npm install express-rate-limit --save
```
Create `api/src/middleware/rateLimits.js` with the four limiters defined in E3. Apply:
- `globalLimiter` to all routes
- `generationLimiter` to `POST /generate-plan-v2`
- `adminLimiter` to `app.use("/admin", ...)`
- `authFailLimiter` to `requireInternalToken` failures (pass through on success, count on 401)

**2c. Fix production error responses**

File: `api/server.js` generic error handler.

For `status >= 500` or unknown error classes, replace `err.message` with `"Internal server error"` in the response body. Keep full error in server logs only.

---

### Phase 3 — Admin UI hardening

**Estimated scope: all 4 admin HTML files**

**3a. Switch `localStorage` → `sessionStorage`**

In each admin HTML page, replace all `localStorage.setItem("adminToken", ...)` and `localStorage.getItem("adminToken")` with `sessionStorage` equivalents. Grep for `localStorage` across all admin HTML.

**3b. Add Subresource Integrity to Chart.js CDN load**

File: `api/admin/observability.html`

Generate the sha384 hash of the Chart.js bundle and add `integrity="sha384-[HASH]" crossorigin="anonymous"` to the script tag.

**3c. Add admin session idle timeout**

In each admin HTML page, add a 30-minute idle timer that clears `sessionStorage` and reloads the page, prompting for the token again.

**3d. Add admin audit log infrastructure**

1. Create migration `migrations/V25__admin_audit_log.sql`
2. Create `api/src/utils/auditLog.js`
3. Add `auditLog()` calls in `adminExerciseCatalogue.js` for: `queue-change`, `generate-migration`, `export-snapshot`
4. Add `auditLog()` calls in `adminConfigs.js` for: config save/update
5. Add `auditLog()` calls in `adminNarration.js` for: template save/update

**3e. Add SQL content safety check in exercise catalogue routes**

File: `api/src/routes/adminExerciseCatalogue.js`

Before the `BEGIN` transaction in `session/generate-migration`, validate all pending SQL strings against `FORBIDDEN_SQL_PATTERNS`. Return a 400 error with the specific pattern that was rejected.

---

### Phase 4 — Systemic hardening and CI

**Estimated scope: CI config, docker-compose, dependabot**

**4a. Add `npm audit` to CI pipeline**

File: `.github/workflows/fly-deploy.yml`

Add as a step after `npm ci`:
```yaml
- name: Security audit
  run: npm audit --audit-level=high
  working-directory: api
```

**4b. Add Dependabot configuration**

Create `.github/dependabot.yml` as defined in E6.

**4c. Add explicit branch guard to deploy job**

File: `.github/workflows/fly-deploy.yml`

Add `if: github.ref == 'refs/heads/main'` to the deploy job definition.

**4d. Remove MinIO weak default fallbacks**

File: `docker-compose.yml`

Change `${MINIO_ROOT_PASSWORD:-minioadmin}` to `${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}`. This will fail `docker compose up` if the variable is not set, preventing accidental runs with default credentials.

**4e. Add `X-Admin-Op` request logging**

For all admin mutation endpoints, log a structured JSON line:
```json
{ "ts": "...", "event": "admin.mutation", "action": "...", "entity_id": "...", "ip": "..." }
```
This is lightweight and does not require the audit DB table from Phase 3 to be complete.

---

## G. Risks, Anti-Patterns, and Open Questions

### G1. The fundamental auth model is not wrong — but it is fragile

The Bubble.io integration pattern (Bubble authenticates, forwards `bubble_user_id` alongside `ENGINE_KEY`) is a legitimate backend-to-backend auth design. The vulnerabilities are about:
1. **Routes missing the token guard** (C-01) — fixable in an hour
2. **Token strength and lifecycle** (C-04) — fixable with ops procedure

Do not over-engineer this by adding JWT. The right fix is: every route that touches user data must require the internal token; the token must be strong and rotated; the token must be treated as a secret with the same rigor as a DB password.

### G2. The admin SQL generation pattern is inherently risky — accept it or eliminate it

The pattern of generating SQL from admin-edited data, writing it to a migration file, and executing it is high-risk by design. `sqlLiteral()` prevents injection, but the migration file now becomes an attack artifact. Two options:

**Option A (keep but harden):** Add SQL content validation (Phase 3e), separate generate from execute (human must explicitly confirm execution), add audit logging. Acceptable risk for a single-operator admin tool.

**Option B (eliminate over time):** Replace the SQL generation pattern with proper Postgres `pool.query()` calls with parameterized statements, and remove the migration file writer entirely. Generate the repeatable migration as a pure database dump at snapshot time. This is the architecturally cleaner approach but requires more refactoring.

Recommend Option A now, plan Option B for a future sprint.

### G3. The observability dashboard exposes personal fitness data

`step1_stats_json` contains equipment profile, fitness rank, and selected exercise IDs — collectively a fitness data profile. Under GDPR/CCPA this is personal data. The admin dashboard aggregates it with no user consent or access log. This is low risk today (single operator, dev data) but must be addressed before regulated user data is stored.

**Open question:** Does the deployment jurisdiction require a Data Processing Agreement or similar? If yes, the observability data storage and access needs formal review before production.

### G4. Mobile parsing robustness is not verified in this review

The emitter produces pipe-delimited rows (`PRG|`, `WEEK|`, `DAY|`, `SEG|`, `EX|`) consumed by the mobile app. The mobile app's parsing code is not in this repository. If the mobile parser trusts field positions without length/type validation, a malformed generation run could cause mobile crashes or unexpected behaviour. This should be assessed in a separate mobile security review using OWASP MASTG.

### G5. Secret rotation runbook does not exist

There is no documented procedure for rotating `ENGINE_KEY` if it leaks. Given that this token protects all user data, a runbook should exist:
1. Generate new token
2. Update Fly.io secrets (`fly secrets set ENGINE_KEY=<new>`)
3. Update Bubble backend environment variable
4. Update local `.env` files
5. Verify health check passes with new token
6. Revoke / discard old token

This should be documented in `docs/` before production launch.

### G6. Dependency risk is low today but unmonitored

Current dependencies (`express`, `pg`, `dotenv`, `luxon`) are minimal and well-maintained. The real risk is going months without running `npm audit` and accumulating unpatched transitive vulnerabilities. Phase 4a (CI audit gate) closes this gap.
