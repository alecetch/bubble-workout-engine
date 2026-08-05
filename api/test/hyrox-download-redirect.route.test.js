import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { createHyroxDownloadRedirectRouter } from "../src/routes/hyroxDownloadRedirect.js";

const SUBMISSION_ID = "11111111-1111-4111-8111-111111111111";

async function withServer(app, fn) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /api/hyrox/download-redirect/:submissionId logs email touchpoint and redirects", async () => {
  const events = [];
  const app = express();
  app.use("/api/hyrox/download-redirect", createHyroxDownloadRedirectRouter({}, {
    logCalculatorEvent: async (event) => events.push(event),
  }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/hyrox/download-redirect/${SUBMISSION_ID}`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/download");
  });

  assert.deepEqual(events, [{
    sessionId: `email-${SUBMISSION_ID}`,
    submissionId: SUBMISSION_ID,
    eventName: "app_download_clicked",
    metadata: { touchpoint: "email" },
  }]);
});

test("GET /api/hyrox/download-redirect/:submissionId skips logging invalid UUIDs and still redirects", async () => {
  const events = [];
  const app = express();
  app.use("/api/hyrox/download-redirect", createHyroxDownloadRedirectRouter({}, {
    logCalculatorEvent: async (event) => events.push(event),
  }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/hyrox/download-redirect/not-a-uuid`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/download");
  });

  assert.deepEqual(events, []);
});

test("GET /api/hyrox/download-redirect/:submissionId redirects even when event logging fails", async () => {
  const app = express();
  app.use((req, _res, next) => {
    req.log = { warn() {} };
    next();
  });
  app.use("/api/hyrox/download-redirect", createHyroxDownloadRedirectRouter({}, {
    logCalculatorEvent: async () => { throw new Error("db unavailable"); },
  }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/hyrox/download-redirect/${SUBMISSION_ID}`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/download");
  });
});
