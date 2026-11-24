import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createHyroxCalculatorEventsRouter } from "../src/routes/hyroxCalculatorEvents.js";
import { createHyroxEventsRateLimiters } from "../src/hyrox/hyroxValidator.js";

const SUBMISSION_ID = "11111111-1111-4111-8111-111111111111";

function createDb() {
  const rows = [];
  return {
    rows,
    async query(sql, params) {
      rows.push({ sql, params });
      return { rowCount: 1, rows: [] };
    },
  };
}

async function withServer(app, fn) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function buildApp(db = createDb()) {
  const app = express();
  app.use(express.json());
  const { hyroxEventsIpRateLimiter, hyroxEventsSessionRateLimiter } = createHyroxEventsRateLimiters();
  app.use("/api/hyrox/events", hyroxEventsIpRateLimiter, hyroxEventsSessionRateLimiter, createHyroxCalculatorEventsRouter(db));
  // Match the protected /api fallback after the public route in server.js.
  app.use("/api", (_req, res) => res.sendStatus(401));
  return { app, db };
}

test("server mounts the public events router before the protected API fallback", () => {
  // server.js starts listeners, jobs and schedulers on import; inspect its mount
  // and exercise that same middleware chain below without those side effects.
  const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  const mount = 'app.use("/api/hyrox/events", hyroxEventsIpRateLimiter, hyroxEventsSessionRateLimiter, createHyroxCalculatorEventsRouter(pool));';
  assert.ok(source.includes(mount));
  assert.ok(source.indexOf(mount) < source.indexOf('\napp.use("/api", ...userAuth'));
});

test("POST /api/hyrox/events inserts a valid event without authentication through the production middleware chain", async () => {
  const { app, db } = buildApp();
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/hyrox/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-1", submissionId: SUBMISSION_ID, eventName: "asset_downloaded", metadata: { assetType: "zip" } }),
    });
    assert.equal(response.status, 204);
  });

  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].params[1], "session-1");
  assert.equal(db.rows[0].params[2], SUBMISSION_ID);
  assert.equal(db.rows[0].params[3], "asset_downloaded");
});

test("POST /api/hyrox/events accepts app_download_clicked", async () => {
  const { app, db } = buildApp();
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/hyrox/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-1", submissionId: SUBMISSION_ID, eventName: "app_download_clicked", metadata: { touchpoint: "result_page" } }),
    });
    assert.equal(response.status, 204);
  });

  assert.equal(db.rows[0].params[3], "app_download_clicked");
  assert.deepEqual(JSON.parse(db.rows[0].params[7]), { touchpoint: "result_page" });
});

test("POST /api/hyrox/events rejects an event outside the allow-list", async () => {
  const { app } = buildApp();
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/hyrox/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-1", eventName: "pack_requested" }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_event" });
  });
});

test("POST /api/hyrox/events rejects malformed submissionId", async () => {
  const { app } = buildApp();
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/hyrox/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "session-1", submissionId: "not-a-uuid", eventName: "asset_downloaded" }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_submission_id" });
  });
});

test("POST /api/hyrox/events rate-limits repeated events from the same session", async () => {
  const { app } = buildApp();
  await withServer(app, async (baseUrl) => {
    let last;
    for (let i = 0; i < 31; i += 1) {
      last = await fetch(`${baseUrl}/api/hyrox/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "rate-session", eventName: "asset_downloaded" }),
      });
      if (i < 30) assert.equal(last.status, 204);
    }
    assert.equal(last.status, 429);
    assert.deepEqual(await last.json(), { error: "too_many_requests" });
  });
});


test("the events router does not handle GET or nested POST paths", async () => {
  const { app, db } = buildApp();
  await withServer(app, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/hyrox/events`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/hyrox/events/nested`, { method: "POST" })).status, 401);
  });
  assert.equal(db.rows.length, 0);
});
