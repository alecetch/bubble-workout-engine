import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { pool } from "../src/db.js";
import { makeRequireAuth } from "../src/middleware/requireAuth.js";

export const DATABASE_SKIP = process.env.PGPASSWORD || process.env.DATABASE_URL ? false : "requires test database";
export const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
export const past = new Date(Date.now() - 30 * 86_400_000).toISOString();
export const auth = makeRequireAuth("entitlement-test-secret-at-least-32-characters", "entitlement-tests");
export const token = id => jwt.sign({ sub: id, iss: "entitlement-tests" }, "entitlement-test-secret-at-least-32-characters", { algorithm: "HS256", expiresIn: 120 });
export const closeDb = () => pool.end();

export async function withUsers(fn) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const ids = [randomUUID(), randomUUID()];
    for (const id of ids) await db.query("INSERT INTO app_user (id, subject_id, email, subscription_status) VALUES ($1, $3, $2, 'expired')", [id, `entitlement-${id}@example.test`, id]);
    await fn(db, ids);
  } finally {
    await db.query("ROLLBACK");
    db.release();
  }
}

export async function withApp(configure, fn) {
  const app = express();
  app.use(express.json());
  configure(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  }
}

export const paidSubscriber = (subscription = {}, expires = future) => ({
  entitlements: { pro: { product_identifier: "monthly", expires_date: expires } },
  subscriptions: { monthly: subscription },
});
export const rcFetch = subscriber => async () => ({ ok: true, json: async () => ({ subscriber }) });
