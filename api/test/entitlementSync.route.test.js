import test from "node:test";
import assert from "node:assert/strict";
import { createUserEntitlementRouter } from "../src/routes/userEntitlement.js";
import { syncUserEntitlement } from "../src/services/revenuecatSync.js";
import { createEntitlementSyncRateLimiter } from "../src/middleware/rateLimits.js";
import { DATABASE_SKIP, future, past, auth, token, closeDb, withUsers, withApp, paidSubscriber, rcFetch } from "../testSupport/entitlementFixtures.js";

test.after(closeDb);
const headers = id => ({ Authorization: `Bearer ${token(id)}`, "Content-Type": "application/json" });

test("sync is authenticated, returns GET's shape and only updates the caller", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user, other]) => {
    await withApp(app => app.use("/api", auth, createUserEntitlementRouter({ db, syncDeps: {
      apiKey: "secret-test-key", fetchImpl: async (url, options) => {
        assert.ok(url.endsWith(user));
        assert.equal(options.headers.Authorization, "Bearer secret-test-key");
        return rcFetch(paidSubscriber())();
      },
    } })), async base => {
      const path = `${base}/api/users/me/entitlement`;
      assert.equal((await fetch(`${path}/sync`, { method: "POST" })).status, 401);
      const response = await fetch(`${path}/sync`, { method: "POST", headers: headers(user), body: JSON.stringify({ user_id: other }) });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.is_premium, true);
      assert.equal(body.will_renew, true);
      assert.equal(body.billing_issue, false);
      assert.deepEqual(body, await (await fetch(path, { headers: headers(user) })).json());
      assert.equal((await db.query("SELECT subscription_status FROM app_user WHERE id=$1", [other])).rows[0].subscription_status, "expired");
    });
  });
});

for (const [name, deps, status, code] of [
  ["no key", { apiKey: "" }, 503, "entitlement_sync_unavailable"],
  ["RevenueCat error", { apiKey: "key", fetchImpl: async () => ({ ok: false, status: 503 }) }, 502, "entitlement_sync_failed"],
  ["malformed subscriber", { apiKey: "key", fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }, 502, "entitlement_sync_failed"],
]) {
  test(`${name} leaves the complete user row untouched`, { skip: DATABASE_SKIP }, async () => {
    await withUsers(async (db, [user]) => {
      const before = (await db.query("SELECT * FROM app_user WHERE id=$1", [user])).rows[0];
      await withApp(app => app.use("/api", auth, createUserEntitlementRouter({ db, syncDeps: deps })), async base => {
        const response = await fetch(`${base}/api/users/me/entitlement/sync`, { method: "POST", headers: headers(user) });
        assert.equal(response.status, status);
        assert.equal((await response.json()).code, code);
      });
      assert.deepEqual((await db.query("SELECT * FROM app_user WHERE id=$1", [user])).rows[0], before);
    });
  });
}

test("sync preserves a live trial without purchases but upgrades a trial with a purchase", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user]) => {
    await db.query("UPDATE app_user SET subscription_status='trialing', trial_expires_at=$2 WHERE id=$1", [user, future]);
    const first = await syncUserEntitlement(db, user, { apiKey: "key", fetchImpl: rcFetch({}) });
    assert.equal(first.status, "trialing");
    assert.equal(first.isEntitled, true);
    assert.equal(first.isPaid, false);
    const second = await syncUserEntitlement(db, user, { apiKey: "key", now: new Date(Date.now() + 1000), fetchImpl: rcFetch(paidSubscriber()) });
    assert.equal(second.status, "active");
    assert.equal(second.isPaid, true);
  });
});

for (const eventOffset of [-1000, 1]) test(`a webhook arriving during fetch wins over sync (event offset ${eventOffset})`, { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user]) => {
    const now = new Date();
    await db.query("UPDATE app_user SET subscription_event_at=$2 WHERE id=$1", [user, new Date(now.getTime() - 2000)]);
    const result = await syncUserEntitlement(db, user, { now, apiKey: "key", fetchImpl: async () => {
      await db.query("UPDATE app_user SET subscription_status='active', subscription_expires_at=$2, subscription_event_at=$3 WHERE id=$1", [user, future, new Date(now.getTime() + eventOffset)]);
      return rcFetch({})();
    } });
    assert.equal(result.applied, false);
    assert.equal(result.status, "active");
    assert.equal(result.reason, "stale_event");
  });
});

test("lapsed cancelled rows are lazily expired", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user]) => {
    await db.query("UPDATE app_user SET subscription_status='cancelled', subscription_expires_at=$2 WHERE id=$1", [user, past]);
    await withApp(app => app.use("/api", auth, createUserEntitlementRouter({ db })), async base => {
      const result = await (await fetch(`${base}/api/users/me/entitlement`, { headers: headers(user) })).json();
      assert.equal(result.subscription_status, "expired");
      assert.equal((await db.query("SELECT subscription_status FROM app_user WHERE id=$1", [user])).rows[0].subscription_status, "expired");
    });
  });
});

test("lazy expiration does not overwrite a concurrent paid-period extension", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user]) => {
    await db.query("UPDATE app_user SET subscription_status='cancelled', subscription_expires_at=$2 WHERE id=$1", [user, past]);
    const racingDb = { query: async (sql, params) => {
      if (sql.startsWith("UPDATE app_user SET subscription_status = 'expired'")) {
        await db.query("UPDATE app_user SET subscription_expires_at=$2 WHERE id=$1", [user, future]);
      }
      return db.query(sql, params);
    } };
    await withApp(app => app.use("/api", auth, createUserEntitlementRouter({ db: racingDb })), async base => {
      const result = await (await fetch(`${base}/api/users/me/entitlement`, { headers: headers(user) })).json();
      assert.equal(result.subscription_status, "cancelled");
      assert.equal(result.is_premium, true);
    });
  });
});

test("a timed-out sync leaves the row untouched", { skip: DATABASE_SKIP }, async () => {
  await withUsers(async (db, [user]) => {
    const before = (await db.query("SELECT * FROM app_user WHERE id=$1", [user])).rows[0];
    await withApp(app => app.use("/api", auth, createUserEntitlementRouter({ db, syncDeps: {
      apiKey: "key", timeoutMs: 5, fetchImpl: async () => new Promise(() => {}),
    } })), async base => {
      const response = await fetch(`${base}/api/users/me/entitlement/sync`, { method: "POST", headers: headers(user) });
      assert.equal(response.status, 502);
    });
    assert.deepEqual((await db.query("SELECT * FROM app_user WHERE id=$1", [user])).rows[0], before);
  });
});

test("sync limiter allows five requests per minute per user", async () => {
  const limiter = createEntitlementSyncRateLimiter();
  await withApp(app => app.post("/sync", (req, _res, next) => { req.auth = { user_id: req.get("x-user") }; next(); }, limiter, (_req, res) => res.json({ ok: true })), async base => {
    for (let i = 0; i < 5; i++) assert.equal((await fetch(`${base}/sync`, { method: "POST", headers: { "x-user": "one" } })).status, 200);
    assert.equal((await fetch(`${base}/sync`, { method: "POST", headers: { "x-user": "one" } })).status, 429);
    assert.equal((await fetch(`${base}/sync`, { method: "POST", headers: { "x-user": "two" } })).status, 200);
  });
});
