import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createHyroxCalculatorEventsRouter } from "../src/routes/hyroxCalculatorEvents.js";
import { hyroxEventsIpRateLimiter, hyroxEventsSessionRateLimiter } from "../src/hyrox/hyroxValidator.js";

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

function buildApp(db = createDb(), useRateLimit = false) {
  const app = express();
  app.use(express.json());
  if (useRateLimit) {
    app.post("/api/hyrox/events", hyroxEventsIpRateLimiter, hyroxEventsSessionRateLimiter, createHyroxCalculatorEventsRouter(db));
  } else {
    app.use("/api/hyrox/events", createHyroxCalculatorEventsRouter(db));
  }
  return { app, db };
}

test("POST /api/hyrox/events inserts a valid event", async () => {
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
  const { app } = buildApp(createDb(), true);
  await withServer(app, async (baseUrl) => {
    let last;
    for (let i = 0; i < 31; i += 1) {
      last = await fetch(`${baseUrl}/api/hyrox/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "rate-session", eventName: "asset_downloaded" }),
      });
    }
    assert.equal(last.status, 429);
  });
});
