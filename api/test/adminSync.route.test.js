import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { adminSyncRouter } from "../src/routes/adminSync.js";

function mockPool(auditRows = [], latestEditAt = null) {
  return {
    async query(sql) {
      if (/FROM admin_audit_log/i.test(sql)) {
        return { rows: auditRows };
      }
      if (/FROM narration_template/i.test(sql)) {
        return { rows: [{ latest: latestEditAt }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
}

async function withSyncStatusResponse(poolMock, fn) {
  const app = express();
  app.locals.pool = poolMock;
  app.use("/admin", adminSyncRouter);
  const server = await new Promise((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/admin/sync-status`);
    const body = await response.json();
    await fn({ status: response.status, body });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("GET /admin/sync-status reports clean, dirty, never synced, and response shape", async (t) => {
  await t.test("returns clean when last sync is after latest edit", async () => {
    await withSyncStatusResponse(
      mockPool(
        [{ ts: new Date("2026-05-17T10:10:00.000Z") }],
        new Date("2026-05-17T10:05:00.000Z"),
      ),
      ({ status, body }) => {
        assert.equal(status, 200);
        assert.equal(body.dirty, false);
        assert.match(body.message, /up to date/i);
      },
    );
  });

  await t.test("returns dirty when latest edit is after last sync", async () => {
    await withSyncStatusResponse(
      mockPool(
        [{ ts: new Date("2026-05-17T10:05:00.000Z") }],
        new Date("2026-05-17T10:10:00.000Z"),
      ),
      ({ status, body }) => {
        assert.equal(status, 200);
        assert.equal(body.dirty, true);
        assert.match(body.message, /Unsynced/);
      },
    );
  });

  await t.test("returns dirty when never synced", async () => {
    await withSyncStatusResponse(
      mockPool([], new Date("2026-05-17T10:10:00.000Z")),
      ({ status, body }) => {
        assert.equal(status, 200);
        assert.equal(body.dirty, true);
        assert.equal(body.last_synced_at, null);
      },
    );
  });

  await t.test("returns the expected JSON shape", async () => {
    await withSyncStatusResponse(
      mockPool(
        [{ ts: "2026-05-17T10:10:00.000Z" }],
        "2026-05-17T10:05:00.000Z",
      ),
      ({ status, body }) => {
        assert.equal(status, 200);
        assert.equal(typeof body.dirty, "boolean");
        assert.equal(typeof body.last_synced_at, "string");
        assert.equal(typeof body.latest_edit_at, "string");
        assert.equal(typeof body.message, "string");
      },
    );
  });
});
