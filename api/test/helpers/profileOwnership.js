import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../../src/db.js";

const secret = "profile-ownership-test-secret-at-least-32-chars";
const issuer = "profile-ownership-test";
process.env.JWT_SECRET = secret;
process.env.JWT_ISSUER = issuer;
export { pool };
export const token = userId => jwt.sign({ sub: userId, iss: issuer }, secret, { algorithm: "HS256", expiresIn: "1h" });
export async function ensureDb(t) {
  try { await pool.query("SELECT 1"); return true; }
  catch (err) { t.skip(`Postgres unavailable: ${err?.code || err?.message}`); return false; }
}
export function appWithLogging() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.request_id = "profile-ownership-test";
    req.log = { info() {}, debug() {}, warn() {}, error() {} };
    next();
  });
  return app;
}
export async function withServer(app, run) {
  const server = await new Promise(resolve => { const srv = app.listen(0, "127.0.0.1", () => resolve(srv)); });
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
}
export async function request(base, path, userId, method = "GET", body) {
  const res = await fetch(base + path, {
    method, headers: { "Content-Type": "application/json", ...(userId ? { Authorization: `Bearer ${token(userId)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json() };
}
export async function seedPair(t) {
  const users = [];
  t.after(async () => {
    for (const user of users) {
      await pool.query("DELETE FROM client_profile WHERE user_id = $1", [user.userId]);
      await pool.query("DELETE FROM app_user WHERE id = $1", [user.userId]);
    }
  });
  for (let i = 0; i < 2; i++) {
    const result = await pool.query("INSERT INTO app_user (subject_id, subscription_status) VALUES ($1, 'active') RETURNING id", [`ownership-${randomUUID()}`]);
    const user = { userId: result.rows[0].id };
    users.push(user);
    const profile = await pool.query(`INSERT INTO client_profile (user_id, height_cm, preferred_unit, preferred_height_unit, fitness_rank, equipment_items_slugs, injury_flags)
      VALUES ($1, 170, 'kg', 'cm', 1, ARRAY['barbell'], ARRAY[]::text[]) RETURNING id`, [user.userId]);
    user.profileId = profile.rows[0].id;
  }
  return users;
}
export async function profileRow(id) {
  return (await pool.query("SELECT * FROM client_profile WHERE id = $1", [id])).rows[0];
}
