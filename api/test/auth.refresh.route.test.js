import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import { pool } from "../src/db.js";
process.env.JWT_SECRET ??= "refresh-route-test-secret-at-least-32-characters";
process.env.JWT_ISSUER ??= "refresh-route-tests";
const { registerUser, refreshTokens, sha256Hex } = await import("../src/services/authService.js");
const { authRouter } = await import("../src/routes/auth.js");
after(() => pool.end());

async function fixture(t, run) {
  try { await pool.query("SELECT 1"); } catch (error) { t.skip(`Postgres unavailable: ${error.code || error.message}`); return; }
  const user = await registerUser(pool, { email: `refresh-${randomUUID()}@example.com`, password: "StrongPassword123!" });
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.log = { info() {}, debug() {}, warn() {}, error() {} }; next(); });
  app.use("/api/auth", authRouter);
  const server = await new Promise(resolve => { const value = app.listen(0, "127.0.0.1", () => resolve(value)); });
  const request = async (path, token = user.refreshToken, body = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refresh_token: token, ...body }),
    });
    return { status: response.status, body: await response.json() };
  };
  try { await run({ user, request }); }
  finally {
    await new Promise(resolve => server.close(resolve));
    await pool.query("DELETE FROM app_user WHERE id=$1", [user.userId]);
  }
}
const tokenRow = async token => (await pool.query("SELECT * FROM auth_refresh_token WHERE token_hash=$1", [sha256Hex(token)])).rows[0];

test("refresh rotates atomically and records its first replacement without changing response shape", t => fixture(t, async ({ user, request }) => {
  const response = await request("refresh");
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(response.body).sort(), ["access_token", "ok", "refresh_token"]);
  assert.ok(response.body.access_token); assert.notEqual(response.body.refresh_token, user.refreshToken);
  const old = await tokenRow(user.refreshToken);
  assert.ok(old.rotated_at);
  assert.equal(old.replaced_by, (await tokenRow(response.body.refresh_token)).id);
}));
test("unknown and expired refresh tokens return 401 invalid_token", t => fixture(t, async ({ user, request }) => {
  const unknown = await request("refresh", "unknown-token");
  assert.equal(unknown.status, 401); assert.equal(unknown.body.code, "invalid_token");
  await pool.query("UPDATE auth_refresh_token SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [sha256Hex(user.refreshToken)]);
  const expired = await request("refresh");
  assert.equal(expired.status, 401); assert.equal(expired.body.code, "invalid_token");
}));
test("reuse inside the grace window issues another distinct pair and preserves the original rotation timestamp", t => fixture(t, async ({ user, request }) => {
  const first = await request("refresh");
  const before = await tokenRow(user.refreshToken);
  const reused = await request("refresh");
  assert.equal(reused.status, 200); assert.notEqual(reused.body.refresh_token, first.body.refresh_token);
  const after = await tokenRow(user.refreshToken);
  assert.equal(after.replaced_by, before.replaced_by);
  assert.equal(after.rotated_at.getTime(), before.rotated_at.getTime());
  assert.equal((await request("refresh", reused.body.refresh_token)).status, 200);
}));
test("reuse after 60 seconds is rejected", t => fixture(t, async ({ user, request }) => {
  await request("refresh");
  await pool.query("UPDATE auth_refresh_token SET rotated_at=now()-interval '2 minutes' WHERE token_hash=$1", [sha256Hex(user.refreshToken)]);
  const response = await request("refresh");
  assert.equal(response.status, 401); assert.equal(response.body.code, "invalid_token");
}));
test("concurrent refreshes serialize and return different valid refresh tokens", t => fixture(t, async ({ user, request }) => {
  const results = await Promise.all([request("refresh"), request("refresh")]);
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  assert.notEqual(results[0].body.refresh_token, results[1].body.refresh_token);
  const original = await tokenRow(user.refreshToken);
  const ids = await Promise.all(results.map(async result => (await tokenRow(result.body.refresh_token)).id));
  assert.ok(ids.includes(original.replaced_by)); assert.ok(original.rotated_at);
  assert.deepEqual((await Promise.all(results.map(result => request("refresh", result.body.refresh_token)))).map(result => result.status), [200, 200]);
}));
test("failed token INSERT rolls back rotation and the original token remains usable", t => fixture(t, async ({ user, request }) => {
  const name = `test_refresh_failure_${randomUUID().replaceAll("-", "")}`;
  try {
    // Scope failure injection to this fixture user; other test users are unaffected.
    await pool.query(`CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.user_id = '${user.userId}'::uuid THEN RAISE EXCEPTION 'test insert failure'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER ${name} BEFORE INSERT ON auth_refresh_token FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    const response = await request("refresh"); assert.equal(response.status, 500);
    const original = await tokenRow(user.refreshToken);
    assert.equal(original.rotated_at, null); assert.equal(original.replaced_by, null);
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${name} ON auth_refresh_token`);
    await pool.query(`DROP FUNCTION IF EXISTS ${name}()`);
  }
  assert.equal((await request("refresh")).status, 200);
}));
test("logout deletes the supplied token immediately even during reuse grace", t => fixture(t, async ({ user, request }) => {
  assert.equal((await request("refresh")).status, 200);
  assert.equal((await request("logout")).status, 200);
  assert.equal(await tokenRow(user.refreshToken), undefined);
  const response = await request("refresh"); assert.equal(response.status, 401); assert.equal(response.body.code, "invalid_token");
}));
test("password reset deletes rotated and replacement tokens immediately", t => fixture(t, async ({ user, request }) => {
  const rotated = await request("refresh");
  const code = "123456";
  await pool.query("INSERT INTO password_reset_token(user_id,code_hash,expires_at) VALUES ($1,$2,now()+interval '10 minutes')", [user.userId, sha256Hex(code)]);
  const email = (await pool.query("SELECT email FROM app_user WHERE id=$1", [user.userId])).rows[0].email;
  const response = await request("reset-password", user.refreshToken, { email, code, new_password: "AnotherPassword123!" });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal((await request("refresh")).status, 401);
  assert.equal((await request("refresh", rotated.body.refresh_token)).status, 401);
}));
test("caller-owned transaction is not committed by refreshTokens", t => fixture(t, async ({ user, request }) => {
  const client = await pool.connect();
  let refreshed;
  try {
    await client.query("BEGIN");
    refreshed = await refreshTokens(client, { refreshToken: user.refreshToken });
    assert.ok((await client.query("SELECT rotated_at FROM auth_refresh_token WHERE token_hash=$1", [sha256Hex(user.refreshToken)])).rows[0].rotated_at);
    await client.query("ROLLBACK");
  } finally { client.release(); }
  assert.equal((await tokenRow(user.refreshToken)).rotated_at, null);
  assert.equal((await request("refresh", refreshed.refreshToken)).status, 401);
  assert.equal((await request("refresh")).status, 200);
}));
