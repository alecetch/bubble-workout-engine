import assert from "node:assert/strict";
import test from "node:test";
import {
  findLocalhostProductionEnvErrors,
  validateProductionEnv,
} from "../validateProductionEnv.js";

test("non-production environments are never checked", () => {
  assert.deepEqual(findLocalhostProductionEnvErrors({ NODE_ENV: "development" }), []);
  assert.deepEqual(findLocalhostProductionEnvErrors({ NODE_ENV: "test" }), []);
});

test("production with APP_DOMAIN unset returns an error", () => {
  const errors = findLocalhostProductionEnvErrors({ NODE_ENV: "production" });

  assert.ok(errors.length >= 1);
  assert.ok(errors.some((error) => error.includes("APP_DOMAIN")));
});

test("production with APP_DOMAIN set to a local host returns an error", () => {
  for (const appDomain of [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://0.0.0.0:3000",
  ]) {
    const errors = findLocalhostProductionEnvErrors({
      NODE_ENV: "production",
      APP_DOMAIN: appDomain,
    });

    assert.ok(errors.some((error) => error.includes("APP_DOMAIN")), appDomain);
  }
});

test("production with valid public customer-facing URLs returns no errors", () => {
  const errors = findLocalhostProductionEnvErrors({
    NODE_ENV: "production",
    APP_DOMAIN: "https://www.getforma.fit",
    FORMA_APP_BASE_URL: "https://www.getforma.fit",
    BASE_URL: "https://www.getforma.fit",
  });

  assert.deepEqual(errors, []);
});

test("production with FORMA_APP_BASE_URL unset uses its safe fallback", () => {
  const errors = findLocalhostProductionEnvErrors({
    NODE_ENV: "production",
    APP_DOMAIN: "https://www.getforma.fit",
  });

  assert.deepEqual(errors, []);
});

test("validateProductionEnv throws when errors exist and does not throw for valid production env", () => {
  assert.throws(
    () => validateProductionEnv({
      NODE_ENV: "production",
      APP_DOMAIN: "http://localhost:3000",
    }),
    /Refusing to start in production/,
  );

  assert.doesNotThrow(() => validateProductionEnv({
    NODE_ENV: "production",
    APP_DOMAIN: "https://www.getforma.fit",
    FORMA_APP_BASE_URL: "https://www.getforma.fit",
    BASE_URL: "https://www.getforma.fit",
  }));
});
