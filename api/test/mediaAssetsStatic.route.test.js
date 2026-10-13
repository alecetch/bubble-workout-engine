import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const assetsDir = [new URL("../../assets/media-assets/", import.meta.url), new URL("../assets/media-assets/", import.meta.url)]
  .find(dir => existsSync(dir));

async function withServer(fn) {
  assert.ok(assetsDir, "media-assets directory not found");
  const app = express();
  app.use("/assets/media-assets", express.static(fileURLToPath(assetsDir)));
  app.use("/assets/media-assets", (_req, res) => res.status(404).end());
  // Mirror the site's catch-all so a missing asset cannot silently return HTML.
  app.use((_req, res) => res.type("html").send("<html>App</html>"));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("missing media asset returns 404 instead of the HTML catch-all", async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/assets/media-assets/does-not-exist.png`);
    assert.equal(res.status, 404);
    assert.equal(await res.text(), "");
  });
});

test("existing media asset returns 200 with an image content type", async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/assets/media-assets/program/hypertrophy.png`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^image\//);
    assert.ok((await res.arrayBuffer()).byteLength > 0);
  });
});
