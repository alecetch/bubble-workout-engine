import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createDownloadNotifyHandler, marketingRouter } from "../src/routes/marketingPages.js";

function mockDb() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("GET /download is a coming soon notify page", async () => {
  const app = express();
  app.use(marketingRouter);
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/download`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Forma is coming soon/);
    assert.match(body, /forma_icon\.png/);
    assert.match(body, /action="\/download\/notify"/);
    assert.match(body, /Notify me/);
    assert.doesNotMatch(body, /App Store/);
    assert.doesNotMatch(body, /<svg/);
  });
});

test("GET /download?notified=1 shows inline confirmation", async () => {
  const app = express();
  app.use(marketingRouter);
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/download?notified=1`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /You're on the list/);
    assert.doesNotMatch(body, /action="\/download\/notify"/);
  });
});

test("POST /download/notify stores source and redirects", async () => {
  const db = mockDb();
  const app = express();
  app.post("/download/notify", express.urlencoded({ extended: false }), createDownloadNotifyHandler(db));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/download/notify`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=User%40Example.com",
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/download?notified=1");
    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].sql, /email_signups/);
    assert.deepEqual(db.calls[0].params, ["user@example.com", "download_notify_me"]);
  });
});

test("POST /download/notify rejects invalid email inline", async () => {
  const db = mockDb();
  const app = express();
  app.post("/download/notify", express.urlencoded({ extended: false }), createDownloadNotifyHandler(db));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/download/notify`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=not-an-email",
    });
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, /Please enter a valid email address/);
    assert.equal(db.calls.length, 0);
  });
});
