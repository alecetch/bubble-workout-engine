import assert from "node:assert/strict";
import test from "node:test";
import { createUserEntitlementHandler } from "../userEntitlement.js";

const USER_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

for (const status of ["cancelled", "billing_issue"]) {
  test(`${status} retains paid access and exposes additive fields`, async () => {
    const row = { subscription_status: status, subscription_expires_at: futureDate(5), trial_expires_at: pastDate(5) };
    const res = mockRes();
    await createUserEntitlementHandler({ query: async () => ({ rows: [row] }) })({ auth: { user_id: USER_ID } }, res);
    assert.equal(res.body.is_active, true);
    assert.equal(res.body.is_premium, true);
    assert.equal(res.body.will_renew, status === "billing_issue");
    assert.equal(res.body.billing_issue, status === "billing_issue");
    assert.equal(res.body.subscription_status, status === "billing_issue" ? "active" : "cancelled");
  });
}

test("lapsed cancelled state is lazily expired with a guarded write", async () => {
  const row = { subscription_status: "cancelled", subscription_expires_at: pastDate(5) };
  let updates = 0;
  const res = mockRes();
  await createUserEntitlementHandler({ query: async (sql, params) => {
    if (sql.startsWith("UPDATE")) {
      updates++;
      assert.match(sql, /subscription_status = \$2/);
      assert.match(sql, /subscription_expires_at <= \$3/);
      assert.equal(params[1], "cancelled");
      return { rowCount: 1 };
    }
    return { rows: [row] };
  } })({ auth: { user_id: USER_ID } }, res);
  assert.equal(updates, 1);
  assert.equal(res.body.subscription_status, "expired");
  assert.equal(res.body.is_premium, false);
});

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

function pastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

test("userEntitlement: active trialing user returns is_active true and trial_days_remaining > 0", async () => {
  const trialExpiresAt = futureDate(10);
  const db = {
    async query() {
      return {
        rows: [{
          subscription_status: "trialing",
          trial_expires_at: trialExpiresAt,
          subscription_expires_at: null,
          physique_consent_given: false,
        }],
      };
    },
  };
  const handler = createUserEntitlementHandler(db);
  const req = { auth: { user_id: USER_ID } };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.subscription_status, "trialing");
  assert.equal(res.body.is_active, true);
  assert.ok(res.body.trial_days_remaining > 0);
  assert.equal(res.body.physique_consent_given, false);
});

test("userEntitlement: trialing user with expired trial_expires_at returns is_active false and fires lazy UPDATE", async () => {
  const trialExpiresAt = pastDate(2);
  let updateFired = false;
  const db = {
    async query(sql) {
      if (sql.includes("UPDATE")) {
        updateFired = true;
        return { rowCount: 1 };
      }
      return {
        rows: [{
          subscription_status: "trialing",
          trial_expires_at: trialExpiresAt,
          subscription_expires_at: null,
          physique_consent_given: false,
        }],
      };
    },
  };
  const handler = createUserEntitlementHandler(db);
  const req = { auth: { user_id: USER_ID } };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.subscription_status, "expired");
  assert.equal(res.body.is_active, false);
  assert.equal(res.body.trial_days_remaining, 0);
  assert.equal(updateFired, true, "lazy UPDATE must fire when trial has expired");
});

test("userEntitlement: active subscription user returns is_active true and trial_days_remaining null", async () => {
  const db = {
    async query() {
      return {
        rows: [{
          subscription_status: "active",
          trial_expires_at: pastDate(7),
          subscription_expires_at: futureDate(30),
          physique_consent_given: true,
        }],
      };
    },
  };
  const handler = createUserEntitlementHandler(db);
  const req = { auth: { user_id: USER_ID } };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.subscription_status, "active");
  assert.equal(res.body.is_active, true);
  assert.equal(res.body.trial_days_remaining, null);
  assert.equal(res.body.physique_consent_given, true);
});

test("userEntitlement: unknown user returns 404", async () => {
  const db = {
    async query() {
      return { rows: [] };
    },
  };
  const handler = createUserEntitlementHandler(db);
  const req = { auth: { user_id: USER_ID } };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.ok, false);
});
