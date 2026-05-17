import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  createAdminEmailSignupsHandler,
  createSignupHandlers,
  websiteEnhancementsRouter,
} from "../src/routes/websiteEnhancements.js";
import { marketingRouter } from "../src/routes/marketingPages.js";
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
  app.use(websiteEnhancementsRouter);
  return withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}${path}`);
    const body = await response.text();
    return { response, body };
  });
}

test("GET /robots.txt returns sitemap reference", async () => {
  const { response, body } = await get("/robots.txt");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/plain/);
  assert.match(body, /Sitemap:/);
});

test("GET /sitemap.xml lists enhanced routes", async () => {
  const { response, body } = await get("/sitemap.xml");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/xml/);
  assert.match(body, /\/pricing/);
  assert.match(body, /\/hyrox/);
  assert.match(body, /\/strength/);
  assert.match(body, /\/testimonials/);
  assert.match(body, /\/press/);
  assert.match(body, /\/guides/);
  assert.match(body, /\/guides\/hyrox-race-prep-plan/);
  assert.match(body, /\/partners/);
  assert.match(body, /\/blog/);
  assert.match(body, /\/changelog/);
  assert.match(body, /\/blog\/hyrox-training-block/);
});

test("GET /pricing renders pricing page and fallback pricing", async () => {
  const previous = process.env.MONTHLY_PRICE;
  delete process.env.MONTHLY_PRICE;
  try {
    const { response, body } = await get("/pricing");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(body, /free trial/i);
    assert.match(body, /See App Store for pricing/);
  } finally {
    if (previous == null) delete process.env.MONTHLY_PRICE;
    else process.env.MONTHLY_PRICE = previous;
  }
});

test("GET /signup renders signup form", async () => {
  const { response, body } = await get("/signup");
  assert.equal(response.status, 200);
  assert.match(body, /<form/);
});

test("POST /signup inserts valid email and redirects", async () => {
  const db = mockDb();
  const { postHandler } = createSignupHandlers(db);
  const app = express();
  app.post("/signup", express.urlencoded({ extended: false }), postHandler);

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/signup`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=User%40Example.com",
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/signup/confirmed");
    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].sql, /ON CONFLICT \(email\) DO NOTHING/);
    assert.deepEqual(db.calls[0].params, ["user@example.com"]);
  });
});

test("POST /signup duplicate email still redirects", async () => {
  const db = mockDb();
  const { postHandler } = createSignupHandlers(db);
  const app = express();
  app.post("/signup", express.urlencoded({ extended: false }), postHandler);

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/signup`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=user%40example.com",
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/signup/confirmed");
  });
});

test("POST /signup rejects malformed email", async () => {
  const { postHandler } = createSignupHandlers(mockDb());
  const app = express();
  app.post("/signup", express.urlencoded({ extended: false }), postHandler);

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/signup`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=notanemail",
    });
    const body = await response.text();
    assert.equal(response.status, 400);
    assert.match(body, /valid email/);
  });
});

test("GET /signup/confirmed renders confirmation", async () => {
  const { response, body } = await get("/signup/confirmed");
  assert.equal(response.status, 200);
  assert.match(body, /list/i);
});

test("GET /blog and post routes render markdown content", async () => {
  const blog = await get("/blog");
  assert.equal(blog.response.status, 200);
  assert.match(blog.body, /Hyrox/);

  const post = await get("/blog/hyrox-training-block");
  assert.equal(post.response.status, 200);
  assert.match(post.body, /Hyrox/);

  const missing = await get("/blog/nonexistent-slug");
  assert.equal(missing.response.status, 404);
});

test("GET /changelog renders version history", async () => {
  const { response, body } = await get("/changelog");
  assert.equal(response.status, 200);
  assert.match(body, /v1/);
});

test("GET /admin/email-signups requires auth and exports CSV when authenticated", async () => {
  const previous = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "test-token";
  const db = mockDb([{ id: 1, email: "user@example.com", source: "website", created_at: new Date("2026-05-16T00:00:00Z") }]);
  const app = express();
  app.get("/admin/email-signups", requireInternalToken, createAdminEmailSignupsHandler(db));

  try {
    await withServer(app, async (baseUrl) => {
      const denied = await fetch(`${baseUrl}/admin/email-signups`);
      assert.equal(denied.status, 401);

      const allowed = await fetch(`${baseUrl}/admin/email-signups`, {
        headers: { "x-internal-token": "test-token" },
      });
      const body = await allowed.text();
      assert.equal(allowed.status, 200);
      assert.match(allowed.headers.get("content-type") ?? "", /text\/csv/);
      assert.match(body, /user@example\.com/);
    });
  } finally {
    if (previous == null) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = previous;
  }
});

test("new HTML pages return text/html", async () => {
  for (const path of ["/pricing", "/signup", "/signup/confirmed", "/blog", "/blog/hyrox-training-block", "/changelog"]) {
    const { response } = await get(path);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  }
});

test("existing marketing home includes SEO metadata", async () => {
  const app = express();
  app.use(marketingRouter);
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /og:title/);
  });
});

test("GET /blog/:slug with non-alphanumeric slug returns 404", async () => {
  const { response } = await get("/blog/../etc/passwd");
  assert.equal(response.status, 404);
});

test("GET /admin/email-signups with wrong token returns 401", async () => {
  const previous = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "real-token";
  const app = express();
  app.get("/admin/email-signups", requireInternalToken, createAdminEmailSignupsHandler(mockDb()));
  try {
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/admin/email-signups`, {
        headers: { "x-internal-token": "wrong-token" },
      });
      assert.equal(response.status, 401);
    });
  } finally {
    if (previous == null) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = previous;
  }
});

test("GET /admin/email-signups CSV has correct header row", async () => {
  const previous = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "test-token";
  const app = express();
  app.get("/admin/email-signups", requireInternalToken, createAdminEmailSignupsHandler(mockDb()));
  try {
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/admin/email-signups`, {
        headers: { "x-internal-token": "test-token" },
      });
      const body = await response.text();
      assert.match(body, /^id,email,source,created_at/);
    });
  } finally {
    if (previous == null) delete process.env.INTERNAL_API_TOKEN;
    else process.env.INTERNAL_API_TOKEN = previous;
  }
});

test("GET /robots.txt includes BASE_URL in sitemap reference", async () => {
  const previous = process.env.BASE_URL;
  process.env.BASE_URL = "https://example-test.com";
  try {
    const { body } = await get("/robots.txt");
    assert.match(body, /https:\/\/example-test\.com\/sitemap\.xml/);
  } finally {
    if (previous == null) delete process.env.BASE_URL;
    else process.env.BASE_URL = previous;
  }
});

test("GET /pricing with price env vars renders prices", async () => {
  const savedMonthly = process.env.MONTHLY_PRICE;
  const savedAnnual = process.env.ANNUAL_PRICE;
  process.env.MONTHLY_PRICE = "£9.99";
  process.env.ANNUAL_PRICE = "£79.99";
  try {
    const { body } = await get("/pricing");
    assert.match(body, /£9\.99/);
    assert.match(body, /£79\.99/);
  } finally {
    if (savedMonthly == null) delete process.env.MONTHLY_PRICE;
    else process.env.MONTHLY_PRICE = savedMonthly;
    if (savedAnnual == null) delete process.env.ANNUAL_PRICE;
    else process.env.ANNUAL_PRICE = savedAnnual;
  }
});
