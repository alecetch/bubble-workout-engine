import { requestHttp } from "./helpers/requestHttp.js";
import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import logger from "../src/utils/logger.js";
import { wellKnownRouter } from "../src/routes/wellKnown.js";
import { canonicalHost } from "../src/middleware/canonicalHost.js";

const paths = ["/.well-known/apple-app-site-association", "/.well-known/assetlinks.json"];
let saved;
beforeEach(() => {
  const keys = ["APPLE_APP_ID", "ANDROID_CERT_SHA256", "ANDROID_PACKAGE_NAME", "CANONICAL_HOST", "REDIRECT_HOSTS", "BRAND_VARIANT"];
  saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  process.env.ANDROID_CERT_SHA256 = "AA:BB";
});
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

async function withServer(fn) {
  const app = express();
  app.use(canonicalHost);
  app.use(wellKnownRouter);
  app.use((_req, res) => res.type("html").send("<html>SPA or marketing fallback</html>"));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise(resolve => server.once("listening", resolve));
    await fn(async (path, host = "getforma.fit", method = "GET") => {
      const result = await requestHttp(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { Host: host } });
      return { response: { status: result.status, headers: { get: key => result.headers[key.toLowerCase()] ?? null } }, text: result.text };
    });
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test("unset and empty Android certificates return [] and warn only once per process", async t => {
  const warning = t.mock.method(logger, "warn", () => {});
  await withServer(async request => {
    for (const value of [undefined, undefined, "", " , , "]) {
      if (value === undefined) delete process.env.ANDROID_CERT_SHA256; else process.env.ANDROID_CERT_SHA256 = value;
      const { response, text } = await request(paths[1]);
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(text), []);
    }
  });
  assert.equal(warning.mock.calls.length, 1);
  assert.match(warning.mock.calls[0].arguments[0], /ANDROID_CERT_SHA256/);
});

test("both verification paths are cacheable JSON with the exact default IDs", async () => {
  await withServer(async request => {
    const apple = await request(paths[0]);
    const android = await request(paths[1]);
    for (const { response, text } of [apple, android]) {
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /^application\/json/);
      assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
      assert.equal(response.headers.get("location"), null);
      assert.doesNotMatch(text, /<html/);
    }
    assert.deepEqual(JSON.parse(apple.text), { applinks: { details: [{ appIDs: ["NNHW7677GQ.fit.get200days.app"], components: [{ "/": "/ref/*" }] }] } });
    assert.deepEqual(JSON.parse(android.text), [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "fit.get200days.app", sha256_cert_fingerprints: ["AA:BB"] } }]);
  });
});

test("app IDs, package and trimmed fingerprints reflect request-time overrides", async () => {
  await withServer(async request => {
    process.env.APPLE_APP_ID = "OTHER.fit.custom.app";
    process.env.ANDROID_PACKAGE_NAME = "fit.custom.app";
    process.env.ANDROID_CERT_SHA256 = " AA:BB, CC:DD ,, ";
    assert.deepEqual(JSON.parse((await request(paths[0])).text).applinks.details[0].appIDs, ["OTHER.fit.custom.app"]);
    assert.deepEqual(JSON.parse((await request(paths[1])).text)[0].target, { namespace: "android_app", package_name: "fit.custom.app", sha256_cert_fingerprints: ["AA:BB", "CC:DD"] });
    process.env.APPLE_APP_ID = "NEXT.fit.custom.app";
    process.env.ANDROID_CERT_SHA256 = "EE:FF";
    assert.deepEqual(JSON.parse((await request(paths[0])).text).applinks.details[0].appIDs, ["NEXT.fit.custom.app"]);
    assert.deepEqual(JSON.parse((await request(paths[1])).text)[0].target.sha256_cert_fingerprints, ["EE:FF"]);
  });
});

test("verification stays JSON on every host and brand with the redirect enabled, including HEAD", async () => {
  process.env.CANONICAL_HOST = "200days.app";
  await withServer(async request => {
    for (const variant of ["forma", "200days"]) {
      process.env.BRAND_VARIANT = variant;
      for (const host of ["getforma.fit", "200days.app", "bubble-workout-api.fly.dev", "localhost"]) {
        for (const path of paths) {
          const { response, text } = await request(path, host);
          assert.equal(response.status, 200);
          assert.equal(response.headers.get("location"), null);
          assert.doesNotMatch(text, /<html/);
          const head = await request(path, host, "HEAD");
          assert.equal(head.response.status, 200);
          assert.match(head.response.headers.get("content-type"), /^application\/json/);
          assert.equal(head.response.headers.get("cache-control"), "public, max-age=3600");
          assert.equal(head.text, "");
        }
      }
    }
  });
});
