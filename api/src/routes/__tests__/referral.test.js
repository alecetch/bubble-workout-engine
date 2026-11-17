import test from "node:test";
import assert from "node:assert/strict";
import { createReferralCodeHandler, createReferralStatsHandler } from "../referral.js";
import { getBrand } from '../../config/brand.js';
import { randomUUID } from 'node:crypto';
import { DATABASE_SKIP, closeDb, withUsers } from '../../../testSupport/entitlementFixtures.js';
test.after(closeDb);

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
    rewardsPending: 0,
    rewardsCapped: 0,
    rewardCapPerYear: 2,
    rewardsRemainingThisYear: 2,
  });
});

test('share URL defaults to brand and honors override', async () => {
  const previous = process.env.APP_BASE_URL;
  const previousBrand = process.env.BRAND_VARIANT;
  process.env.BRAND_VARIANT = '200days';
  try {
    for (const base of [undefined, 'https://custom.example/']) {
      if (base) process.env.APP_BASE_URL = base; else delete process.env.APP_BASE_URL;
      const res = mockRes();
      await createReferralCodeHandler({ query: async () => ({ rows: [{ referral_code: 'CODE' }] }) })({ auth: { user_id: 'u' } }, res);
      assert.equal(res.body.shareUrl, `${(base ?? getBrand().siteUrl).replace(/\/$/, '')}/ref/CODE`);
    }
  } finally {
    if (previous === undefined) delete process.env.APP_BASE_URL; else process.env.APP_BASE_URL = previous;
    if (previousBrand === undefined) delete process.env.BRAND_VARIANT; else process.env.BRAND_VARIANT = previousBrand;
  }
});

test('referral handlers reject missing authentication', async () => {
  for (const create of [createReferralCodeHandler, createReferralStatsHandler]) {
    const res = mockRes(); await create({ query() { assert.fail('no DB access'); } })({}, res); assert.equal(res.statusCode, 401);
  }
});

test('stats count own statuses, exclude void conversions, and enforce rolling cap', { skip: DATABASE_SKIP }, () => withUsers(async (db, [owner, other]) => {
  for (const [status, months, user] of [['granted', 1, owner], ['granted', 13, owner], ['pending', null, owner], ['capped', null, owner], ['void', null, owner], ['none', null, owner], ['granted', 1, other]]) {
    const id = randomUUID();
    await db.query("INSERT INTO app_user(id,subject_id,email) VALUES ($1::uuid,$1::text,$2)", [id, `${id}@example.test`]);
    await db.query(`INSERT INTO referral_conversion(referrer_user_id,referred_user_id,referred_code,reward_status,converted_at,reward_granted_at)
      VALUES ($1,$2,'CODE',$3,CASE WHEN $3 <> 'none' THEN now() ELSE NULL END,now() - $4 * interval '1 month')`, [user, id, status, months]);
  }
  const res = mockRes(); await createReferralStatsHandler(db)({ auth: { user_id: owner } }, res);
  assert.deepEqual(res.body, { ok: true, totalReferrals: 6, conversions: 4, rewardsGranted: 2, rewardsPending: 1, rewardsCapped: 1, rewardCapPerYear: 2, rewardsRemainingThisYear: 1 });
}));
