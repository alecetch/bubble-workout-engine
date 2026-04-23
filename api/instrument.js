import * as Sentry from "@sentry/node";

// Sentry is no-op when SENTRY_DSN is absent (dev/test/CI environments).
Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  sampleRate: 1.0,
});

// Sentry alert policies (configured in the Sentry dashboard - not enforced in code):
//   - Issue alert:    fires on first occurrence of any new issue (default behaviour, confirmed enabled).
//   - Metric alert:   fires when http.server_error count > 5 in any 5-minute rolling window.
//   - Inbound filter: 401 Unauthorized and 403 Forbidden events from requireAuth are dropped
//                     (expected errors - suppressed to avoid polluting the issue list).
//   - Environments:   NODE_ENV is passed to Sentry.init so production and development events
//                     are separated in the dashboard.
