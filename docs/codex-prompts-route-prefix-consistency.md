# Codex Spec: Route Prefix Consistency

**Problem:** Five history routers are mounted without a prefix, producing URLs at `/v1/history/*`.
All other mobile-facing routes are at `/api/*`. A developer adding a new route has no clear convention
to follow, and documenting the API surface is inconsistent.

**Current URL map (the inconsistency):**
```
GET /v1/history/programs            ← no /api prefix (historyProgramsRouter)
GET /v1/history/timeline            ← no /api prefix (historyTimelineRouter)
GET /v1/history/overview            ← no /api prefix (historyOverviewRouter)
GET /v1/history/personal-records    ← no /api prefix (historyPersonalRecordsRouter)
GET /v1/history/exercise/:exerciseId ← no /api prefix (historyExerciseRouter)

GET /api/session-history-metrics    ← /api prefix (sessionHistoryMetricsRouter)
GET /api/prs-feed                   ← /api prefix
GET /api/logged-exercises           ← /api prefix
POST /api/segment-log               ← /api prefix
```

**Target canonical URLs:**
```
GET /api/v1/history/programs
GET /api/v1/history/timeline
GET /api/v1/history/overview
GET /api/v1/history/personal-records
GET /api/v1/history/exercise/:exerciseId
```

**Strategy:** Add the canonical `/api`-prefixed mounts while keeping the old root mounts as
backward-compat aliases. Bubble clients continue to work on the old paths during their migration
window. The old aliases are clearly marked for removal.

---

## Context for Codex

Read before starting:
- `api/server.js` lines 485–501 — all router mounts
- `api/src/routes/historyPrograms.js` line 97 — route defined as `"/v1/history/programs"`
- `api/src/routes/historyTimeline.js` line 183 — `"/v1/history/timeline"`
- `api/src/routes/historyOverview.js` line 312 — `"/v1/history/overview"`
- `api/src/routes/historyPersonalRecords.js` line 97 — `"/v1/history/personal-records"`
- `api/src/routes/historyExercise.js` line 153 — `"/v1/history/exercise/:exerciseId"`

Key facts:
- The route path strings (e.g. `"/v1/history/programs"`) live inside the router files, not at the
  mount site. When a router defining `"/v1/history/programs"` is mounted at `"/api"`, Express
  resolves it as `GET /api/v1/history/programs`. No router file needs to change.
- All five route test files (`api/test/history*.route.test.js`) call the handler function directly
  — they never use a URL string — so no test file needs updating.

---

## Prompt 1 — Add Canonical Mounts + Backward-Compat Aliases in server.js

### Task

Open `api/server.js`. Find the current router mount block (lines ~485–501):

```js
app.use("/api", segmentLogRouter);
app.use("/api", readProgramRouter);
app.use("/api", debugAllowedExercisesRouter);
app.use(historyProgramsRouter);
app.use(historyTimelineRouter);
app.use(historyOverviewRouter);
app.use(historyPersonalRecordsRouter);
app.use(historyExerciseRouter);
app.use("/api", sessionHistoryMetricsRouter);
app.use("/api", prsFeedRouter);
app.use("/api", loggedExercisesRouter);
app.use("/api/admin", ...adminOnly, adminCoverageRouter);
app.use("/admin/api/observability", ...adminOnly, adminObservabilityRouter);
app.use("/admin", ...adminOnly, adminConfigsRouter);
app.use("/admin", ...adminOnly, adminExerciseCatalogueRouter);
app.use("/admin", ...adminOnly, adminNarrationRouter);
app.use(generateProgramV2Router);
```

Replace it with the following block. The only changes are to the five history router mounts:
1. Each now has a canonical `/api`-prefixed mount.
2. Each retains its original root-level mount, marked as a deprecated backward-compat alias.

```js
app.use("/api", segmentLogRouter);
app.use("/api", readProgramRouter);
app.use("/api", debugAllowedExercisesRouter);

// Canonical /api-prefixed mounts (new).
app.use("/api", historyProgramsRouter);       // → GET /api/v1/history/programs
app.use("/api", historyTimelineRouter);        // → GET /api/v1/history/timeline
app.use("/api", historyOverviewRouter);        // → GET /api/v1/history/overview
app.use("/api", historyPersonalRecordsRouter); // → GET /api/v1/history/personal-records
app.use("/api", historyExerciseRouter);        // → GET /api/v1/history/exercise/:exerciseId

// DEPRECATED backward-compat aliases — remove after Bubble client is updated to /api/v1/history/*.
app.use(historyProgramsRouter);       // → GET /v1/history/programs
app.use(historyTimelineRouter);        // → GET /v1/history/timeline
app.use(historyOverviewRouter);        // → GET /v1/history/overview
app.use(historyPersonalRecordsRouter); // → GET /v1/history/personal-records
app.use(historyExerciseRouter);        // → GET /v1/history/exercise/:exerciseId

app.use("/api", sessionHistoryMetricsRouter);
app.use("/api", prsFeedRouter);
app.use("/api", loggedExercisesRouter);
app.use("/api/admin", ...adminOnly, adminCoverageRouter);
app.use("/admin/api/observability", ...adminOnly, adminObservabilityRouter);
app.use("/admin", ...adminOnly, adminConfigsRouter);
app.use("/admin", ...adminOnly, adminExerciseCatalogueRouter);
app.use("/admin", ...adminOnly, adminNarrationRouter);
app.use(generateProgramV2Router);
```

Do not change any other part of server.js. Do not change any route file.

### Verification

After the change, run:
```bash
node --check api/server.js
```

Then run the full test suite to confirm no regressions:
```bash
cd api && npm test -- --test-concurrency=1
```

Manually confirm both old and new URLs resolve by starting the server and curling:
```bash
# Canonical (new)
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/api/v1/history/programs?bubble_user_id=test" \
  -H "x-engine-key: $ENGINE_KEY"
# Expected: 200 or 401 (not 404)

# Legacy alias (backward compat — should still work)
curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/v1/history/programs?bubble_user_id=test" \
  -H "x-engine-key: $ENGINE_KEY"
# Expected: 200 or 401 (not 404)
```

---

## Out of Scope

The following routes are also at the root level but are intentionally excluded from this change:

| Route | Reason excluded |
|-------|----------------|
| `POST /generate-plan-v2` | Primary Bubble backend integration — high-risk move, separate coordination |
| `GET /me`, `POST /client-profiles`, `PATCH /users/me` | Just migrated in the profile persistence work — address in a dedicated PR |
| `GET /health` | Infrastructure/platform route — no client contract |
| `GET /reference-data`, `GET /media-assets`, `GET /equipment-items` | Read-only reference endpoints — low urgency |

The admin split (`/admin/*` vs `/api/admin/*` vs `/admin/api/observability/*`) is a separate
inconsistency with a different risk profile. Do not touch admin routes.

---

## Followup (after Bubble confirms migration)

Once Bubble updates all clients to use the `/api/v1/history/*` paths, remove the five
backward-compat aliases in a single clean-up PR. The removal diff will be exactly:

```js
// DELETE these five lines:
app.use(historyProgramsRouter);
app.use(historyTimelineRouter);
app.use(historyOverviewRouter);
app.use(historyPersonalRecordsRouter);
app.use(historyExerciseRouter);
```
