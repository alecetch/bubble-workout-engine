import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  createLandingPageHandler,
  createReferralPreviewHandler,
} from "../src/routes/referralLanding.js";

function makeDb() {
  return {
    calls: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      if (params?.[0] === "VALIDCODE") {
        return { rows: [{ email: "alec@example.com" }] };
      }
      return { rows: [] };
    },
  };
}

async function withServer(app, fn) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const port = server.address().port;
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function makeApp(db = makeDb()) {
  const app = express();
  app.get("/ref/:code", createLandingPageHandler(db));
  app.get("/api/referral/preview/:code", createReferralPreviewHandler(db));
  return { app, db };
}

test("GET /ref/VALIDCODE renders the referrer name and code", async () => {
  const { app } = makeApp();

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ref/VALIDCODE`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(body, /Alec invited you/);
    assert.match(body, /VALIDCODE/);
  });
});

test("GET /ref/UNKNOWNCODE renders a generic landing page", async () => {
  const { app } = makeApp();

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ref/UNKNOWNCODE`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(body, /A friend invited you/);
  });
});

test("GET /ref/VALIDCODE does not expose the referrer's email", async () => {
  const { app } = makeApp();

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ref/VALIDCODE`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body.includes("alec@example.com"), false);
  });
});

test("GET /ref/<script>alert(1)</script> escapes the displayed code", async () => {
  const { app } = makeApp();
  const encoded = encodeURIComponent("<script>alert(1)</script>");

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/ref/${encoded}`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /&lt;script&gt;/);
    assert.equal(body.includes("<script>alert(1)</script>"), false);
  });
});

test("GET /api/referral/preview/VALIDCODE returns a public preview", async () => {
  const { app } = makeApp();

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/referral/preview/VALIDCODE`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { valid: true, referrerFirstName: "Alec" });
  });
});

test("GET /api/referral/preview/UNKNOWNCODE returns an invalid preview", async () => {
  const { app } = makeApp();

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/referral/preview/UNKNOWNCODE`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { valid: false });
  });
});

test("GET /api/referral/preview/VALIDCODE does not expose the referrer's email", async () => {
  const { app } = makeApp();

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/referral/preview/VALIDCODE`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body.includes("alec@example.com"), false);
  });
});
