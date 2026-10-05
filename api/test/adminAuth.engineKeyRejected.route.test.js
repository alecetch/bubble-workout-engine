import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { pool } from "../src/db.js";
import { adminOnly } from "../src/middleware/chains.js";
import { requireInternalToken } from "../src/middleware/auth.js";
import { adminUsersRouter } from "../src/routes/adminUsers.js";
import { adminHyroxTestHarnessRouter } from "../src/routes/adminHyroxTestHarness.js";
import { workoutRemindersRouter } from "../src/routes/workoutReminders.js";

const internalToken = "admin-auth-internal-token-test-only";
const engineKey = "admin-auth-engine-key-test-only";
const previousEnv = { INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN, ENGINE_KEY: process.env.ENGINE_KEY };
let server;
let baseUrl;
before(async () => {
  process.env.INTERNAL_API_TOKEN = internalToken;
  process.env.ENGINE_KEY = engineKey;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.request_id = "admin-auth-rejection-test"; next(); });
  // Real JSON routers and the same credential chains as server.js. The public
  // /admin/users HTML navigation handler is intentionally outside this app.
  app.use("/admin", ...adminOnly, adminUsersRouter);
  app.use("/api/admin", requireInternalToken, adminHyroxTestHarnessRouter);
  app.use("/api", workoutRemindersRouter);
  server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  try {
    if (server) await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await pool.end();
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
async function assertRejected(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "X-Engine-Key": engineKey, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    ok: false, request_id: "admin-auth-rejection-test", code: "unauthorized", error: "Invalid or missing X-Internal-Token",
  });
}
const unusedUserId = randomUUID();
for (const [method, path, body] of [
  ["GET", "/admin/users"],
  ["PATCH", `/admin/users/${unusedUserId}/subscription`, { status: "active" }],
  ["DELETE", `/admin/users/${unusedUserId}`],
  ["GET", "/api/admin/hyrox/test-harness/runs"],
  ["POST", "/api/internal/send-workout-reminders"],
]) {
  test(`${method} ${path} rejects X-Engine-Key without Origin`, () => assertRejected(method, path, body));
}
test("rejected mutations preserve the DB fixture; internal token lists it", async t => {
  try {
    await pool.query("SELECT 1");
  } catch (error) {
    t.skip(`Postgres unavailable for route test: ${error.code || "connection error"}`);
    return;
  }
  const unique = randomUUID();
  let userId;
  try {
    const { rows } = await pool.query(
      "INSERT INTO app_user (subject_id, email, subscription_status) VALUES ($1, $2, 'expired') RETURNING id",
      [`admin-auth-test-${unique}`, `admin-auth-${unique}@example.test`],
    );
    userId = rows[0].id;
    for (const [method, path, body] of [
      ["PATCH", `/admin/users/${userId}/subscription`, { status: "active" }],
      ["DELETE", `/admin/users/${userId}`],
    ]) {
      await assertRejected(method, path, body);
      const result = await pool.query("SELECT subscription_status FROM app_user WHERE id = $1", [userId]);
      assert.equal(result.rowCount, 1);
      assert.equal(result.rows[0].subscription_status, "expired");
    }
    const response = await fetch(`${baseUrl}/admin/users`, { headers: { "X-Internal-Token": internalToken } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.ok(body.users.some(user => user.id === userId));
  } finally {
    if (userId) await pool.query("DELETE FROM app_user WHERE id = $1", [userId]);
  }
});
