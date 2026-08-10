import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

function createRoutedApp(webRoot) {
  const app = express();
  app.use(express.static(webRoot, { index: false }));
  app.use(marketingRouter);
  app.get(/.*/, (_req, res) => res.sendFile(join(webRoot, "index.html")));
  return app;
}

// Uses a throwaway fixture dir rather than the real web/dist build - the React
// app isn't built as part of the API test job, so asserting against the actual
// build output would make this test dependent on a local `npm run build` having
// been run first, and fail on a clean checkout.
function withFixtureWebRoot(fn) {
  const webRoot = mkdtempSync(join(tmpdir(), "web-root-"));
  writeFileSync(join(webRoot, "index.html"), '<!doctype html><html><body><div id="root"></div></body></html>');
  return fn(webRoot).finally(() => rmSync(webRoot, { recursive: true, force: true }));
}

test("GET / falls through static web root and renders marketing home", async () => {
  await withFixtureWebRoot((webRoot) => withServer(createRoutedApp(webRoot), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Train with your data/);
    assert.match(body, /Try the free HYROX calculator/);
    assert.doesNotMatch(body, /<div id="root"/);
  }));
});

test("GET /hyrox-calculator still receives the React shell", async () => {
  await withFixtureWebRoot((webRoot) => withServer(createRoutedApp(webRoot), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/hyrox-calculator`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /<div id="root"/);
  }));
});
