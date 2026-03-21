# Codex Spec: GitHub Actions CI Pipeline

**Why:** The test suite has 191 tests and is growing. Currently the only automated gate is
inside `fly-deploy.yml` — which runs `npm test` without a database before deploying to
production. That means:
1. Tests only run on pushes to `main`, not on PRs (no gate before merge)
2. Integration tests that require Postgres skip silently on every run
3. The `generateProgramV2.integration.test.js` smoke test has never run in CI

This spec adds a dedicated CI workflow that:
- Runs on every push and PR targeting `main`
- Runs tests with a real Postgres service container so integration tests execute
- Gates PRs — merging a broken test is impossible without bypassing the check

---

## Context for Codex

Read before starting:
- `.github/workflows/fly-deploy.yml` — existing workflow structure, Node version, test command
- `api/src/db.js` — DB connection reads `DATABASE_URL` or `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`
- `api/test/generateProgramV2.integration.test.js` — the skip-when-no-DB pattern to replace with real DB
- `api/test/runPipeline.repRules.integration.test.js` — another integration test that needs DB

The existing `fly-deploy.yml` must NOT be modified. The new CI workflow is additive.

---

## Prompt 1 — Create `.github/workflows/ci.yml`

Create `.github/workflows/ci.yml`.

### Trigger

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

### Job: `test`

```yaml
jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: workout
          POSTGRES_PASSWORD: workout
          POSTGRES_DB: workout_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
```

### Steps

**1. Checkout**
```yaml
- uses: actions/checkout@v4
```

**2. Setup Node (match fly-deploy.yml — Node 20)**
```yaml
- uses: actions/setup-node@v4
  with:
    node-version: "20"
    cache: "npm"
    cache-dependency-path: api/package-lock.json
```

**3. Install dependencies**
```yaml
- name: Install API dependencies
  working-directory: api
  run: npm ci
```

**4. Run Flyway migrations**

The test DB needs the full schema before integration tests can run. Use the Flyway Docker
image directly — no Fly.io proxy needed here:

```yaml
- name: Run Flyway migrations
  run: |
    docker run --rm \
      --network host \
      -v "${{ github.workspace }}/migrations:/flyway/sql" \
      flyway/flyway:10 \
      -url="jdbc:postgresql://127.0.0.1:5432/workout_test" \
      -user=workout \
      -password=workout \
      -locations=filesystem:/flyway/sql \
      migrate
```

**5. Run tests with DB env vars**
```yaml
- name: Run tests
  working-directory: api
  env:
    PGHOST: 127.0.0.1
    PGPORT: 5432
    PGUSER: workout
    PGPASSWORD: workout
    PGDATABASE: workout_test
    NODE_ENV: test
    INTERNAL_API_TOKEN: ci-test-token
    ENGINE_KEY: ci-test-key
  run: npm test -- --test-concurrency=1
```

**Why `--test-concurrency=1`:** The integration tests seed/cleanup rows using the same test
user ID pattern (`smoke-test-user-${Date.now()}`). With concurrency > 1, parallel runs from
different test files could collide. This matches the existing local test command.

**Why `INTERNAL_API_TOKEN` and `ENGINE_KEY`:** The auth middleware tests use `withEnv()` to
set/restore these values within each test. Setting them in the environment ensures no test
fails because the values are completely absent at startup.

---

## Expected outcome

```
✅  push to main         → ci.yml triggers, tests run with DB, pass
✅  PR to main           → ci.yml triggers, PR is blocked until tests pass
✅  integration tests    → no longer skip (Postgres is available)
✅  fly-deploy.yml       → unchanged, still deploys after CI passes
```

After adding this workflow, the `generateProgramV2.integration.test.js` smoke test should
report `1 skipped → 0 skipped` in CI runs.

---

## Verification

1. Push the new workflow file to a branch and open a PR
2. Confirm the `test` job appears in the PR checks
3. Confirm the test count matches local run (191+, 0 failing, **0 skipped**)

If the Flyway migration step fails:
- Confirm `postgres:16` service is healthy before Flyway runs (the `options:` health check handles this)
- Check that all migration files in `migrations/` are valid SQL (`V*.sql` and `R__*.sql`)
- If a repeatable migration fails, check that its idempotency guard (`WHERE NOT EXISTS`) is present

If tests still show 1 skipped after adding DB env vars:
- Confirm `PGHOST=127.0.0.1` (not `localhost`) — the Postgres service container binds to
  `127.0.0.1` on the host network in GitHub Actions
- Confirm the `generateProgramV2.integration.test.js` connectivity check uses
  `await pool.query("SELECT 1")` which will succeed once `PGHOST` is set correctly

---

## Out of scope

- Caching `node_modules` across runs (covered by `cache: "npm"` on setup-node)
- Running mobile tests (separate repo)
- Linting / type-checking (not configured in this project)
- Security scanning (handled by `npm audit` in `fly-deploy.yml`)
