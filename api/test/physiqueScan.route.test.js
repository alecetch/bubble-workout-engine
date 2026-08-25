import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createDeleteScanHandler } from "../src/routes/physiqueScan.js";
import { makeRequirePremium } from "../src/middleware/requirePremium.js";

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const BASIC_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_SCAN_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_SCAN_ID = "55555555-5555-4555-8555-555555555555";

function createDb() {
  const state = {
    users: new Map([
      [OWNER_ID, { subscription_status: "active" }],
      [OTHER_ID, { subscription_status: "active" }],
      [BASIC_ID, { subscription_status: "expired" }],
    ]),
    scans: new Map([
      [OWNER_SCAN_ID, { id: OWNER_SCAN_ID, user_id: OWNER_ID, photo_s3_key: "physique/owner.jpg" }],
      [OTHER_SCAN_ID, { id: OTHER_SCAN_ID, user_id: OTHER_ID, photo_s3_key: "physique/other.jpg" }],
    ]),
    milestones: [
      { user_id: OWNER_ID, milestone_slug: "first_scan", achieved_at: "2026-08-01T00:00:00Z", scan_id: OWNER_SCAN_ID },
      { user_id: OTHER_ID, milestone_slug: "first_scan", achieved_at: "2026-08-01T00:00:00Z", scan_id: OTHER_SCAN_ID },
    ],
  };

  return {
    state,
    async query(sql, params) {
      if (/SELECT subscription_status FROM app_user/i.test(sql)) {
        const user = state.users.get(params[0]);
        return { rowCount: user ? 1 : 0, rows: user ? [user] : [] };
      }
      if (/SELECT id, photo_s3_key FROM physique_scan/i.test(sql)) {
        const scan = state.scans.get(params[0]);
        const rows = scan && scan.user_id === params[1] ? [scan] : [];
        return { rowCount: rows.length, rows };
      }
      if (/DELETE FROM physique_scan WHERE id = \$1/i.test(sql)) {
        state.scans.delete(params[0]);
        state.milestones = state.milestones.filter((row) => row.scan_id !== params[0]);
        return { rowCount: 1, rows: [] };
      }
      if (/SELECT id FROM physique_scan/i.test(sql)) {
        const scan = state.scans.get(params[0]);
        const rows = scan && scan.user_id === params[1] ? [scan] : [];
        return { rowCount: rows.length, rows };
      }
      if (/SELECT milestone_slug, achieved_at, scan_id/i.test(sql)) {
        const rows = state.milestones.filter((row) => row.user_id === params[0]);
        return { rowCount: rows.length, rows };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

async function withServer(db, fn) {
  const deletedObjects = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { user_id: req.get("x-user-id") ?? OWNER_ID };
    next();
  });

  const requirePremium = makeRequirePremium(db);
  app.delete(
    "/api/physique/scans/:id",
    requirePremium,
    createDeleteScanHandler({
      db,
      deleteObjectFn: async (key, bucket) => {
        deletedObjects.push({ key, bucket });
      },
      bucket: "test-physique-bucket",
    }),
  );
  app.get("/api/physique/scans/:id", requirePremium, async (req, res) => {
    const { rows } = await db.query(
      `SELECT id FROM physique_scan WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.auth.user_id],
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: "Scan not found." });
    return res.json({ ok: true, scan: rows[0] });
  });
  app.get("/api/physique/milestones", requirePremium, async (req, res) => {
    const { rows } = await db.query(
      `SELECT milestone_slug, achieved_at, scan_id
       FROM physique_milestone
       WHERE user_id = $1
       ORDER BY achieved_at DESC`,
      [req.auth.user_id],
    );
    return res.json({ ok: true, milestones: rows });
  });

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`, deletedObjects);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("DELETE /api/physique/scans/:id deletes an owned scan", async () => {
  const db = createDb();
  await withServer(db, async (baseUrl, deletedObjects) => {
    const response = await fetch(`${baseUrl}/api/physique/scans/${OWNER_SCAN_ID}`, {
      method: "DELETE",
      headers: { "x-user-id": OWNER_ID },
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true });
    assert.deepEqual(deletedObjects, [{ key: "physique/owner.jpg", bucket: "test-physique-bucket" }]);

    const followUp = await fetch(`${baseUrl}/api/physique/scans/${OWNER_SCAN_ID}`, {
      headers: { "x-user-id": OWNER_ID },
    });
    assert.equal(followUp.status, 404);
  });
});

test("DELETE /api/physique/scans/:id returns 404 for another user's scan", async () => {
  const db = createDb();
  await withServer(db, async (baseUrl, deletedObjects) => {
    const response = await fetch(`${baseUrl}/api/physique/scans/${OTHER_SCAN_ID}`, {
      method: "DELETE",
      headers: { "x-user-id": OWNER_ID },
    });
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.deepEqual(body, { ok: false, error: "Scan not found." });
    assert.deepEqual(deletedObjects, []);
    assert.ok(db.state.scans.has(OTHER_SCAN_ID));
  });
});

test("DELETE /api/physique/scans/:id removes milestone rows for the deleted scan", async () => {
  const db = createDb();
  await withServer(db, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/physique/scans/${OWNER_SCAN_ID}`, {
      method: "DELETE",
      headers: { "x-user-id": OWNER_ID },
    });
    assert.equal(response.status, 200);

    const milestonesResponse = await fetch(`${baseUrl}/api/physique/milestones`, {
      headers: { "x-user-id": OWNER_ID },
    });
    const body = await milestonesResponse.json();
    assert.equal(milestonesResponse.status, 200);
    assert.deepEqual(body.milestones, []);
  });
});

test("DELETE /api/physique/scans/:id requires premium", async () => {
  const db = createDb();
  await withServer(db, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/physique/scans/${OWNER_SCAN_ID}`, {
      method: "DELETE",
      headers: { "x-user-id": BASIC_ID },
    });
    const body = await response.json();
    assert.equal(response.status, 402);
    assert.equal(body.code, "premium_required");
  });
});
