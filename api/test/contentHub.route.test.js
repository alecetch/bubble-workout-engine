import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { contentHubRouter, createGuideSignupHandler } from "../src/routes/contentHub.js";
import { websiteEnhancementsRouter } from "../src/routes/websiteEnhancements.js";

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

function buildApp() {
  const app = express();
  app.use(contentHubRouter);
  return app;
}

function buildPostApp(db) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.post("/guides/:slug/signup", createGuideSignupHandler(db));
  return app;
}

function buildSitemapApp() {
  const app = express();
  app.use(websiteEnhancementsRouter);
  return app;
}

async function request(app, path, options = {}) {
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
    const body = await response.text();
    return { response, body };
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("GET /guides returns an HTML page", async () => {
  const { response } = await request(buildApp(), "/guides");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
});

test("GET /guides renders starter guide cards", async () => {
  const { body } = await request(buildApp(), "/guides");
  assert.match(body, /The Complete Hyrox Race Prep Guide/);
  assert.match(body, /Progressive Overload/);
});

test("GET /guides/hyrox-race-prep-plan renders guide content", async () => {
  const { response, body } = await request(buildApp(), "/guides/hyrox-race-prep-plan");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  assert.match(body, /The Complete Hyrox Race Prep Guide/);
});

test("GET /guides/hyrox-race-prep-plan includes table of contents and lead magnet", async () => {
  const { body } = await request(buildApp(), "/guides/hyrox-race-prep-plan");
  assert.match(body, /guide-toc/);
  assert.match(body, /lead-magnet-box/);
  assert.match(body, /<form/);
});

test("GET /guides/progressive-overload-complete-guide has no lead magnet", async () => {
  const { response, body } = await request(buildApp(), "/guides/progressive-overload-complete-guide");
  assert.equal(response.status, 200);
  assert.doesNotMatch(body, /lead-magnet-box/);
});

test("GET /guides/nonexistent-slug returns 404", async () => {
  const { response } = await request(buildApp(), "/guides/nonexistent-slug");
  assert.equal(response.status, 404);
});

test("POST guide signup stores source guide and redirects to download", async () => {
  const db = mockDb();
  const { response } = await request(buildPostApp(db), "/guides/hyrox-race-prep-plan/signup", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "email=Reader%40Example.com",
    redirect: "manual",
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") ?? "", /\/downloads\/hyrox-race-prep-template\.pdf/);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /ON CONFLICT \(email\) DO NOTHING/);
  assert.deepEqual(db.calls[0].params, ["reader@example.com", "guide"]);
});

test("POST guide signup duplicate still redirects", async () => {
  const db = mockDb();
  const { response } = await request(buildPostApp(db), "/guides/hyrox-race-prep-plan/signup", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "email=reader%40example.com",
    redirect: "manual",
  });
  assert.equal(response.status, 302);
});

test("POST guide signup invalid email redirects back with error", async () => {
  const { response } = await request(buildPostApp(mockDb()), "/guides/hyrox-race-prep-plan/signup", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "email=bad-email",
    redirect: "manual",
  });
  assert.equal(response.status, 302);
  assert.match(response.headers.get("location") ?? "", /\/guides\/hyrox-race-prep-plan\?error=invalid-email/);
});

test("POST guide signup to guide with no lead magnet returns 400", async () => {
  const { response } = await request(buildPostApp(mockDb()), "/guides/progressive-overload-complete-guide/signup", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "email=test%40example.com",
    redirect: "manual",
  });
  assert.equal(response.status, 400);
});

test("POST guide signup to non-existent slug returns 404", async () => {
  const { response } = await request(buildPostApp(mockDb()), "/guides/does-not-exist/signup", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "email=test%40example.com",
    redirect: "manual",
  });
  assert.equal(response.status, 404);
});

test("GET /guides/progressive-overload-complete-guide includes table of contents", async () => {
  const { body } = await request(buildApp(), "/guides/progressive-overload-complete-guide");
  assert.match(body, /guide-toc/);
});

test("GET /sitemap.xml includes guides and guide slugs", async () => {
  const { body } = await request(buildSitemapApp(), "/sitemap.xml");
  assert.match(body, /\/guides/);
  assert.match(body, /\/guides\/hyrox-race-prep-plan/);
  assert.match(body, /\/guides\/progressive-overload-complete-guide/);
});
