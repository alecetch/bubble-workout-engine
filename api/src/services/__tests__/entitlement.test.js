import test from "node:test";
import assert from "node:assert/strict";
import { computeEntitlement, STALE_ACTIVE_GRACE_MS } from "../entitlement.js";

const now = new Date("2026-10-27T12:00:00Z");
const date = offset => new Date(now.getTime() + offset).toISOString();
for (const [stored, expiry, expectedStatus, entitled, paid, renew] of [
  ["trialing", 1000, "trialing", true, false, null],
  ["trialing", 0, "trialing", true, false, null],
  ["trialing", -1, "expired", false, false, null],
  ["active", null, "active", true, true, true],
  ["active", 1000, "active", true, true, true],
  ["active", -STALE_ACTIVE_GRACE_MS, "active", true, true, true],
  ["active", -STALE_ACTIVE_GRACE_MS - 1, "expired", false, true, true],
  ["cancelled", 1000, "cancelled", true, true, false],
  ["cancelled", 0, "expired", false, false, false],
  ["cancelled", -1000, "expired", false, false, false],
  ["cancelled", null, "expired", false, false, false],
  ["billing_issue", 1000, "billing_issue", true, true, true],
  ["billing_issue", 0, "expired", false, false, true],
  ["billing_issue", -1000, "expired", false, false, true],
  ["expired", 1000, "expired", false, false, false],
]) {
  test(`${stored} with expiry ${expiry} follows the access rule`, () => {
    const row = { subscription_status: stored, [stored === "trialing" ? "trial_expires_at" : "subscription_expires_at"]: expiry == null ? null : date(expiry) };
    assert.deepEqual(computeEntitlement(row, now), { status: expectedStatus, isEntitled: entitled, isPaid: paid,
      willRenew: renew, billingIssue: stored === "billing_issue" });
  });
}

test("absent/unknown statuses and invalid trial dates cannot grant access", () => {
  for (const row of [null, {}, { subscription_status: "unknown" }, { subscription_status: "trialing", trial_expires_at: "bad" }]) {
    assert.equal(computeEntitlement(row, now).isEntitled, false);
  }
});
