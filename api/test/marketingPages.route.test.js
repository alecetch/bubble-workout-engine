import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { marketingRouter } from "../src/routes/marketingPages.js";

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

async function get(path, { preview = false } = {}) {
  const app = express();
  app.use(marketingRouter);
  const previousPreview = process.env.MARKETING_PREVIEW_ENABLED;
  if (preview) process.env.MARKETING_PREVIEW_ENABLED = "true";
  return withServer(app, async (baseUrl) => {
    try {
      const response = await fetch(`${baseUrl}${path}`);
      const body = await response.text();
      return { response, body };
    } finally {
      if (previousPreview == null) delete process.env.MARKETING_PREVIEW_ENABLED;
      else process.env.MARKETING_PREVIEW_ENABLED = previousPreview;
    }
  });
}

test("GET / returns HTML with Forma and calculator copy", async () => {
  const { response, body } = await get("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.match(body, /Forma/);
  assert.match(body, /free HYROX calculator/);
  assert.doesNotMatch(body, /Download on App Store/);
});

test("GET / includes the Forma masthead image reference", async () => {
  const { body } = await get("/");
  assert.match(body, /forma_masthead\.png/);
});

test("GET /download renders coming soon notify form", async () => {
  const { response, body } = await get("/download");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.match(body, /Forma is coming soon/);
  assert.match(body, /action="\/download\/notify"/);
  assert.doesNotMatch(body, /<svg/);
  assert.doesNotMatch(body, /App Store/);
});

test("GET /download still returns 200 when APP_STORE_URL is empty", async () => {
  const previous = process.env.APP_STORE_URL;
  process.env.APP_STORE_URL = "";
  try {
    const { response, body } = await get("/download");
    assert.equal(response.status, 200);
    assert.match(body, /Notify me/);
  } finally {
    if (previous == null) delete process.env.APP_STORE_URL;
    else process.env.APP_STORE_URL = previous;
  }
});

test("GET /privacy renders published privacy content", async () => {
  const { response, body } = await get("/privacy");
  assert.equal(response.status, 200);
  assert.match(body, /Privacy Policy/);
  assert.match(body, /Engle Consulting Limited/);
  assert.match(body, /15 May 2026/);
  assert.equal(body.includes("STATUS: DRAFT"), false);
});

test("GET /terms renders published terms content", async () => {
  const { response, body } = await get("/terms");
  assert.equal(response.status, 200);
  assert.match(body, /Terms of Service/);
  assert.match(body, /Engle Consulting Limited/);
  assert.match(body, /arbitration/i);
  assert.equal(body.includes("STATUS: DRAFT"), false);
});

test("GET /support renders FAQs and support email", async () => {
  const previous = process.env.SUPPORT_EMAIL;
  process.env.SUPPORT_EMAIL = "help@example.com";
  try {
  const { response, body } = await get("/support", { preview: true });
    assert.equal(response.status, 200);
    assert.match(body, /Frequently asked questions/);
    assert.match(body, /help@example\.com/);
  } finally {
    if (previous == null) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = previous;
  }
});

test("all marketing routes return HTML", async () => {
  for (const path of ["/", "/download", "/privacy", "/terms"]) {
    const { response } = await get(path);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  }
});
