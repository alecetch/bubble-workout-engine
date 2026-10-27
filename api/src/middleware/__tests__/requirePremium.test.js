import test from "node:test";
import assert from "node:assert/strict";
import { makeRequirePremium } from "../requirePremium.js";

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

test("active subscriber calls next()", async () => {
  const mw = makeRequirePremium(makeMockDb([{ subscription_status: "active" }]));
  let called = false;
  await mw(makeReq("u1"), makeRes(), () => {
    called = true;
  });
  assert.equal(called, true);
});

test("trialing user returns premium_required", async () => {
  const mw = makeRequirePremium(makeMockDb([{ subscription_status: "trialing" }]));
  const res = makeRes();
  await mw(makeReq("u1"), res, () => {});
  assert.equal(res._status, 402);
  assert.equal(res._body.code, "premium_required");
});


for (const status of ["cancelled", "billing_issue"]) {
  for (const future of [true, false]) {
    test(`${status} with ${future ? "future" : "past"} expiry uses paid-through access`, async () => {
      const mw = makeRequirePremium(makeMockDb([{ subscription_status: status, subscription_expires_at: new Date(Date.now() + (future ? 100000 : -100000)) }]));
      const res = makeRes();
      let allowed = false;
      await mw(makeReq("u1"), res, () => { allowed = true; });
      assert.equal(allowed, future);
      if (!future) assert.equal(res._status, 402);
    });
  }
}
