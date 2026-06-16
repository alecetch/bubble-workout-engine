import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { pool } from "../../src/db.js";
import { RUN_KEYS, STATION_KEYS } from "../../src/hyrox/config/segmentMap.js";
import { setBenchmarkData } from "../../src/hyrox/engine/benchmarkService.js";
import { analyse, health } from "../../src/hyrox/hyroxController.js";
import { hyroxIpRateLimiter, resetHyroxRateLimitersForTests, validateHyroxSubmission } from "../../src/hyrox/hyroxValidator.js";

const GROUP_KEY = "hyrox:historical_hyrox_2026_06_v1:open:male:30-34";

function metric(metricKey, medianSeconds, sampleSize = 1200) {
  return {
    groupKey: GROUP_KEY,
    metricKey,
    sampleSize,
    meanSeconds: medianSeconds,
    medianSeconds,
    p25Seconds: medianSeconds * 0.9,
    p50Seconds: medianSeconds,
    p75Seconds: medianSeconds * 1.1,
    sortedValues: [medianSeconds * 0.8, medianSeconds, medianSeconds * 1.2],
    cv: 0.1,
    missingnessRate: 0,
  };
}

function seedBenchmarks() {
  const metrics = [
    metric("total_time", 4440),
    metric("run_time", 2400),
    metric("work_time", 1800),
    metric("roxzone_time", 240),
    metric("run_fade_pct", 5),
  ];
  for (const key of RUN_KEYS) metrics.push(metric(key, 300));
  for (const key of STATION_KEYS) metrics.push(metric(key, key === "wall_balls" ? 300 : 240));
  setBenchmarkData({
    groups: [{ groupKey: GROUP_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", ageGroup: "30-34", sampleSize: 1200 }],
    metrics,
  });
}

function validBody(overrides = {}) {
  const splits = [
    ...RUN_KEYS.map((key) => ({ segmentKey: key, type: "run", timeSeconds: 300 })),
    ...STATION_KEYS.map((key) => ({ segmentKey: key, type: "station", timeSeconds: key === "wall_balls" ? 390 : 240 })),
  ];
  return {
    athlete: { name: "Test Athlete", email: `hyrox-${Date.now()}-${Math.random()}@example.com`, sex: "male", ageOnRaceDay: 34 },
    race: { raceName: "HYROX Test", raceDate: "2026-01-24", division: "open", finishTimeSeconds: 4800, source: "manual" },
    splits,
    athleteContext: { targetFinishTimeSeconds: 4500 },
    performanceContext: { fiveKmPbSeconds: 1200, injuryConstraints: [] },
    marketingConsent: false,
    allowPartial: false,
    ...overrides,
  };
}

function buildApp(handler = analyse, middlewares = [validateHyroxSubmission]) {
  const app = express();
  app.use(express.json());
  app.post("/api/hyrox/analyse", ...middlewares, handler);
  app.get("/api/hyrox/health", health);
  return app;
}

async function request(app, path, options = {}) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      headers: { "content-type": "application/json", ...(options.headers ?? {}) },
      ...options,
    });
    const text = await response.text();
    return { response, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

let dbReadyCache = null;

async function dbReady(t) {
  if (dbReadyCache?.ready) return true;
  if (dbReadyCache?.reason) {
    t.skip(dbReadyCache.reason);
    return false;
  }
  if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
    dbReadyCache = { ready: false, reason: "Postgres credentials are not configured for HYROX route integration tests." };
    t.skip(dbReadyCache.reason);
    return false;
  }
  try {
    await pool.query("SELECT 1");
    const tables = await pool.query(`
      SELECT to_regclass('public.hyrox_submissions') AS submissions,
             to_regclass('public.hyrox_analyses') AS analyses,
             to_regclass('public.hyrox_email_log') AS email_log
    `);
    const row = tables.rows[0] ?? {};
    if (!row.submissions || !row.analyses || !row.email_log) {
      dbReadyCache = { ready: false, reason: "HYROX V100-V102 migrations are not applied in this database." };
      t.skip(dbReadyCache.reason);
      return false;
    }
    dbReadyCache = { ready: true };
    return true;
  } catch (err) {
    dbReadyCache = { ready: false, reason: `Postgres unavailable for HYROX route test: ${err?.code || err?.message}` };
    t.skip(dbReadyCache.reason);
    return false;
  }
}

async function waitForEmailLog(submissionId) {
  for (let i = 0; i < 40; i += 1) {
    const result = await pool.query(
      "SELECT status FROM hyrox_email_log WHERE submission_id = $1 AND status != 'queued'",
      [submissionId],
    );
    if (result.rows.length) return result.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

async function cleanupEmail(email) {
  await pool.query("DELETE FROM hyrox_submissions WHERE email = $1", [email]);
}

test.beforeEach(() => {
  resetHyroxRateLimitersForTests();
  seedBenchmarks();
});

test.after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  await pool.end();
});

test("missing email returns 400 with athlete.email field", async () => {
  const body = validBody({ athlete: { name: "No Email", sex: "male", ageOnRaceDay: 34 } });
  const { response, body: json } = await request(buildApp(), "/api/hyrox/analyse", { method: "POST", body: JSON.stringify(body) });
  assert.equal(response.status, 400);
  assert.equal(json.errors[0].field, "athlete.email");
});

test("missing finishTimeSeconds returns 400", async () => {
  const body = validBody({ race: { division: "open" } });
  const { response, body: json } = await request(buildApp(), "/api/hyrox/analyse", { method: "POST", body: JSON.stringify(body) });
  assert.equal(response.status, 400);
  assert.equal(json.errors.some((err) => err.field === "race.finishTimeSeconds"), true);
});

test("split sum exceeds finish time returns readable 400", async () => {
  const body = validBody({ race: { division: "open", finishTimeSeconds: 4400, source: "manual" } });
  body.splits[0].timeSeconds += 30;
  const { response, body: json } = await request(buildApp(), "/api/hyrox/analyse", { method: "POST", body: JSON.stringify(body) });
  assert.equal(response.status, 400);
  assert.match(json.errors.find((err) => err.field === "splits").message, /split times add up/);
});

test("negative split time returns 400", async () => {
  const body = validBody();
  body.splits[0].timeSeconds = -1;
  const { response, body: json } = await request(buildApp(), "/api/hyrox/analyse", { method: "POST", body: JSON.stringify(body) });
  assert.equal(response.status, 400);
  assert.equal(json.errors.some((err) => err.message.includes("negative")), true);
});

test("11th request from same IP within one hour returns 429", async () => {
  const app = buildApp((_req, res) => res.json({ ok: true }), [hyroxIpRateLimiter, validateHyroxSubmission]);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/hyrox/analyse`;
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validBody({ athlete: { name: "Rate", email: `rate-${i}@example.com`, sex: "male", ageOnRaceDay: 34 } })),
      });
      statuses.push(response.status);
    }
    assert.equal(statuses.slice(0, 10).every((status) => status === 200), true);
    assert.equal(statuses[10], 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("POST /api/hyrox/analyse with complete valid splits persists submission and analysis", async (t) => {
  if (!await dbReady(t)) return;
  const body = validBody();
  const { response, body: json } = await request(buildApp(), "/api/hyrox/analyse", { method: "POST", body: JSON.stringify(body) });
  try {
    assert.equal(response.status, 200);
    assert.equal(json.status, "complete");
    assert.ok(json.browserSummary.biggestLimiter);
    const submissions = await pool.query("SELECT * FROM hyrox_submissions WHERE id = $1", [json.submissionId]);
    assert.equal(submissions.rows.length, 1);
    const analyses = await pool.query("SELECT * FROM hyrox_analyses WHERE submission_id = $1", [json.submissionId]);
    assert.equal(analyses.rows.length, 1);
    assert.match(analyses.rows[0].report_json.emailHtml, new RegExp(`/hyrox/carousel/${json.submissionId}`));
    const emailLog = await waitForEmailLog(json.submissionId);
    assert.ok(["sent", "failed"].includes(emailLog?.status));
  } finally {
    await cleanupEmail(body.athlete.email);
  }
});

test("allowPartial:true with missing stations returns partial and analysis omits missing stations", async (t) => {
  if (!await dbReady(t)) return;
  const body = validBody({ allowPartial: true });
  body.splits = body.splits.filter((split) => !["wall_balls", "row"].includes(split.segmentKey));
  const { response, body: json } = await request(buildApp(), "/api/hyrox/analyse", { method: "POST", body: JSON.stringify(body) });
  try {
    assert.equal(response.status, 200);
    assert.equal(json.status, "partial");
    const analyses = await pool.query("SELECT analysis_json FROM hyrox_analyses WHERE submission_id = $1", [json.submissionId]);
    const keys = analyses.rows[0].analysis_json.segments.map((segment) => segment.segmentKey);
    assert.equal(keys.includes("wall_balls"), false);
    assert.equal(keys.includes("row"), false);
  } finally {
    await cleanupEmail(body.athlete.email);
  }
});

test("division:doubles returns limited response", async (t) => {
  if (!await dbReady(t)) return;
  const body = validBody({ race: { division: "doubles", finishTimeSeconds: 4800, source: "manual" } });
  const { response, body: json } = await request(buildApp(), "/api/hyrox/analyse", { method: "POST", body: JSON.stringify(body) });
  try {
    assert.equal(response.status, 200);
    assert.equal(json.status, "limited");
    assert.equal(json.reason, "doubles_relay_not_supported_v1");
  } finally {
    await cleanupEmail(body.athlete.email);
  }
});

test("GET /api/hyrox/health returns status and non-negative benchmark count", async (t) => {
  if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
    t.skip("Postgres credentials are not configured for HYROX health integration test.");
    return;
  }
  const { response, body: json } = await request(buildApp(), "/api/hyrox/health");
  assert.equal(response.status, 200);
  assert.ok(["ok", "degraded"].includes(json.status));
  assert.equal(Number.isFinite(json.benchmarkGroupCount), true);
  assert.ok(json.benchmarkGroupCount >= 0);
});

test("two submissions from different emails do not share analysis rows", async (t) => {
  if (!await dbReady(t)) return;
  const bodyA = validBody();
  const bodyB = validBody();
  const app = buildApp();
  const resA = await request(app, "/api/hyrox/analyse", { method: "POST", body: JSON.stringify(bodyA) });
  const resB = await request(app, "/api/hyrox/analyse", { method: "POST", body: JSON.stringify(bodyB) });
  try {
    assert.equal(resA.response.status, 200);
    assert.equal(resB.response.status, 200);
    assert.notEqual(resA.body.submissionId, resB.body.submissionId);
    const analyses = await pool.query("SELECT submission_id FROM hyrox_analyses WHERE submission_id = ANY($1::uuid[]) ORDER BY submission_id", [[resA.body.submissionId, resB.body.submissionId]]);
    assert.equal(new Set(analyses.rows.map((row) => row.submission_id)).size, 2);
  } finally {
    await cleanupEmail(bodyA.athlete.email);
    await cleanupEmail(bodyB.athlete.email);
  }
});
