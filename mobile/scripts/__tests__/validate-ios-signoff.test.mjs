import test from "node:test";
import assert from "node:assert/strict";
import { REQUIRED_CHECKS, validateSignoff } from "../validate-ios-signoff.mjs";
const options = { buildId: "11111111-1111-4111-8111-111111111111", sourceCommit: "a".repeat(40), now: Date.parse("2026-09-23T12:00:00Z") };
function record() { return { schemaVersion: 1, buildId: options.buildId, sourceCommit: options.sourceCommit, tester: "Release tester", appVersion: "1.0.0", buildNumber: "42", deviceModel: "iPhone 15", iosVersion: "18.5", physicalDevice: true, testedAt: "2026-09-23T10:00:00Z", evidenceUrl: "https://github.com/example/repo/issues/1", notificationTapThroughEnabled: false, checks: { ...Object.fromEntries(REQUIRED_CHECKS.map(key => [key, "pass"])), notification_tap_through: "disabled" } }; }
test("accepts a complete matching physical-device sign-off", () => assert.deepEqual(validateSignoff(record(), options), []));
test("rejects missing, failed and skipped required checks", () => {
  for (const value of [undefined, "fail", "skipped"]) { const r = record(); r.checks.auth_keychain = value; assert.ok(validateSignoff(r, options).length); }
  assert.ok(validateSignoff({}, options).length);
});
test("rejects another build, commit, simulator and stale/future sign-offs", () => {
  for (const patch of [{ buildId: "other" }, { sourceCommit: "b".repeat(40) }, { physicalDevice: false }, { testedAt: "2026-09-01" }, { testedAt: "2027-01-01" }, { evidenceUrl: "" }]) assert.ok(validateSignoff({ ...record(), ...patch }, options).length);
});
test("enabled notification tap-through needs a passing device check", () => {
  const r = { ...record(), notificationTapThroughEnabled: true };
  assert.ok(validateSignoff(r, options).length);
  r.checks.notification_tap_through = "pass";
  assert.deepEqual(validateSignoff(r, options), []);
});
