import test from "node:test";
import assert from "node:assert/strict";
import { createReferralCodeHandler, createReferralStatsHandler } from "../src/routes/referral.js";

function makeReq(overrides = {}) {
  return {
    auth: { user_id: "user-abc" },
    request_id: "req-1",
    ...overrides,
  };
}

function makeRes() {
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

test("GET referral-code returns existing code without regenerating", async () => {
  let updateCalled = false;
  const db = {
    async query(sql) {
      if (/SELECT referral_code/i.test(sql)) {
        return { rows: [{ referral_code: "ABCDEFG2" }] };
      }
      if (/UPDATE app_user SET referral_code/i.test(sql)) {
        updateCalled = true;
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const res = makeRes();
  await createReferralCodeHandler(db)(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.code, "ABCDEFG2");
  assert.ok(res.body.shareUrl.includes("ABCDEFG2"));
  assert.equal(updateCalled, false);
});

test("GET referral-code lazily generates and persists a code when none exists", async () => {
  let updateCalled = false;
  const db = {
    async query(sql) {
      if (/SELECT referral_code/i.test(sql)) return { rows: [{ referral_code: null }] };
      if (/UPDATE app_user SET referral_code/i.test(sql)) {
        updateCalled = true;
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const res = makeRes();
  await createReferralCodeHandler(db)(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.ok(typeof res.body.code === "string" && res.body.code.length === 8);
  assert.ok(updateCalled, "expected UPDATE to persist the new code");
});

test("GET referral-code returns 500 when no user_id in token", async () => {
  const db = { async query() { throw new Error("should not be called"); } };
  const res = makeRes();

  await createReferralCodeHandler(db)(makeReq({ auth: {} }), res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
});

test("GET referral-stats returns zero counts when user has no referrals", async () => {
  const db = {
    async query() {
      return { rows: [{ total_referrals: "0", conversions: "0", rewards_granted: "0" }] };
    },
  };

  const res = makeRes();
  await createReferralStatsHandler(db)(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    totalReferrals: 0,
    conversions: 0,
    rewardsGranted: 0,
  });
});

test("GET referral-stats returns correct counts when conversions exist", async () => {
  const db = {
    async query() {
      return { rows: [{ total_referrals: "3", conversions: "2", rewards_granted: "1" }] };
    },
  };

  const res = makeRes();
  await createReferralStatsHandler(db)(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    totalReferrals: 3,
    conversions: 2,
    rewardsGranted: 1,
  });
});

test("GET referral-stats queries only for the authenticated user (isolation)", async () => {
  let capturedParams;
  const db = {
    async query(_sql, params) {
      capturedParams = params;
      return { rows: [{ total_referrals: "0", conversions: "0", rewards_granted: "0" }] };
    },
  };

  const res = makeRes();
  await createReferralStatsHandler(db)(makeReq({ auth: { user_id: "user-xyz" } }), res);

  assert.ok(capturedParams?.includes("user-xyz"), "query must be scoped to the requesting user");
});

test("GET referral-stats returns 500 when no user_id in token", async () => {
  const db = { async query() { throw new Error("should not be called"); } };
  const res = makeRes();

  await createReferralStatsHandler(db)(makeReq({ auth: {} }), res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
});
