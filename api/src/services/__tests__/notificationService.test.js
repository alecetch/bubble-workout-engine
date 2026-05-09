import test from "node:test";
import assert from "node:assert/strict";
import { makeNotificationService } from "../notificationService.js";

function fakeDb(pushToken, email) {
  return {
    async query() {
      return { rows: [{ device_push_token: pushToken, email }] };
    },
  };
}

function fakeDbEmpty() {
  return {
    async query() {
      return { rows: [] };
    },
  };
}

test("send() calls Expo when push token is set and response is ok", async () => {
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return { json: async () => ({ data: { status: "ok" } }) };
  };

  const service = makeNotificationService(fakeDb("ExponentPushToken[abc]", "u@x.com"));
  await service.send({ userId: "u1", title: "T", body: "B", emailText: "E" });

  assert.equal(fetchCalled, true);
});

test("send() falls back gracefully when push token is absent", async () => {
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return { json: async () => ({}) };
  };

  const service = makeNotificationService(fakeDb(null, "u@x.com"));
  await service.send({ userId: "u1", title: "T", body: "B", emailText: "E" });

  assert.equal(fetchCalled, false);
});

test("send() clears token on DeviceNotRegistered", async () => {
  const updates = [];
  const db = {
    async query(sql, params) {
      if (sql.includes("SELECT")) {
        return { rows: [{ device_push_token: "ExponentPushToken[abc]", email: null }] };
      }
      updates.push(params);
      return { rows: [] };
    },
  };

  global.fetch = async () => ({
    json: async () => ({ data: { status: "error", details: { error: "DeviceNotRegistered" } } }),
  });

  const service = makeNotificationService(db);
  await service.send({ userId: "u1", title: "T", body: "B" });

  assert.equal(updates.some((params) => params.includes("u1")), true);
});

test("send() never throws even on complete failure", async () => {
  global.fetch = async () => {
    throw new Error("network down");
  };

  const service = makeNotificationService(fakeDb("ExponentPushToken[abc]", null));
  await service.send({ userId: "u1", title: "T", body: "B" });
});

test("send() no-ops gracefully when user not found", async () => {
  const service = makeNotificationService(fakeDbEmpty());
  await service.send({ userId: "missing", title: "T", body: "B" });
});
