import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { marketingRouter } from "../src/routes/marketingPages.js";
import { websiteEnhancementsRouter } from "../src/routes/websiteEnhancements.js";

function buildMarketingApp() {
  const app = express();
  app.use(marketingRouter);
  return app;
}

function buildSitemapApp() {
  const app = express();
  app.use(websiteEnhancementsRouter);
  return app;
}

async function request(app, path) {
  const previousPreview = process.env.MARKETING_PREVIEW_ENABLED;
  process.env.MARKETING_PREVIEW_ENABLED = "true";
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    const body = await response.text();
    return { response, body };
  } finally {
    if (previousPreview === undefined) delete process.env.MARKETING_PREVIEW_ENABLED;
    else process.env.MARKETING_PREVIEW_ENABLED = previousPreview;
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("GET /press returns an HTML page", async () => {
  const { response } = await request(buildMarketingApp(), "/press");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
});

test("GET /press renders headline and real asset download links", async () => {
  const { body } = await request(buildMarketingApp(), "/press");
  assert.match(body, /Press/);
  assert.match(body, /href="\/images\/formai_icon\.svg" download/);
  assert.doesNotMatch(body, /formai_icon@2x\.png/);
});

test("GET /press uses configured press email", async () => {
  const saved = process.env.PRESS_EMAIL;
  process.env.PRESS_EMAIL = "media@example.com";
  try {
    const { body } = await request(buildMarketingApp(), "/press");
    assert.match(body, /media@example\.com/);
  } finally {
    if (saved === undefined) delete process.env.PRESS_EMAIL;
    else process.env.PRESS_EMAIL = saved;
  }
});

test("GET /press falls back when press and support emails are unset", async () => {
  const savedPress = process.env.PRESS_EMAIL;
  const savedSupport = process.env.SUPPORT_EMAIL;
  delete process.env.PRESS_EMAIL;
  delete process.env.SUPPORT_EMAIL;
  try {
    const { response, body } = await request(buildMarketingApp(), "/press");
    assert.equal(response.status, 200);
    assert.match(body, /hello@getforma\.fit/);
  } finally {
    if (savedPress === undefined) delete process.env.PRESS_EMAIL;
    else process.env.PRESS_EMAIL = savedPress;
    if (savedSupport === undefined) delete process.env.SUPPORT_EMAIL;
    else process.env.SUPPORT_EMAIL = savedSupport;
  }
});

test("GET /press renders brand guidelines", async () => {
  const { body } = await request(buildMarketingApp(), "/press");
  assert.match(body, /#0F172A/);
});

test("GET /press renders empty mentions placeholder", async () => {
  const { body } = await request(buildMarketingApp(), "/press");
  assert.match(body, /first to cover/i);
});

test("GET /sitemap.xml includes press page", async () => {
  const { body } = await request(buildSitemapApp(), "/sitemap.xml");
  assert.match(body, /\/press/);
});
