import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  affiliateProgramRouter,
  createAffiliateApplicationsCsvHandler,
  createAffiliateHandlers,
} from "../src/routes/affiliateProgram.js";
import { requireInternalToken } from "../src/middleware/auth.js";

function mockDb(rows = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows };
    },
  };
}

function buildApp() {
  const app = express();
  app.use(affiliateProgramRouter);
  return app;
}

function buildAppWithMockDb(db = mockDb()) {
  const { renderForm, postHandler } = createAffiliateHandlers(db);
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.get("/partners", (_req, res) => renderForm(res));
  app.post("/partners", postHandler);
  return { app, db };
}

function buildAdminApp(db) {
  const app = express();
  app.get("/admin/affiliate-applications", requireInternalToken, createAffiliateApplicationsCsvHandler(db));
  return app;
}

async function request(app, path, options = {}) {
  const previousPreview = process.env.MARKETING_PREVIEW_ENABLED;
  process.env.MARKETING_PREVIEW_ENABLED = "true";
  const server = app.listen(0);
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
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

test("GET /partners returns html", async () => {
  const { response } = await request(buildApp(), "/partners");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
});

test("GET /partners renders application form", async () => {
  const { body } = await request(buildApp(), "/partners");
  assert.match(body, /<form/);
  assert.match(body, /name="email"/);
});

test("GET /partners renders configured commission text", async () => {
  const saved = process.env.AFFILIATE_COMMISSION_TEXT;
  process.env.AFFILIATE_COMMISSION_TEXT = "25%";
  try {
    const { body } = await request(buildApp(), "/partners");
    assert.match(body, /25%/);
  } finally {
    if (saved === undefined) delete process.env.AFFILIATE_COMMISSION_TEXT;
    else process.env.AFFILIATE_COMMISSION_TEXT = saved;
  }
});

test("GET /partners renders fallback commission text", async () => {
  const saved = process.env.AFFILIATE_COMMISSION_TEXT;
  delete process.env.AFFILIATE_COMMISSION_TEXT;
  try {
    const { body } = await request(buildApp(), "/partners");
    assert.match(body, /commission/i);
    assert.match(body, /generous/);
  } finally {
    if (saved === undefined) delete process.env.AFFILIATE_COMMISSION_TEXT;
    else process.env.AFFILIATE_COMMISSION_TEXT = saved;
  }
});

test("POST /partners with valid fields inserts and redirects", async () => {
  const { app, db } = buildAppWithMockDb();
  const { response } = await request(app, "/partners", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "name=Coach%20Alex&email=Coach%40Example.COM&platform=coach&audience_size=250%20clients&note=Hyrox%20coach",
    redirect: "manual",
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/partners/applied");
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ["Coach Alex", "coach@example.com", "coach", "250 clients", "Hyrox coach"]);
});

test("POST /partners missing name re-renders with error", async () => {
  const { app, db } = buildAppWithMockDb();
  const { response, body } = await request(app, "/partners", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "name=&email=test%40example.com&platform=instagram",
    redirect: "manual",
  });
  assert.equal(response.status, 200);
  assert.match(body, /name/i);
  assert.equal(db.calls.length, 0);
});

test("POST /partners invalid email re-renders with error", async () => {
  const { app, db } = buildAppWithMockDb();
  const { response, body } = await request(app, "/partners", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "name=Test&email=notanemail&platform=youtube",
    redirect: "manual",
  });
  assert.equal(response.status, 200);
  assert.match(body, /valid email/i);
  assert.equal(db.calls.length, 0);
});

test("POST /partners missing platform re-renders with error", async () => {
  const { app, db } = buildAppWithMockDb();
  const { response, body } = await request(app, "/partners", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "name=Test&email=test%40example.com&platform=",
    redirect: "manual",
  });
  assert.equal(response.status, 200);
  assert.match(body, /platform|audience/i);
  assert.equal(db.calls.length, 0);
});

test("GET /partners/applied renders thank you page", async () => {
  const { response, body } = await request(buildApp(), "/partners/applied");
  assert.equal(response.status, 200);
  assert.match(body, /received|application/i);
});

test("GET /admin/affiliate-applications without auth returns 401", async () => {
  const { response } = await request(buildAdminApp(mockDb()), "/admin/affiliate-applications");
  assert.equal(response.status, 401);
});

test("GET /admin/affiliate-applications with auth returns csv", async () => {
  const saved = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "test-token";
  const db = mockDb([
    {
      id: 1,
      name: "Coach Alex",
      email: "coach@example.com",
      platform: "coach",
      audience_size: "250 clients",
      note: "London, Manchester",
      created_at: new Date("2026-05-16T00:00:00Z"),
    },
  ]);
  try {
    const { response, body } = await request(buildAdminApp(db), "/admin/affiliate-applications", {
      headers: { "x-internal-token": "test-token" },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/csv/);
    assert.match(body, /id,name,email,platform,audience_size,note,created_at/);
    assert.match(body, /"London, Manchester"/);
  } finally {
    if (saved === undefined) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = saved;
  }
});
