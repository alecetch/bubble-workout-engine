import test from "node:test";
import assert from "node:assert/strict";
import { createReferralCodeHandler, createReferralStatsHandler } from "../referral.js";

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

test("referral code handler returns existing code and share url", async () => {
  const handler = createReferralCodeHandler({
    async query() {
      return { rows: [{ referral_code: "ABCDEFG2" }] };
    },
  });
  const req = { auth: { user_id: "user-1" }, request_id: "req-1" };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.code, "ABCDEFG2");
  assert.equal(typeof res.body.shareUrl, "string");
  assert.match(res.body.shareUrl, /\/ref\/ABCDEFG2$/);
});

test("referral code handler lazily generates a code for pre-migration users", async () => {
  const calls = [];
  const handler = createReferralCodeHandler({
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT referral_code/i.test(sql)) {
        return { rows: [{ referral_code: null }] };
      }
      return { rowCount: 1 };
    },
  });
  const req = { auth: { user_id: "user-2" }, request_id: "req-2" };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(typeof res.body.code, "string");
  assert.equal(res.body.code.length, 8);
  assert.equal(calls.some((call) => /UPDATE app_user SET referral_code/i.test(call.sql)), true);
});

test("referral stats handler returns zeros when user has no referrals", async () => {
  const handler = createReferralStatsHandler({
    async query() {
      return { rows: [{ total_referrals: 0, conversions: 0, rewards_granted: 0 }] };
    },
  });
  const req = { auth: { user_id: "user-3" }, request_id: "req-3" };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    totalReferrals: 0,
    conversions: 0,
    rewardsGranted: 0,
  });
});
