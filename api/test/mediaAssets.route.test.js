import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMediaAssetsHandler } from "../src/routes/mediaAssets.js";

test("media-assets exposes ready hero cards, preserves originals and leaves legacy cards null", async () => {
  let query;
  const app = express();
  app.get("/api/media-assets", createMediaAssetsHandler({ query: async (sql, params) => {
    query = { sql, params };
    return { rows: [
      { id: "modern", image_key: "hero-media/program/a.png", image_url: "https://cdn.test/original.png", renditions_at: "now", thumbhash: "hash" },
      { id: "legacy", image_key: "program/a.png", image_url: "https://cdn.test/legacy.png", renditions_at: "now", thumbhash: "hash" },
    ] };
  } }));
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/media-assets?usage_scope=program`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.items[0].imageCardUrl.endsWith("hero-media/program/a-card.webp"));
    assert.equal(body.items[0].thumbhash, "hash");
    assert.equal(body.items[0].imageUrl, "https://cdn.test/original.png");
    assert.equal(body.items[1].imageCardUrl, null);
    assert.equal(body.items[1].thumbhash, null);
    assert.deepEqual(query.params, [true, "program"]);
    assert.match(query.sql, /renditions_at, thumbhash/);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
