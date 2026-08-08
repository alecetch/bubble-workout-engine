import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { marketingRouter } from "../src/routes/marketingPages.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(__dirname, "../..");
const webRoot = join(repoRoot, "web/dist");

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

function createRoutedApp() {
  const app = express();
  app.use(express.static(webRoot, { index: false }));
  app.use(marketingRouter);
  app.get(/.*/, (_req, res) => res.sendFile(join(webRoot, "index.html")));
  return app;
}

test("GET / falls through static web root and renders marketing home", async () => {
  await withServer(createRoutedApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /Train with your data/);
    assert.match(body, /Try the free HYROX calculator/);
    assert.doesNotMatch(body, /<div id="root"/);
  });
});

test("GET /hyrox-calculator still receives the React shell", async () => {
  await withServer(createRoutedApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/hyrox-calculator`);
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /<div id="root"/);
  });
});
