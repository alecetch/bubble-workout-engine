import test from "node:test";
import assert from "node:assert/strict";
import { makeResolveBubbleUser } from "../resolveUser.js";

function mockReq(overrides = {}) {
  return {
    request_id: "test-req-id",
    headers: {},
    query: {},
    get(name) { return this.headers[name.toLowerCase()] ?? undefined; },
    log: { error() {}, warn() {}, debug() {}, info() {} },
    ...overrides,
  };
}

function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  res.set = (k, v) => { res.headers[k] = v; return res; };
  res.on = (event, fn) => { res._listeners = res._listeners ?? {}; res._listeners[event] = fn; return res; };
  res.emit = (event) => { res._listeners?.[event]?.(); };
  return res;
}

test("missing bubble_user_id returns 401", async () => {
  const middleware = makeResolveBubbleUser({ async query() { throw new Error("should not run"); } });
  const req = mockReq({ query: {} });
  const res = mockRes();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "unauthorized");
});

test("empty string bubble_user_id returns 401", async () => {
  const middleware = makeResolveBubbleUser({ async query() { throw new Error("should not run"); } });
  const req = mockReq({ query: { bubble_user_id: "   " } });
  const res = mockRes();
  await middleware(req, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "unauthorized");
});

test("unknown bubble_user_id returns 401", async () => {
  const mockDb = { async query() { return { rowCount: 0, rows: [] }; } };
  const middleware = makeResolveBubbleUser(mockDb);
  const req = mockReq({ query: { bubble_user_id: "unknown-user" } });
  const res = mockRes();
  await middleware(req, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /not found/i);
});

test("known bubble_user_id sets req.auth.user_id and calls next()", async () => {
  const mockDb = {
    async query() {
      return { rowCount: 1, rows: [{ id: "pg-uuid-here" }] };
    },
  };
  const middleware = makeResolveBubbleUser(mockDb);
  const req = mockReq({ query: { bubble_user_id: "bubble-123" } });
  const res = mockRes();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.auth.user_id, "pg-uuid-here");
});

test("DB error returns 500", async () => {
  const mockDb = { async query() { throw new Error("connection refused"); } };
  const middleware = makeResolveBubbleUser(mockDb);
  const req = mockReq({ query: { bubble_user_id: "bubble-123" } });
  const res = mockRes();
  await middleware(req, res, () => {});
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, "internal_error");
});
