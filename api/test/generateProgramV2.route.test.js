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

test("missing bubble_user_id returns 400", async () => {
  const handler = createGenerateProgramV2Handler({
    getProfile: async () => null,
  });
  const req = mockReq({ anchor_date_ms: Date.now() });
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "validation_error");
  assert.match(res.body.error, /bubble_user_id/i);
});

test("non-finite anchor_date_ms returns 400", async () => {
  const handler = createGenerateProgramV2Handler({
    getProfile: async () => minimalProfile,
  });
  const req = mockReq({ bubble_user_id: "buid-1", anchor_date_ms: "not-a-number" });
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "validation_error");
});

test("null anchor_date_ms is accepted and does not fail validation", async () => {
  const handler = createGenerateProgramV2Handler({
    getProfile: async () => minimalProfile,
    db: {
      async connect() {
        throw new Error("setup stop");
      },
    },
  });
  const req = mockReq({ bubble_user_id: "buid-1" });
  const res = mockRes();

  await handler(req, res);

  assert.notEqual(res.statusCode, 400);
  assert.equal(res.statusCode, 500);
});

test("profile not found returns 404", async () => {
  const handler = createGenerateProgramV2Handler({
    getProfile: async () => null,
  });
  const req = mockReq({ bubble_user_id: "buid-unknown", anchor_date_ms: Date.now() });
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, "not_found");
});
