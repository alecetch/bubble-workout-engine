import test from "node:test";
import assert from "node:assert/strict";
import { getStartupEnvErrors, isWeakSecret } from "../startupEnv.js";

const validEnv = {
  INTERNAL_API_TOKEN: "internal-token-test-at-least-16-chars",
  JWT_SECRET: "jwt-test-secret-at-least-32-characters",
  JWT_ISSUER: "startup-test",
  PGHOST: "localhost", PGUSER: "test", PGPASSWORD: "test-password", PGDATABASE: "workout_test",
};
test("startup accepts valid configuration with ENGINE_KEY unset", () => {
  assert.equal("ENGINE_KEY" in validEnv, false);
  assert.deepEqual(getStartupEnvErrors(validEnv), []);
});
test("startup rejects missing or weak internal token", () => {
  for (const INTERNAL_API_TOKEN of [undefined, "", "change-me", "short"]) {
    assert.deepEqual(getStartupEnvErrors({ ...validEnv, INTERNAL_API_TOKEN }), ["INTERNAL_API_TOKEN is missing, too short, or uses a weak default."]);
  }
});
test("startup retains JWT secret threshold and issuer requirement", () => {
  assert.deepEqual(getStartupEnvErrors({ ...validEnv, JWT_SECRET: "x".repeat(31), JWT_ISSUER: "" }), [
    "JWT_SECRET is missing, too short, or uses a weak default.", "JWT_ISSUER is missing.",
  ]);
  assert.deepEqual(getStartupEnvErrors({ ...validEnv, JWT_SECRET: "x".repeat(32), INTERNAL_API_TOKEN: "x".repeat(16) }), []);
});
test("startup supports DATABASE_URL and preserves URL validation messages", () => {
  const env = { INTERNAL_API_TOKEN: validEnv.INTERNAL_API_TOKEN, JWT_SECRET: validEnv.JWT_SECRET, JWT_ISSUER: validEnv.JWT_ISSUER };
  assert.deepEqual(getStartupEnvErrors({ ...env, DATABASE_URL: "postgres://test:test-password@localhost/workout_test" }), []);
  for (const [DATABASE_URL, error] of [
    ["not a url", "DATABASE_URL is present but is not a valid URL."],
    ["https://test:test-password@localhost/workout_test", "DATABASE_URL must use postgres:// or postgresql://."],
    ["postgres://test:test-password@localhost/", "DATABASE_URL must include host and database name."],
    ["postgres://test:short@localhost/workout_test", "DATABASE_URL contains a missing, too short, or weak database password."],
  ]) assert.deepEqual(getStartupEnvErrors({ ...env, DATABASE_URL }), [error]);
});
test("startup preserves individual PG settings checks", () => {
  assert.deepEqual(getStartupEnvErrors({ ...validEnv, PGHOST: "" }), ["Database configuration is missing. Set DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE."]);
  assert.deepEqual(getStartupEnvErrors({ ...validEnv, PGPASSWORD: "short" }), ["PGPASSWORD is too short or uses a weak default."]);
});
test("weak secret comparison trims and rejects defaults case insensitively", () => {
  assert.equal(isWeakSecret(" PASSWORD ", 8), true);
  assert.equal(isWeakSecret("a".repeat(12)), false);
  assert.equal(isWeakSecret("a".repeat(11)), true);
});
