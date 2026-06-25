import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { pool } from "../src/db.js";
import { adminContentStudioRouter } from "../src/routes/adminContentStudio.js";

const TOKEN = "content-studio-scrape-standard-token";

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
    t.skip("Postgres credentials are not configured for Content Studio scrape-standard route tests.");
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

function sexFromLabel(label) {
  return /women|female/i.test(label) ? "female" : "male";
}

function divisionFromLabel(label) {
  return /pro/i.test(label) ? "pro" : "open";
}

function standardDivisions() {
  return [
    { label: "HYROX PRO Men", contestId: "PRO_M" },
    { label: "HYROX PRO Women", contestId: "PRO_W" },
    { label: "HYROX Men", contestId: "OPEN_M" },
    { label: "HYROX Women", contestId: "OPEN_W" },
  ];
}

function buildScraper({ divisions = standardDivisions(), failLabel = null } = {}) {
  return {
    async fetchDivisions() {
      return divisions;
    },
    async scrapeLeaderboard(_key, label, _limit, _season, _contestId, sex) {
      if (label === failLabel) throw new Error("mock scrape failed");
      const division = divisionFromLabel(label);
      const rowSex = sex ?? sexFromLabel(label);
      return [1, 2, 3].map((rank) => ({
        rank,
        name: `Mock Athlete ${rank}`,
        instagramHandle: null,
        finishTimeSeconds: 3600 + rank * 60,
        roxzoneSeconds: null,
        splits: {},
        athleteId: `${label.replace(/\W+/g, "_")}_${rank}`,
        division,
        sex: rowSex,
      }));
    },
    async enrichAthleteSplits(rows) {
      return rows;
    },
  };
}

test.after(async () => {
  await pool.end();
});

test("POST scrape-standard scrapes the four standard divisions", async (t) => {
  if (!await dbReady(t)) return;
  const key = `standard-test-${Date.now()}`;
  const app = buildApp(buildScraper());
  try {
    const result = await request(app, `/api/admin/content-studio/hyrox-events/${key}/scrape-standard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ season: 8, enrichSplits: true }),
    });

    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.ok, true);
    assert.equal(result.body.scraped, 4);
    assert.equal(result.body.failed, 0);
    assert.equal(result.body.results.length, 4);

    const count = await pool.query("SELECT count(*)::int AS count FROM cs_race_events WHERE event_name LIKE $1", [`${key}%`]);
    assert.equal(count.rows[0].count, 4);
  } finally {
    await pool.query("DELETE FROM cs_race_events WHERE event_name LIKE $1", [`${key}%`]);
  }
});

test("POST scrape-standard records one failed division and continues", async (t) => {
  if (!await dbReady(t)) return;
  const key = `standard-fail-test-${Date.now()}`;
  const app = buildApp(buildScraper({ failLabel: "HYROX PRO Women" }));
  try {
    const result = await request(app, `/api/admin/content-studio/hyrox-events/${key}/scrape-standard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ season: 8, enrichSplits: true }),
    });

    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.ok, true);
    assert.equal(result.body.scraped, 3);
    assert.equal(result.body.failed, 1);
    assert.equal(result.body.results.filter((row) => !row.ok)[0].error, "mock scrape failed");

    const count = await pool.query("SELECT count(*)::int AS count FROM cs_race_events WHERE event_name LIKE $1", [`${key}%`]);
    assert.equal(count.rows[0].count, 3);
  } finally {
    await pool.query("DELETE FROM cs_race_events WHERE event_name LIKE $1", [`${key}%`]);
  }
});

test("POST scrape-standard ignores non-standard divisions", async (t) => {
  if (!await dbReady(t)) return;
  const key = `standard-empty-test-${Date.now()}`;
  const app = buildApp(buildScraper({
    divisions: [
      { label: "HYROX Doubles Men", contestId: "DOUBLES_M" },
      { label: "HYROX Relay", contestId: "RELAY" },
    ],
  }));

  const result = await request(app, `/api/admin/content-studio/hyrox-events/${key}/scrape-standard`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ season: 8, enrichSplits: true }),
  });

  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.ok, true);
  assert.equal(result.body.scraped, 0);
  assert.equal(result.body.failed, 0);
  assert.deepEqual(result.body.results, []);
});

test("POST scrape-standard successful results include event metadata", async (t) => {
  if (!await dbReady(t)) return;
  const key = `standard-shape-test-${Date.now()}`;
  const app = buildApp(buildScraper());
  try {
    const result = await request(app, `/api/admin/content-studio/hyrox-events/${key}/scrape-standard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ season: 8, enrichSplits: false }),
    });

    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    for (const row of result.body.results) {
      assert.equal(row.ok, true);
      assert.ok(row.raceEventId);
      assert.equal(row.athleteCount, 3);
      assert.match(row.division, /^HYROX/);
      assert.ok(["open", "pro"].includes(row.type));
      assert.ok(["male", "female"].includes(row.sex));
    }
  } finally {
    await pool.query("DELETE FROM cs_race_events WHERE event_name LIKE $1", [`${key}%`]);
  }
});
