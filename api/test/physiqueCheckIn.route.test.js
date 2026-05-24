import test from "node:test";
import assert from "node:assert/strict";
import {
  createCheckInSubmitHandler,
  createTriggerAnalysisHandler,
} from "../src/routes/physiqueCheckIn.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CHECK_IN_ID = "22222222-2222-4222-8222-222222222222";

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

function makeSubmitReq(overrides = {}) {
  return {
    auth: { user_id: USER_ID },
    body: {},
    file: {
      buffer: Buffer.from("photo-bytes"),
      mimetype: "image/jpeg",
    },
    ...overrides,
  };
}

function makeTriggerReq(overrides = {}) {
  return {
    auth: { user_id: USER_ID },
    params: { id: CHECK_IN_ID },
    ...overrides,
  };
}

test("POST check-in with skip_analysis=true inserts null analysis and returns analysis null", async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT physique_consent_at FROM app_user/i.test(sql)) return { rows: [{ physique_consent_at: new Date() }], rowCount: 1 };
      if (/INSERT INTO physique_check_in/i.test(sql)) {
        return { rows: [{ id: CHECK_IN_ID, submitted_at: "2026-05-23T00:00:00.000Z" }], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const analyseCalls = [];
  const handler = createCheckInSubmitHandler({
    db,
    putObjectFn: async () => {},
    deleteObjectFn: async () => {},
    analysePhysiquePhotoFn: async (...args) => {
      analyseCalls.push(args);
      return { observations: [] };
    },
  });
  const res = mockRes();

  await handler(makeSubmitReq({ body: { skip_analysis: "true" } }), res);

  const insertCall = calls.find((call) => /INSERT INTO physique_check_in/i.test(call.sql));
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.analysis, null);
  assert.equal(insertCall.params[2], null);
  assert.deepEqual(analyseCalls, []);
});

test("POST check-in with skip_analysis=true records consent automatically", async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT physique_consent_at FROM app_user/i.test(sql)) return { rows: [{}], rowCount: 1 };
      if (/UPDATE app_user SET physique_consent_at/i.test(sql)) return { rows: [], rowCount: 1 };
      if (/INSERT INTO physique_check_in/i.test(sql)) {
        return { rows: [{ id: CHECK_IN_ID, submitted_at: "2026-05-23T00:00:00.000Z" }], rowCount: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const handler = createCheckInSubmitHandler({
    db,
    putObjectFn: async () => {},
    deleteObjectFn: async () => {},
  });
  const res = mockRes();

  await handler(makeSubmitReq({ body: { skip_analysis: "true" } }), res);

  assert.equal(res.statusCode, 201);
  assert.ok(calls.some((call) => /UPDATE app_user SET physique_consent_at/i.test(call.sql)));
});

test("POST analyse for a null-analysis check-in returns analysis", async () => {
  const analysis = {
    observations: ["baseline analysed"],
    comparison_notes: null,
    emphasis_suggestions: ["upper_back"],
    disclaimer: "Informational only.",
  };
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT id, photo_s3_key, analysis_json/i.test(sql)) {
        return { rows: [{ id: CHECK_IN_ID, photo_s3_key: "physique/photo.jpg", analysis_json: null }], rowCount: 1 };
      }
      if (/SELECT id, photo_s3_key, submitted_at/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/UPDATE physique_check_in/i.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const handler = createTriggerAnalysisHandler({
    db,
    getPresignedUrlFn: async () => "https://example.com/photo.jpg",
    fetchFn: async () => ({ ok: true, arrayBuffer: async () => Buffer.from("photo").buffer }),
    analysePhysiquePhotoFn: async () => analysis,
  });
  const res = mockRes();

  await handler(makeTriggerReq(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, analysis });
  assert.ok(calls.some((call) => /UPDATE physique_check_in/i.test(call.sql)));
});

test("POST analyse for an already analysed row returns 409", async () => {
  const handler = createTriggerAnalysisHandler({
    db: {
      async query() {
        return { rows: [{ id: CHECK_IN_ID, photo_s3_key: "k", analysis_json: { observations: [] } }], rowCount: 1 };
      },
    },
  });
  const res = mockRes();

  await handler(makeTriggerReq(), res);

  assert.equal(res.statusCode, 409);
});

test("POST analyse for another user's check-in returns 404", async () => {
  const handler = createTriggerAnalysisHandler({
    db: {
      async query() {
        return { rows: [], rowCount: 0 };
      },
    },
  });
  const res = mockRes();

  await handler(makeTriggerReq(), res);

  assert.equal(res.statusCode, 404);
});
