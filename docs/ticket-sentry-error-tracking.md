---
name: Sentry error tracking
description: Add production error alerting via Sentry.io
type: project
---

# Ticket: Add Sentry Error Tracking

**Priority:** Medium — production errors are currently discovered by users, not alerts
**Spec:** `docs/codex-prompts-sentry-error-tracking.md` (ready to run)

## Background

The Fly.io health check (`fly.toml`) polls `/health` every 10s and restarts unresponsive
instances — total outages are covered. What is not covered:

- 5xx errors from route handlers (app responds, but with errors)
- Unhandled exceptions reaching the Express error handler
- Silent regressions between health check intervals

## Human pre-requisite (before running Codex spec)

1. Create a free account at sentry.io
2. Create a new project → select "Node.js" platform
3. Copy the DSN (`https://xxxxx@o0.ingest.sentry.io/...`)
4. Set the secret on Fly.io:
   ```bash
   fly secrets set SENTRY_DSN="<dsn>" --app bubble-workout-api
   ```
5. Optionally add to `api/.env` for local verification

## What the Codex spec does

- `npm install @sentry/node` in `api/`
- `Sentry.init()` in `server.js` with `enabled: !!process.env.SENTRY_DSN` (no-op in CI/dev)
- `Sentry.setupExpressErrorHandler(app)` before the existing generic error handler
- Zero test regressions — Sentry is disabled without a DSN

## Post-deploy verification

- Trigger a test error; confirm it appears in Sentry dashboard within 30s
- Configure alert rule: "When a new issue is created → notify via email" (Sentry UI)
