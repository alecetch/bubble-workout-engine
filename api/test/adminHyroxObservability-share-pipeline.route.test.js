import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createAdminHyroxObservabilityRouter } from "../src/routes/adminHyroxObservability.js";

async function withServer(app, fn) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /share-pipeline aggregates event counts, percentages, cache hit rates, and p95 durations", async () => {
  process.env.INTERNAL_API_TOKEN = "test-token";
  const db = {
    async query(sql) {
      if (sql.includes("FROM hyrox_analyses")) return { rows: [{ completed: 10 }] };
      if (sql.includes("COUNT(*) FILTER")) {
        return {
          rows: [{
            race_card_previewed: 6,
            packs_requested: 4,
            pack_completed: 3,
            pack_failed: 1,
            pack_cache_hits: 1,
            pack_cache_total: 3,
            race_card_completed: 5,
            race_card_cache_hits: 4,
            race_card_cache_total: 5,
            race_card_downloads: 2,
            zip_downloads: 3,
          }],
        };
      }
      if (sql.includes("event_name = 'pack_generation_completed'")) return { rows: [{ p95: 8100.2 }] };
      if (sql.includes("event_name = 'race_card_generation_completed'")) return { rows: [{ p95: 2400.2 }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const app = express();
  app.use("/api/admin/observability/hyrox", createAdminHyroxObservabilityRouter(db));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/admin/observability/hyrox/share-pipeline?days=30`, {
      headers: { "x-internal-token": "test-token" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.analysesCompleted, 10);
    assert.equal(body.racesCardPreviewed, 6);
    assert.equal(body.racesCardPreviewedPct, 60);
    assert.equal(body.packsRequestedPct, 40);
    assert.equal(body.packGeneration.completed, 3);
    assert.equal(body.packGeneration.failed, 1);
    assert.equal(body.packGeneration.cacheHitPct, 33.3);
    assert.equal(body.packGeneration.p95DurationMs, 8100);
    assert.equal(body.raceCardGeneration.cacheHitPct, 80);
    assert.equal(body.raceCardGeneration.p95DurationMs, 2400);
    assert.deepEqual(body.assetsDownloaded, { raceCard: 2, zip: 3 });
  });
});
