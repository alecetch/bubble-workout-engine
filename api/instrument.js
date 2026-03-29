import * as Sentry from "@sentry/node";

// Sentry is no-op when SENTRY_DSN is absent (dev/test/CI environments).
Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || "development",
  sampleRate: 1.0,
});
