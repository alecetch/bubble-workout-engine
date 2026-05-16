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

async function get(path) {
  const app = express();
  app.use(marketingRouter);
  return withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${path}`);
    const body = await response.text();
    return { response, body };
  });
}

test("GET / returns HTML with Formai and App Store copy", async () => {
  const { response, body } = await get("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.match(body, /Formai/);
  assert.match(body, /App Store/);
});

test("GET / includes the hero image reference", async () => {
  const { body } = await get("/");
  assert.match(body, /formai_hero@2x\.png/);
});

test("GET /download includes an inline QR SVG", async () => {
  const { response, body } = await get("/download");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.match(body, /<svg/);
});

test("GET /download still returns 200 when APP_STORE_URL is empty", async () => {
  const previous = process.env.APP_STORE_URL;
  process.env.APP_STORE_URL = "";
  try {
    const { response } = await get("/download");
    assert.equal(response.status, 200);
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
    const { response, body } = await get("/support");
    assert.equal(response.status, 200);
    assert.match(body, /Frequently asked questions/);
    assert.match(body, /help@example\.com/);
  } finally {
    if (previous == null) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = previous;
  }
});

test("all marketing routes return HTML", async () => {
  for (const path of ["/", "/download", "/privacy", "/terms", "/support"]) {
    const { response } = await get(path);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  }
});
