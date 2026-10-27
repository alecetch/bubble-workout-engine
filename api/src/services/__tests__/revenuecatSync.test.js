import test from "node:test";
import assert from "node:assert/strict";
import { fetchSubscriber, deriveStatusFromSubscriber, syncUserEntitlement } from "../revenuecatSync.js";

const now = new Date("2026-10-27T12:00:00Z");
const future = "2026-11-27T12:00:00Z";
const past = "2026-09-27T12:00:00Z";
const subscriber = (subscription = {}, expires = future) => ({ entitlements: { pro: { product_identifier: "monthly", expires_date: expires } }, subscriptions: { monthly: subscription } });

for (const [details, status] of [[{}, "active"], [{ unsubscribe_detected_at: past }, "cancelled"], [{ billing_issues_detected_at: past }, "billing_issue"]]) {
  test(`derives ${status} from pro and the matching product`, () => {
    assert.deepEqual(deriveStatusFromSubscriber(subscriber(details), now), { subscription_status: status, subscription_expires_at: future });
  });
}
test("missing/expired pro has no access, while billing grace overrides a past period end", () => {
  assert.equal(deriveStatusFromSubscriber({}, now).subscription_status, "expired");
  assert.equal(deriveStatusFromSubscriber(subscriber({}, past), now).subscription_status, "expired");
  assert.deepEqual(deriveStatusFromSubscriber(subscriber({ billing_issues_detected_at: past, grace_period_expires_date: future }, past), now), {
    subscription_status: "billing_issue", subscription_expires_at: future,
  });
  assert.throws(() => deriveStatusFromSubscriber(subscriber({}, "bad"), now), /Invalid RevenueCat/);
});
test("fetch uses the secret v1 key, encodes the user ID and validates the response", async () => {
  const result = await fetchSubscriber("user/alias", { apiKey: "secret-key", fetchImpl: async (url, opts) => {
    assert.equal(url, "https://api.revenuecat.com/v1/subscribers/user%2Falias");
    assert.equal(opts.headers.Authorization, "Bearer secret-key");
    assert.ok(opts.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ subscriber: subscriber() }) };
  } });
  assert.deepEqual(result, subscriber());
  await assert.rejects(fetchSubscriber("u", { apiKey: "" }), { code: "entitlement_sync_unavailable" });
  await assert.rejects(fetchSubscriber("u", { apiKey: "key", fetchImpl: async () => ({ ok: false, status: 503 }) }), { code: "entitlement_sync_failed" });
  await assert.rejects(fetchSubscriber("u", { apiKey: "key", fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }), { code: "entitlement_sync_failed" });
});
test("timeout aborts even an injected fetch that ignores the signal", async () => {
  let signal;
  await assert.rejects(fetchSubscriber("u", { apiKey: "key", timeoutMs: 5, fetchImpl: async (_url, opts) => {
    signal = opts.signal;
    return new Promise(() => {});
  } }), /timed out/);
  assert.equal(signal.aborted, true);
});
test("sync preserves the guarded trial branch and does not write when RevenueCat fails", async () => {
  let writes = 0;
  const trial = { subscription_status: "trialing", trial_expires_at: future, subscription_event_at: null };
  const db = { query: async sql => {
    if (sql.startsWith("UPDATE")) {
      writes++;
      assert.match(sql, /subscription_status = 'trialing' AND trial_expires_at >=/);
      assert.match(sql, /subscription_event_at IS NULL OR subscription_event_at </);
      return { rows: [trial], rowCount: 1 };
    }
    return { rows: [trial] };
  } };
  const result = await syncUserEntitlement(db, "u", { now, fetchSubscriberFn: async () => ({}) });
  assert.equal(result.status, "trialing");
  assert.equal(result.isEntitled, true);
  assert.equal(writes, 1);
  await assert.rejects(syncUserEntitlement(db, "u", { now, fetchSubscriberFn: async () => { throw new Error("offline"); } }), { code: "entitlement_sync_failed" });
  assert.equal(writes, 1);
});
