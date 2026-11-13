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

test("privacy and terms list the company support address, not a personal one", async () => {
  for (const path of ["/privacy", "/terms"]) {
    const { body } = await get(path);
    assert.match(body, /support@200days\.app/, path);
    assert.equal(body.includes("outlook.com"), false, path);
  }
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


for (const variant of ["forma", "200days"]) {
  test(`home and download JSON-LD follow ${variant} at request time`, async () => {
    const saved = { BRAND_VARIANT: process.env.BRAND_VARIANT, BASE_URL: process.env.BASE_URL };
    try {
      process.env.BRAND_VARIANT = variant;
      for (const override of [undefined, "https://preview.example///"]) {
        if (override === undefined) delete process.env.BASE_URL; else process.env.BASE_URL = override;
        const expected = override ? "https://preview.example" : variant === "200days" ? "https://200days.app" : "https://getforma.fit";
        for (const path of ["/", "/download"]) {
          const { response, body } = await get(path);
          assert.equal(response.status, 200);
          const schema = JSON.parse(body.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
          assert.equal(schema.name, variant === "200days" ? "200 Days" : "Forma");
          assert.equal(schema.url, expected);
          assert.equal(schema.image, expected + (variant === "200days" ? "/images/brand/200days-icon-1024.png" : "/images/forma_icon.png"));
          assert.deepEqual(schema.publisher, { "@type": "Organization", name: "Engle Consulting Limited" });
          // Each variant retains its own download and legal copy.
          if (path === "/download") {
            if (variant === "forma") assert.match(body, /<h1>Forma is coming soon<\/h1>/);
            else assert.match(body, /<h1>200 Days is coming soon<\/h1>/);
          }
        }
      }
      const { body: privacy } = await get("/privacy");
      if (variant === "forma") assert.match(privacy, /Forma is operated by Engle Consulting Limited/);
      else assert.match(privacy, /200 Days is operated by Engle Consulting Limited, trading as 200 Days/);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
}


test("unset flag preserves explicit Forma marketing body copy and footer", async () => {
  const saved = process.env.BRAND_VARIANT;
  try {
    for (const path of ["/", "/download", "/privacy", "/terms", "/hyrox", "/strength", "/press", "/support", "/testimonials"]) {
      delete process.env.BRAND_VARIANT;
      const original = await get(path, { preview: true });
      process.env.BRAND_VARIANT = "forma";
      const switched = await get(path, { preview: true });
      assert.equal(switched.response.status, original.response.status, path);
      for (const pattern of [/<main>([\s\S]*?)<\/main>/, /<footer([\s\S]*?)<\/footer>/]) {
        assert.equal(switched.body.match(pattern)[0], original.body.match(pattern)[0], path);
      }
    }
  } finally {
    if (saved === undefined) delete process.env.BRAND_VARIANT; else process.env.BRAND_VARIANT = saved;
  }
});
