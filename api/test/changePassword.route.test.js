import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcryptjs";
import { authRouter, createChangePasswordHandler } from "../src/routes/auth.js";

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

test("POST /api/auth/change-password succeeds with correct current password", async () => {
  const currentHash = await bcrypt.hash("old-password", 12);
  const calls = [];
  const handler = createChangePasswordHandler({
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("SELECT password_hash")) {
        return { rows: [{ password_hash: currentHash }] };
      }
      if (sql.includes("UPDATE app_user")) {
        return { rows: [] };
      }
      if (sql.includes("DELETE FROM auth_refresh_token")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  });
  const req = {
    auth: { user_id: "user-1" },
    body: { currentPassword: "old-password", newPassword: "new-password-123" },
    log: { error() {} },
  };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.match(calls[1].sql, /UPDATE app_user SET password_hash/);
  assert.equal(calls[1].params[1], "user-1");
  assert.notEqual(calls[1].params[0], currentHash);
});

test("POST /api/auth/change-password returns 401 with wrong current password", async () => {
  const currentHash = await bcrypt.hash("old-password", 12);
  const handler = createChangePasswordHandler({
    query: async () => ({ rows: [{ password_hash: currentHash }] }),
  });
  const req = {
    auth: { user_id: "user-1" },
    body: { currentPassword: "wrong-password", newPassword: "new-password-123" },
    log: { error() {} },
  };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.code, "invalid_credentials");
});

test("POST /api/auth/change-password returns 400 if new password is fewer than 8 characters", async () => {
  const handler = createChangePasswordHandler({
    query: async () => ({ rows: [] }),
  });
  const req = {
    auth: { user_id: "user-1" },
    body: { currentPassword: "old-password", newPassword: "short" },
    log: { error() {} },
  };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, "validation_error");
});

test("POST /api/auth/change-password returns 401 without auth", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authRouter);
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "old-password", newPassword: "new-password-123" }),
    });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body?.code, "unauthorized");
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
