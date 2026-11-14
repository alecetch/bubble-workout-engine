import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { pool } from "../src/db.js";
import { adminContentStudioRouter } from "../src/routes/adminContentStudio.js";

const TOKEN = "content-studio-hyrox-route-token";

function buildApp(scraper) {
  const app = express();
  app.locals.contentStudioScraper = scraper;
  app.use("/api/admin", (req, res, next) => {
    if (req.get("x-internal-token") !== TOKEN) return res.status(401).json({ ok: false });
    return next();
  }, adminContentStudioRouter);
  return app;
}

async function request(app, path, options = {}) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      ...options,
      headers: { "x-internal-token": TOKEN, ...(options.headers ?? {}) },
    });
    const text = await response.text();
    return { response, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function dbReady(t) {
  if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
    t.skip("Postgres credentials are not configured for Content Studio HYROX route tests.");
    return false;
  }
  const tables = await pool.query("SELECT to_regclass('public.cs_race_events') AS races");
  if (!tables.rows[0]?.races) {
    t.skip("Content Studio migrations are not applied.");
    return false;
  }
  const column = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'cs_race_events' AND column_name = 'scrape_meta_json'");
  if (!column.rows.length) {
    t.skip("Content Studio V110 migration is not applied.");
    return false;
  }
  return true;
}

test.after(async () => {
  await pool.end();
});

test("POST scrape with enrichSplits=false returns athleteCount without fetching detail pages", async (t) => {
  if (!await dbReady(t)) return;
  let enrichCalled = false;
  const scraper = {
    async scrapeLeaderboard(_key, _division, _limit, _season, _contestId, sex) {
      return [1, 2, 3].map((rank) => ({
        rank,
        name: `Fake Athlete ${rank}`,
        finishTimeSeconds: 3600 + rank * 60,
        roxzoneSeconds: null,
        splits: {},
        athleteId: `FAKE${rank}`,
        division: "pro",
        sex,
      }));
    },
    async enrichAthleteSplits() {
      enrichCalled = true;
      return [];
    },
  };
  const app = buildApp(scraper);
  let raceEventId = null;
  try {
    const result = await request(app, "/api/admin/content-studio/hyrox-events/fake-event/scrape", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contestId: "FAKE", division: "HYROX PRO", sex: "male", enrichSplits: false }),
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.ok, true);
    assert.equal(result.body.athleteCount, 3);
    assert.equal(result.body.splitCoverage, 0);
    assert.equal(enrichCalled, false);
    raceEventId = result.body.raceEventId;
  } finally {
    if (raceEventId) await pool.query("DELETE FROM cs_race_events WHERE id = $1", [raceEventId]);
  }
});

test("Content Studio page uses the current title and download prefix", () => {
  const html = readFileSync(new URL("../admin/content-studio.html", import.meta.url), "utf8");
  assert.match(html, /<title>200 Days Content Studio<\/title>/);
  assert.match(html, /<h1 class="title">200 Days Content Studio<\/h1>/);
  assert.match(html, /200days-content-\$\{jobId/);
});
test("Content Studio export downloads use the 200days prefix", async t => {
  if (!await dbReady(t)) return;
  const { rows } = await pool.query("INSERT INTO cs_content_jobs (content_mode, status) VALUES ('auto_pick', 'approved') RETURNING id");
  const id = rows[0].id;
  const result = await request(buildApp(), `/api/admin/content-studio/jobs/${id}/export`);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get("content-disposition"), `attachment; filename="200days-content-${id.slice(0, 8)}.json"`);
  assert.equal(result.body.jobId, id);
});
