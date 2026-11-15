import test from "node:test";
import assert from "node:assert/strict";
import { makeNotificationService } from "../notificationService.js";
function fixture(token = "test", missing = false) {
  const queries = [];
  const db = { async query(sql) { queries.push(sql); if (sql.includes("SELECT")) return { rows: missing ? [] : [{ device_push_token: token, email: "user@example.test" }] }; return { rows: [{ user_id: "u1" }] }; } };
  return { queries, service: makeNotificationService(db) };
}
const message = { userId: "u1", title: "T", body: "B" };
test("push success returns sent true", async t => {
  let calls = 0; t.mock.method(globalThis, "fetch", async () => { calls++; return { json: async () => ({ data: { status: "ok" } }) }; });
  const f = fixture(); assert.deepEqual(await f.service.send(message), { sent: true }); assert.equal(calls, 1); assert.equal(f.queries.length, 2);
});
test("email without token has no channel and never reserves or sends", async t => {
  let calls = 0; t.mock.method(globalThis, "fetch", async () => { calls++; throw Error("unexpected network"); });
  const f = fixture(null); assert.deepEqual(await f.service.send({ ...message, emailText: "legacy caller" }), { sent: false, reason: "no_channel" });
  assert.equal(f.queries.length, 1); assert.equal(calls, 0);
});
test("failed push has no email fallback", async t => {
  let calls = 0; t.mock.method(globalThis, "fetch", async () => { calls++; throw Error("network down"); });
  const f = fixture(); assert.deepEqual(await f.service.send({ ...message, emailText: "legacy caller" }), { sent: false, reason: "delivery_failed" }); assert.equal(calls, 1);
});
test("non-retriable push error clears token", async t => {
  t.mock.method(globalThis, "fetch", async () => ({ json: async () => ({ data: { status: "error", details: { error: "DeviceNotRegistered" } } }) }));
  const f = fixture(); assert.deepEqual(await f.service.send(message), { sent: false, reason: "delivery_failed" }); assert.ok(f.queries.some(sql => sql.includes("SET device_push_token = NULL")));
});
test("missing user has no channel", async () => {
  assert.deepEqual(await fixture(null, true).service.send(message), { sent: false, reason: "no_channel" });
});
