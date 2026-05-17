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
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    const body = await response.text();
    return { response, body };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

function headHtml(body) {
  return body.match(/<head>[\s\S]*?<\/head>/)?.[0] ?? "";
}

test("GET /hyrox returns an HTML page", async () => {
  const { response } = await request(buildMarketingApp(), "/hyrox");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
});

test("GET /hyrox renders Hyrox copy and CTA", async () => {
  const saved = process.env.APP_STORE_URL;
  process.env.APP_STORE_URL = "https://apps.apple.com/formai-test";
  try {
    const { body } = await request(buildMarketingApp(), "/hyrox");
    assert.match(body, /Hyrox/);
    assert.match(body, /href="https:\/\/apps\.apple\.com\/formai-test"/);
  } finally {
    if (saved === undefined) delete process.env.APP_STORE_URL;
    else process.env.APP_STORE_URL = saved;
  }
});

test("GET /hyrox includes sport-specific SEO metadata", async () => {
  const saved = process.env.BASE_URL;
  process.env.BASE_URL = "";
  try {
    const { body } = await request(buildMarketingApp(), "/hyrox");
    const head = headHtml(body);
    assert.match(head, /og:title/);
    assert.match(head, /Hyrox/);
    assert.match(head, /application\/ld\+json/);
  } finally {
    if (saved === undefined) delete process.env.BASE_URL;
    else process.env.BASE_URL = saved;
  }
});

test("GET /strength returns an HTML page", async () => {
  const { response } = await request(buildMarketingApp(), "/strength");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
});

test("GET /strength renders strength copy and CTA", async () => {
  const { body } = await request(buildMarketingApp(), "/strength");
  assert.match(body, /strength/i);
  assert.match(body, /href="#"/);
});

test("GET /strength includes sport-specific SEO metadata", async () => {
  const { body } = await request(buildMarketingApp(), "/strength");
  const head = headHtml(body);
  assert.match(head, /og:title/);
  assert.match(head, /Strength/);
  assert.match(head, /application\/ld\+json/);
});

test("GET /hyrox includes email capture strip", async () => {
  const { body } = await request(buildMarketingApp(), "/hyrox");
  assert.match(body, /action="\/signup"/);
});

test("GET /strength includes email capture strip", async () => {
  const { body } = await request(buildMarketingApp(), "/strength");
  assert.match(body, /action="\/signup"/);
});

test("GET /hyrox and GET /strength have different og:descriptions", async () => {
  const [hyrox, strength] = await Promise.all([
    request(buildMarketingApp(), "/hyrox"),
    request(buildMarketingApp(), "/strength"),
  ]);
  const extractDesc = (html) => headHtml(html).match(/og:description[^>]*content="([^"]+)"/)?.[1] ?? "";
  const hyroxDesc = extractDesc(hyrox.body);
  const strengthDesc = extractDesc(strength.body);
  assert.ok(hyroxDesc.length > 0, "hyrox og:description should be non-empty");
  assert.ok(strengthDesc.length > 0, "strength og:description should be non-empty");
  assert.notEqual(hyroxDesc, strengthDesc);
});

test("GET /sitemap.xml includes sport landing pages", async () => {
  const { response, body } = await request(buildSitemapApp(), "/sitemap.xml");
  assert.equal(response.status, 200);
  assert.match(body, /\/hyrox/);
  assert.match(body, /\/strength/);
});
