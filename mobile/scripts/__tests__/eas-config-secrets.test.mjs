import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const config = JSON.parse(readFileSync(new URL("../../eas.json", import.meta.url), "utf8"));
test("EAS profiles keep Sentry credentials outside committed config", () => {
  for (const profile of Object.values(config.build)) {
    for (const key of ["EXPO_PUBLIC_SENTRY_DSN", "SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT"]) {
      assert.equal(Object.hasOwn(profile.env ?? {}, key), false, `${key} must be supplied through EAS`);
    }
  }
});
test("each build profile sets its Sentry environment", () => {
  for (const [profile, environment] of Object.entries({ development: "development", preview: "beta", production: "production" })) {
    assert.equal(config.build[profile].env.EXPO_PUBLIC_SENTRY_ENVIRONMENT, environment);
  }
});
