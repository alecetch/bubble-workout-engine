import test from "node:test";
import assert from "node:assert/strict";
import { makeRequireEntitlement } from "../requireEntitlement.js";

function makeMockDb(rows) {
  return { query: async () => ({ rows }) };
}

function makeReq(userId) {
  return { auth: { user_id: userId } };
}

function makeRes() {
  return {
    _status: null,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
}

test("active trialing user calls next()", async () => {
  const future = new Date(Date.now() + 1_000_000).toISOString();
  const db = makeMockDb([{ subscription_status: "trialing", trial_expires_at: future }]);
  const mw = makeRequireEntitlement(db);
  let called = false;
  await mw(makeReq("u1"), makeRes(), () => {
    called = true;
  });
  assert.equal(called, true);
});

test("active subscription calls next()", async () => {
  const future = new Date(Date.now() + 1_000_000).toISOString();
  const db = makeMockDb([{ subscription_status: "active", trial_expires_at: future }]);
  const mw = makeRequireEntitlement(db);
  let called = false;
  await mw(makeReq("u1"), makeRes(), () => {
    called = true;
  });
  assert.equal(called, true);
});

test("expired trial returns 402", async () => {
  const past = new Date(Date.now() - 1_000_000).toISOString();
  const db = makeMockDb([{ subscription_status: "trialing", trial_expires_at: past }]);
  const mw = makeRequireEntitlement(db);
  const res = makeRes();
  await mw(makeReq("u1"), res, () => {});
  assert.equal(res._status, 402);
  assert.equal(res._body.code, "subscription_required");
});

test("expired status returns 402", async () => {
  const db = makeMockDb([{ subscription_status: "expired", trial_expires_at: null }]);
  const mw = makeRequireEntitlement(db);
  const res = makeRes();
  await mw(makeReq("u1"), res, () => {});
  assert.equal(res._status, 402);
});

test("user not found returns 404", async () => {
  const db = makeMockDb([]);
  const mw = makeRequireEntitlement(db);
  const res = makeRes();
  await mw(makeReq("u1"), res, () => {});
  assert.equal(res._status, 404);
});
