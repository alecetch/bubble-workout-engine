import test from "node:test";
import assert from "node:assert/strict";
import { createWebhookRevenuecatHandler } from "../src/routes/webhookRevenuecat.js";

const ORIGINAL_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET;
const TEST_SECRET = "test-webhook-secret-abc123";
const USER_UUID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";

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

function makePool(updateRowCount = 1) {
  return {
    async query() {
      return { rowCount: updateRowCount, rows: [] };
    },
  };
}

function makeHandler(db = makePool()) {
  process.env.REVENUECAT_WEBHOOK_SECRET = TEST_SECRET;
  return createWebhookRevenuecatHandler(db);
}

function validReq(eventType, overrides = {}) {
  return {
    headers: { "x-revenuecat-signature": TEST_SECRET },
    body: {
      event: {
        type: eventType,
        app_user_id: USER_UUID,
        original_app_user_id: "rc_user_123",
        expiration_at_ms: null,
        ...overrides,
      },
    },
  };
}

test.after(() => {
  process.env.REVENUECAT_WEBHOOK_SECRET = ORIGINAL_SECRET;
});

test("revenuecat webhook: missing signature header returns 401", async () => {
  const handler = makeHandler();
  const req = { headers: {}, body: { event: { type: "INITIAL_PURCHASE", app_user_id: USER_UUID } } };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
});

test("revenuecat webhook: wrong secret returns 401", async () => {
  const handler = makeHandler();
  const req = {
    headers: { "x-revenuecat-signature": "wrong-secret" },
    body: { event: { type: "INITIAL_PURCHASE", app_user_id: USER_UUID } },
  };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
});

test("revenuecat webhook: missing event body returns 400", async () => {
  const handler = makeHandler();
  const req = { headers: { "x-revenuecat-signature": TEST_SECRET }, body: {} };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
});

test("revenuecat webhook: missing app_user_id returns 400", async () => {
  const handler = makeHandler();
  const req = {
    headers: { "x-revenuecat-signature": TEST_SECRET },
    body: { event: { type: "INITIAL_PURCHASE" } },
  };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
});

test("revenuecat webhook: INITIAL_PURCHASE sets status to active", async () => {
  let capturedParams;
  const db = {
    async query(_sql, params) {
      capturedParams = params;
      return { rowCount: 1, rows: [] };
    },
  };
  const handler = makeHandler(db);
  const res = mockRes();

  await handler(validReq("INITIAL_PURCHASE"), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.handled, true);
  assert.equal(res.body?.new_status, "active");
  assert.equal(capturedParams[0], "active");
});

test("revenuecat webhook: EXPIRATION sets status to expired", async () => {
  let capturedParams;
  const db = {
    async query(_sql, params) {
      capturedParams = params;
      return { rowCount: 1, rows: [] };
    },
  };
  const handler = makeHandler(db);
  const res = mockRes();

  await handler(validReq("EXPIRATION"), res);

  assert.equal(res.body?.new_status, "expired");
  assert.equal(capturedParams[0], "expired");
});

test("revenuecat webhook: CANCELLATION sets status to cancelled", async () => {
  let capturedParams;
  const db = {
    async query(_sql, params) {
      capturedParams = params;
      return { rowCount: 1, rows: [] };
    },
  };
  const handler = makeHandler(db);
  const res = mockRes();

  await handler(validReq("CANCELLATION"), res);

  assert.equal(res.body?.new_status, "cancelled");
  assert.equal(capturedParams[0], "cancelled");
});

test("revenuecat webhook: unhandled event type returns handled false without DB write", async () => {
  let dbCalled = false;
  const db = {
    async query() {
      dbCalled = true;
      return { rowCount: 0, rows: [] };
    },
  };
  const handler = makeHandler(db);
  const res = mockRes();

  await handler(validReq("SUBSCRIBER_ALIAS"), res);

  assert.equal(res.body?.handled, false);
  assert.equal(dbCalled, false);
});
