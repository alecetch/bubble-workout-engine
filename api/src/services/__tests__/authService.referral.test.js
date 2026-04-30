import test from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ??= "test-secret";
process.env.JWT_ISSUER ??= "test-issuer";

const { registerUser } = await import("../authService.js");

function createMockDb({ referrerId = null } = {}) {
  const calls = [];

  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });

      if (/FROM app_user\s+WHERE lower\(email\) = \$1/i.test(sql)) {
        return { rowCount: 0, rows: [] };
      }

      if (/SELECT id FROM app_user WHERE referral_code = \$1 LIMIT 1/i.test(sql)) {
        return referrerId
          ? { rowCount: 1, rows: [{ id: referrerId }] }
          : { rowCount: 0, rows: [] };
      }

      if (/INSERT INTO app_user/i.test(sql)) {
        return { rowCount: 1, rows: [{ id: "user-new" }] };
      }

      if (/INSERT INTO client_profile/i.test(sql)) {
        return { rowCount: 1, rows: [{ id: "profile-new" }] };
      }

      if (/INSERT INTO referral_conversion/i.test(sql)) {
        return { rowCount: 1, rows: [] };
      }

      if (/INSERT INTO auth_refresh_token/i.test(sql)) {
        return { rowCount: 1, rows: [] };
      }

      if (/SELECT subscription_status, trial_expires_at FROM app_user WHERE id = \$1/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{ subscription_status: "trialing", trial_expires_at: null }],
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test("registerUser stores referred_by_code and creates referral conversion for valid codes", async () => {
  const db = createMockDb({ referrerId: "user-referrer" });

  const result = await registerUser(db, {
    email: "new@example.com",
    password: "password123",
    referredByCode: "ABCDEFG2",
  });

  assert.equal(result.userId, "user-new");

  const userInsert = db.calls.find((call) => /INSERT INTO app_user/i.test(call.sql));
  assert.ok(userInsert);
  assert.equal(userInsert.params[4], "ABCDEFG2");

  const conversionInsert = db.calls.find((call) => /INSERT INTO referral_conversion/i.test(call.sql));
  assert.ok(conversionInsert);
  assert.deepEqual(conversionInsert.params, ["user-referrer", "user-new", "ABCDEFG2"]);
});

test("registerUser ignores invalid referral codes without creating conversion rows", async () => {
  const db = createMockDb();

  const result = await registerUser(db, {
    email: "new2@example.com",
    password: "password123",
    referredByCode: "MISSING99",
  });

  assert.equal(result.userId, "user-new");

  const userInsert = db.calls.find((call) => /INSERT INTO app_user/i.test(call.sql));
  assert.ok(userInsert);
  assert.equal(userInsert.params[4], "MISSING99");

  const conversionInsert = db.calls.find((call) => /INSERT INTO referral_conversion/i.test(call.sql));
  assert.equal(conversionInsert, undefined);
});
