import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  accountSettingsRouter,
  createAccountSettingsHandlers,
} from "../src/routes/accountSettings.js";

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

test("GET /api/users/me/account returns email and displayName for authenticated user", async () => {
  const handler = createAccountSettingsHandlers({
    query: async () => ({
      rows: [{ email: "test@example.com", display_name: "Test User" }],
    }),
  }).getAccount;
  const res = mockRes();

  await handler({ auth: { user_id: "user-1" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    email: "test@example.com",
    displayName: "Test User",
  });
});

test("GET /api/users/me/account returns 401 without auth", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", accountSettingsRouter);
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/users/me/account`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body?.code, "unauthorized");
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("PATCH /users/me/display-name updates display name and returns updated value", async () => {
  const calls = [];
  const handler = createAccountSettingsHandlers({
    query: async (sql, params) => {
      calls.push({ sql, params });
      return {
        rows: [{ display_name: "New Name" }],
      };
    },
  }).patchDisplayName;
  const res = mockRes();

  await handler(
    { auth: { user_id: "user-1" }, body: { displayName: "  New Name  " } },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, displayName: "New Name" });
  assert.equal(calls[0].params[0], "New Name");
  assert.equal(calls[0].params[1], "user-1");
});

test("PATCH /users/me/display-name returns 400 for empty or too-long names", async () => {
  const handler = createAccountSettingsHandlers({
    query: async () => ({ rows: [] }),
  }).patchDisplayName;

  const emptyRes = mockRes();
  await handler({ auth: { user_id: "user-1" }, body: { displayName: "   " } }, emptyRes);
  assert.equal(emptyRes.statusCode, 400);
  assert.equal(emptyRes.body?.code, "validation_error");

  const longRes = mockRes();
  await handler(
    { auth: { user_id: "user-1" }, body: { displayName: "x".repeat(61) } },
    longRes,
  );
  assert.equal(longRes.statusCode, 400);
  assert.equal(longRes.body?.code, "validation_error");
});

test("DELETE /api/users/me deletes the user row", async () => {
  const calls = [];
  const handler = createAccountSettingsHandlers({
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [] };
    },
  }).deleteAccount;
  const res = mockRes();

  await handler({ auth: { user_id: "user-1" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.match(calls[0].sql, /DELETE FROM app_user/);
  assert.deepEqual(calls[0].params, ["user-1"]);
});

test("DELETE /api/users/me returns 401 without auth", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", accountSettingsRouter);
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/users/me`, { method: "DELETE" });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body?.code, "unauthorized");
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
