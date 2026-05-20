import test from "node:test";
import assert from "node:assert/strict";
import { createSplitRecommendationHandlers } from "../src/routes/splitRecommendation.js";

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

function makeReq(overrides = {}) {
  return {
    auth: { user_id: "test-user-id" },
    request_id: "req-1",
    log: { error() {} },
    ...overrides,
  };
}

// ── GET /split-recommendation ──────────────────────────────────────────────

test("getSplitRecommendation returns 404 when no profile found", async () => {
  const db = { async query() { return { rows: [], rowCount: 0 }; } };
  const { getSplitRecommendation } = createSplitRecommendationHandlers(db);
  const res = mockRes();

  await getSplitRecommendation(makeReq(), res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, "not_found");
});

test("getSplitRecommendation returns 400 when no user_id in token", async () => {
  const db = { async query() { return { rows: [], rowCount: 0 }; } };
  const { getSplitRecommendation } = createSplitRecommendationHandlers(db);
  const res = mockRes();

  await getSplitRecommendation(makeReq({ auth: { user_id: "" } }), res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "validation_error");
});

test("getSplitRecommendation returns recommendation for 3-day hypertrophy profile", async () => {
  const db = {
    async query() {
      return {
        rowCount: 1,
        rows: [{
          preferred_split_json: null,
          preferred_days: ["mon", "wed", "fri"],
          program_type_slug: "hypertrophy",
          main_goals_slugs: [],
        }],
      };
    },
  };
  const { getSplitRecommendation } = createSplitRecommendationHandlers(db);
  const res = mockRes();

  await getSplitRecommendation(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.programType, "hypertrophy");
  assert.equal(res.body.daysPerWeek, 3);
  assert.deepEqual(res.body.recommendation, ["full_body", "full_body", "full_body"]);
  assert.equal(res.body.existingPreference, null);
  assert.equal(res.body.existingModifiedByUser, false);
});

test("getSplitRecommendation returns PPL recommendation for 5-day hypertrophy", async () => {
  const db = {
    async query() {
      return {
        rowCount: 1,
        rows: [{
          preferred_split_json: null,
          preferred_days: ["mon", "tue", "wed", "thu", "fri"],
          program_type_slug: "hypertrophy",
          main_goals_slugs: [],
        }],
      };
    },
  };
  const { getSplitRecommendation } = createSplitRecommendationHandlers(db);
  const res = mockRes();

  await getSplitRecommendation(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.recommendation, ["push", "pull", "legs", "upper_body", "lower_body"]);
});

test("getSplitRecommendation returns existing preference when set", async () => {
  const db = {
    async query() {
      return {
        rowCount: 1,
        rows: [{
          preferred_split_json: {
            day_focuses: ["upper_body", "lower_body", "upper_body"],
            modified_by_user: true,
          },
          preferred_days: ["mon", "wed", "fri"],
          program_type_slug: "strength",
          main_goals_slugs: [],
        }],
      };
    },
  };
  const { getSplitRecommendation } = createSplitRecommendationHandlers(db);
  const res = mockRes();

  await getSplitRecommendation(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.existingPreference, ["upper_body", "lower_body", "upper_body"]);
  assert.equal(res.body.existingModifiedByUser, true);
});

test("getSplitRecommendation derives programType from goals when slug absent", async () => {
  const db = {
    async query() {
      return {
        rowCount: 1,
        rows: [{
          preferred_split_json: null,
          preferred_days: ["mon", "wed", "fri", "sat"],
          program_type_slug: null,
          main_goals_slugs: ["strength"],
        }],
      };
    },
  };
  const { getSplitRecommendation } = createSplitRecommendationHandlers(db);
  const res = mockRes();

  await getSplitRecommendation(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.programType, "strength");
  assert.deepEqual(res.body.recommendation, ["upper_body", "lower_body", "upper_body", "lower_body"]);
});

test("getSplitRecommendation defaults to hypertrophy when no slug or goals", async () => {
  const db = {
    async query() {
      return {
        rowCount: 1,
        rows: [{
          preferred_split_json: null,
          preferred_days: [],
          program_type_slug: null,
          main_goals_slugs: [],
        }],
      };
    },
  };
  const { getSplitRecommendation } = createSplitRecommendationHandlers(db);
  const res = mockRes();

  await getSplitRecommendation(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.programType, "hypertrophy");
  // daysPerWeek defaults to 3 when preferred_days is empty
  assert.equal(res.body.daysPerWeek, 3);
  assert.deepEqual(res.body.recommendation, ["full_body", "full_body", "full_body"]);
});

test("getSplitRecommendation returns 500 on unexpected DB error", async () => {
  const db = {
    async query() { throw new Error("connection refused"); },
  };
  const { getSplitRecommendation } = createSplitRecommendationHandlers(db);
  const res = mockRes();

  await getSplitRecommendation(makeReq(), res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, "internal_error");
});
