import test from "node:test";
import assert from "node:assert/strict";
import { createWebhookRevenuecatHandler } from "../src/routes/webhookRevenuecat.js";
import { randomUUID } from "node:crypto";
import { computeEntitlement } from "../src/services/entitlement.js";
import { DATABASE_SKIP, future, past, closeDb, withUsers, paidSubscriber, rcFetch } from "../testSupport/entitlementFixtures.js";

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

function makeHandler(db = makePool(), deps = {}) {
  process.env.REVENUECAT_WEBHOOK_SECRET = TEST_SECRET;
  return createWebhookRevenuecatHandler(db, deps);
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
        event_timestamp_ms: Date.now(),
        ...overrides,
      },
    },
  };
}

test.after(() => {
  process.env.REVENUECAT_WEBHOOK_SECRET = ORIGINAL_SECRET;
});
test.after(closeDb);

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
  assert.equal(capturedParams[1], "active");
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
  assert.equal(capturedParams[1], "expired");
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
  assert.equal(capturedParams[1], "cancelled");
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

for (const [type, expected] of [["INITIAL_PURCHASE", "active"], ["RENEWAL", "active"], ["UNCANCELLATION", "active"], ["PRODUCT_CHANGE", "active"], ["CANCELLATION", "cancelled"], ["BILLING_ISSUE", "billing_issue"], ["EXPIRATION", "expired"]]) {
  test(`${type} persists lifecycle state and keeps paid-through access`, { skip: DATABASE_SKIP }, async () => {
    await withUsers(async (db, [user]) => {
      await db.query("UPDATE app_user SET subscription_status='cancelled', subscription_expires_at=$2 WHERE id=$1", [user, future]);
      const req = validReq(type, { app_user_id: user, expiration_at_ms: Date.parse(future), grace_period_expiration_at_ms: Date.parse(future) + 86_400_000 });
      const res = mockRes();
      await makeHandler(db)(req, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.handled, true);
      const row = (await db.query("SELECT * FROM app_user WHERE id=$1", [user])).rows[0];
      assert.equal(row.subscription_status, expected);
      assert.equal(row.subscription_expires_at.getTime(), type === "BILLING_ISSUE" ? Date.parse(future) + 86_400_000 : Date.parse(future));
      assert.equal(computeEntitlement(row).isEntitled, expected !== "expired");
      assert.equal(row.subscription_event_at.getTime(), req.body.event.event_timestamp_ms);
    });
  });
}

test("out-of-order and duplicate events are acknowledged without overwriting renewal", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user]) => {
    const handler = makeHandler(db);
    const ts = Date.now();
    await handler(validReq("RENEWAL", { app_user_id: user, expiration_at_ms: Date.parse(future), event_timestamp_ms: ts }), mockRes());
    for (const older of [ts - 1, ts]) {
      const res = mockRes();
      await handler(validReq("EXPIRATION", { app_user_id: user, event_timestamp_ms: older }), res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.handled, false);
      assert.equal(res.body.reason, "stale_event");
    }
    assert.equal((await db.query("SELECT subscription_status FROM app_user WHERE id=$1", [user])).rows[0].subscription_status, "active");
  });
});

test("TRANSFER without app_user_id updates all UUID targets with the no-key fallback", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [from, to]) => {
    await db.query("UPDATE app_user SET subscription_status='active', subscription_expires_at=$2 WHERE id=$1", [from, future]);
    await db.query("UPDATE app_user SET subscription_expires_at=$2 WHERE id=$1", [to, past]);
    const handler = makeHandler(db, { syncDeps: { apiKey: "" } });
    const res = mockRes();
    await handler(validReq("TRANSFER", { app_user_id: undefined, transferred_from: [from, "$RCAnonymousID:from"], transferred_to: [to] }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.handled, true);
    const rows = (await db.query("SELECT id, subscription_status, subscription_expires_at FROM app_user WHERE id=ANY($1::uuid[])", [[from, to]])).rows;
    assert.equal(rows.find(row => row.id === from).subscription_status, "expired");
    assert.equal(rows.find(row => row.id === to).subscription_status, "active");
    assert.equal(computeEntitlement(rows.find(row => row.id === to)).isEntitled, true);
  });
});

test("TRANSFER syncs both sides and a stale transfer never overwrites newer state", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [from, to]) => {
    const calls = [];
    const handler = makeHandler(db, { syncDeps: { apiKey: "key", fetchImpl: async url => {
      calls.push(url);
      return rcFetch(url.endsWith(to) ? paidSubscriber() : {})();
    } } });
    const req = validReq("TRANSFER", { app_user_id: undefined, transferred_from: [from], transferred_to: [to] });
    await handler(req, mockRes());
    assert.equal(calls.length, 2);
    assert.equal((await db.query("SELECT subscription_status FROM app_user WHERE id=$1", [to])).rows[0].subscription_status, "active");
    const stale = mockRes();
    await handler(req, stale);
    assert.equal(stale.body.reason, "stale_event");
    assert.equal(calls.length, 2);
  });
});

test("anonymous IDs, TEST and unhandled events are 200 without DB access", async () => {
  const logs = [];
  const handler = makeHandler({ query: async () => assert.fail("must not query the database") });
  for (const req of [validReq("RENEWAL", { app_user_id: "$RCAnonymousID:abc" }), validReq("TEST", { app_user_id: undefined }), validReq("SUBSCRIPTION_PAUSED")]) {
    req.log = { warn: entry => logs.push(entry) };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.handled, false);
  }
  assert.equal(logs[0].event, "revenuecat.webhook.non_uuid_app_user_id");
});

test("unknown UUID is acknowledged as unknown_user", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async db => {
    const res = mockRes();
    await makeHandler(db)(validReq("RENEWAL", { app_user_id: randomUUID() }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.reason, "unknown_user");
  });
});

test("transfer target aliases are deduplicated case-insensitively and destination wins", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user]) => {
    const res = mockRes();
    await makeHandler(db, { syncDeps: { apiKey: "" } })(validReq("TRANSFER", {
      app_user_id: undefined, transferred_from: [user], transferred_to: [user.toUpperCase()],
    }), res);
    assert.equal(res.body.handled, true);
    assert.equal((await db.query("SELECT subscription_status FROM app_user WHERE id=$1", [user])).rows[0].subscription_status, "active");
  });
});

test("transfer upstream failure is acknowledged without changing local state", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user]) => {
    const before = (await db.query("SELECT * FROM app_user WHERE id=$1", [user])).rows[0];
    const res = mockRes();
    await makeHandler(db, { syncDeps: { apiKey: "key", fetchImpl: async () => ({ ok: false, status: 503 }) } })(validReq("TRANSFER", {
      app_user_id: undefined, transferred_from: [], transferred_to: [user],
    }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.reason, "sync_failed");
    assert.deepEqual((await db.query("SELECT * FROM app_user WHERE id=$1", [user])).rows[0], before);
  });
});

test("normal events retain customer metadata without alias collisions after transfer", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [from, to]) => {
    const original = `rc-${from}`;
    const handler = makeHandler(db);
    await handler(validReq("INITIAL_PURCHASE", { app_user_id: from, original_app_user_id: original }), mockRes());
    assert.equal((await db.query("SELECT revenuecat_customer_id FROM app_user WHERE id=$1", [from])).rows[0].revenuecat_customer_id, original);
    const res = mockRes();
    await handler(validReq("RENEWAL", { app_user_id: to, original_app_user_id: original }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.handled, true);
    assert.equal((await db.query("SELECT subscription_status FROM app_user WHERE id=$1", [to])).rows[0].subscription_status, "active");
  });
});

test("malformed timestamps are 400 while genuine DB failures remain 500", async () => {
  const handler = makeHandler({ query: async () => { throw new Error("DB down"); } });
  for (const overrides of [{ event_timestamp_ms: null }, { expiration_at_ms: "bad" }]) {
    const res = mockRes();
    await handler(validReq("RENEWAL", overrides), res);
    assert.equal(res.statusCode, 400);
  }
  const res = mockRes();
  await handler(validReq("RENEWAL"), res);
  assert.equal(res.statusCode, 500);
});
