import { requestHttp } from "./helpers/requestHttp.js";
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { canonicalHost } from "../src/middleware/canonicalHost.js";

let saved;
beforeEach(() => {
  saved = { CANONICAL_HOST: process.env.CANONICAL_HOST, REDIRECT_HOSTS: process.env.REDIRECT_HOSTS };
  process.env.CANONICAL_HOST = "200days.app";
  delete process.env.REDIRECT_HOSTS;
});
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

async function request(host, path = "/", method = "GET", headers = {}) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(canonicalHost);
  app.use((_req, res) => res.json({ reached: true }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise(resolve => server.once("listening", resolve));
    const response = await requestHttp(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { Host: host, ...headers } });
    return { status: response.status, location: response.headers.location ?? null, body: response.text };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

for (const [host, path] of [["getforma.fit", "/"], ["www.getforma.fit", "/privacy"], ["www.200days.app", "/blog"], ["getforma.fit", "/ref/ABCD2345?source=x"], ["GetForma.Fit:443", "/terms?x=one%20two&x=three"]]) {
  test(`redirect ${host}${path} preserving path and query`, async () => {
    const response = await request(host, path);
    assert.equal(response.status, 301);
    assert.equal(response.location, `https://200days.app${path}`);
  });
}

test("HEAD old-host page redirects with no body", async () => {
  const result = await request("getforma.fit", "/terms", "HEAD");
  assert.equal(result.status, 301);
  assert.equal(result.location, "https://200days.app/terms");
  assert.equal(result.body, "");
});

for (const host of ["200days.app", "bubble-workout-api.fly.dev", "localhost", "127.0.0.1:3000", "[::1]:3000", "unlisted.example.com", "notgetforma.fit"]) {
  test(`${host} passes through`, async () => {
    const result = await request(host);
    assert.equal(result.status, 200);
    assert.equal(result.location, null);
    assert.deepEqual(JSON.parse(result.body), { reached: true });
  });
}

for (const path of ["/.well-known/assetlinks.json", "/.well-known/apple-app-site-association", "/health", "/health/check", "/api/users/me", "/api", "/admin-ui/", "/admin/health"]) {
  test(`old-host protected path ${path} passes through`, async () => {
    for (const method of ["GET", "HEAD"]) {
      const result = await request("getforma.fit", path, method);
      assert.equal(result.status, 200);
      assert.equal(result.location, null);
    }
  });
}

for (const [method, path] of [["POST", "/api/webhooks/revenuecat"], ["POST", "/signup"], ["PUT", "/terms"], ["DELETE", "/ref/ABCD"], ["OPTIONS", "/"]]) {
  test(`${method} ${path} never redirects`, async () => {
    const result = await request("getforma.fit", path, method);
    assert.equal(result.status, 200);
    assert.equal(result.location, null);
  });
}

test("unset/empty canonical host disables redirects and env toggles per request", async () => {
  for (const value of [undefined, "", "   "]) {
    if (value === undefined) delete process.env.CANONICAL_HOST; else process.env.CANONICAL_HOST = value;
    assert.equal((await request("getforma.fit")).status, 200);
  }
  process.env.CANONICAL_HOST = "Example.COM";
  assert.equal((await request("getforma.fit")).location, "https://example.com/");
  assert.equal((await request("www.example.com")).location, "https://example.com/");
  assert.equal((await request("example.com")).status, 200);
});

test("extra redirect hosts are trimmed, lower-cased and read per request", async () => {
  assert.equal((await request("old.example.com")).status, 200);
  process.env.REDIRECT_HOSTS = " , OLD.example.com , other.example.com, ";
  assert.equal((await request("old.example.com", "/privacy")).location, "https://200days.app/privacy");
  assert.equal((await request("other.example.com")).status, 301);
  delete process.env.REDIRECT_HOSTS;
  assert.equal((await request("old.example.com")).status, 200);
});

test("uses trusted req.hostname and falls back to Host only if absent", async () => {
  assert.equal((await request("localhost", "/", "GET", { "X-Forwarded-Host": "getforma.fit" })).status, 301);
  let location;
  canonicalHost({ hostname: undefined, get: () => "GetForma.Fit:443", method: "GET", path: "/", originalUrl: "/?source=x" }, {
    redirect(status, target) { assert.equal(status, 301); location = target; },
  }, () => assert.fail("expected redirect"));
  assert.equal(location, "https://200days.app/?source=x");
});
