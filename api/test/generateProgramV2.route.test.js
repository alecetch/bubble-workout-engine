import test from "node:test";
import assert from "node:assert/strict";
import { createGenerateProgramV2Handler } from "../src/routes/generateProgramV2.js";

const minimalProfile = {
  id: "buid-test",
  goals: ["strength"],
  fitnessLevel: "intermediate",
  injuryFlags: [],
  goalNotes: "",
  equipmentPreset: "commercial_gym",
  equipmentItemCodes: ["barbell"],
  preferredDays: ["mon", "wed", "fri"],
  scheduleConstraints: "",
  heightCm: null,
  weightKg: null,
  minutesPerSession: 60,
  sex: null,
  ageRange: null,
  onboardingStepCompleted: 5,
  onboardingCompletedAt: null,
  programType: "strength",
};

function mockReq(body = {}, overrides = {}) {
  return {
    request_id: "test-req",
    body,
    log: { info() {}, debug() {}, warn() {}, error() {} },
    ...overrides,
  };
}

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

test("missing user_id returns 400", async () => {
  const handler = createGenerateProgramV2Handler({
    getProfile: async () => null,
  });
  const req = mockReq({ anchor_date_ms: Date.now() });
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "validation_error");
  assert.match(res.body.error, /user_id/i);
});

test("non-finite anchor_date_ms returns 400", async () => {
  const handler = createGenerateProgramV2Handler({
    getProfile: async () => minimalProfile,
  });
  const req = mockReq({ user_id: "user-1", anchor_date_ms: "not-a-number" });
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "validation_error");
});

test("null anchor_date_ms is accepted and does not fail validation", async () => {
  const handler = createGenerateProgramV2Handler({
    getProfileByUser: async () => minimalProfile,
    db: {
      async connect() {
        throw new Error("setup stop");
      },
    },
  });
  const req = mockReq({ user_id: "user-1" });
  const res = mockRes();

  await handler(req, res);

  assert.notEqual(res.statusCode, 400);
  assert.equal(res.statusCode, 500);
});

test("profile not found returns 404", async () => {
  const handler = createGenerateProgramV2Handler({
    getProfileByUser: async () => null,
  });
  const req = mockReq({ user_id: "user-unknown", anchor_date_ms: Date.now() });
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, "not_found");
});

test("supplied profile lookup uses JWT owner and rejects before DB setup", async () => {
  const handler = createGenerateProgramV2Handler({
    db: { connect() { assert.fail("no setup writes for a foreign profile"); } },
    getOwnedProfile: async (profileId, userId) => {
      assert.equal(profileId, "foreign-profile"); assert.equal(userId, "jwt-owner"); return null;
    },
    getProfile() { assert.fail("unscoped lookup must not run"); },
  });
  const res = mockRes();
  await handler(mockReq({ client_profile_id: "foreign-profile", user_id: "other-user" }, { auth: { user_id: "jwt-owner" } }), res);
  assert.equal(res.statusCode, 404); assert.equal(res.body.code, "not_found");
});

test("generation rolls back if ownership no longer matches at the profile update", async () => {
  const queries = [];
  let released = false;
  const client = {
    release() { released = true; },
    async query(sql, params) {
      queries.push(sql);
      if (sql.includes("column_name = 'program_type'")) return { rowCount: 1, rows: [{}] };
      if (sql.includes("SELECT column_name")) return { rowCount: 1, rows: [{ column_name: "injury_flags" }] };
      if (sql.includes("UPDATE client_profile")) {
        assert.match(sql, /WHERE id::text = \$13 AND user_id = \$1/);
        assert.doesNotMatch(sql.split("WHERE")[0], /user_id\s*=/);
        assert.equal(params[0], "jwt-owner"); return { rowCount: 0, rows: [] };
      }
      if (/INSERT|ALTER/.test(sql)) assert.fail(`unexpected write: ${sql}`);
      return { rowCount: 0, rows: [] };
    },
  };
  const handler = createGenerateProgramV2Handler({
    db: { connect: async () => client },
    getOwnedProfile: async () => minimalProfile,
    getAllowed() { assert.fail("must not continue after lost ownership"); },
  });
  const res = mockRes();
  await handler(mockReq({ client_profile_id: minimalProfile.id }, { auth: { user_id: "jwt-owner" } }), res);
  assert.equal(res.statusCode, 404); assert.equal(res.body.code, "not_found");
  assert.equal(queries.at(-1), "ROLLBACK"); assert.equal(released, true);
});
