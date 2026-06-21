import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { pool } from "../src/db.js";
import { adminContentStudioRouter } from "../src/routes/adminContentStudio.js";

const TOKEN = "test-content-studio-workflow-token";

function fmt(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function csvBody() {
  const header = "rank,athlete_name,instagram_handle,finish_time,roxzone_time,run_1,skierg,run_2,sled_push,run_3,sled_pull,run_4,burpee_bj,run_5,row,run_6,farmers_carry,run_7,sandbag_lunge,run_8,wall_balls";
  const rows = Array.from({ length: 10 }, (_, i) => {
    const rank = i + 1;
    const run = 250 + i * 8;
    const station = i === 0 ? 310 : 220 + i * 10;
    return `${rank},Workflow Athlete ${rank},workflow${rank},1:25:00,2:00,${fmt(run)},${fmt(station)},${fmt(run + 4)},${fmt(station + (9 - i) * 8)},${fmt(run + 8)},${fmt(station + (9 - i) * 7)},${fmt(run + 12)},${fmt(station + 20)},${fmt(run + 16)},${fmt(station + 12)},${fmt(run + 20)},${fmt(station + 18)},${fmt(run + 24)},${fmt(station + 30)},${fmt(run + 28)},${fmt(station + i * 15)}`;
  });
  return [header, ...rows].join("\n");
}

function buildApp() {
  const app = express();
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

let dbReadyCache = null;

async function dbReady(t) {
  if (dbReadyCache?.ready) return true;
  if (dbReadyCache?.reason) {
    t.skip(dbReadyCache.reason);
    return false;
  }
  if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
    dbReadyCache = { ready: false, reason: "Postgres credentials are not configured for Content Studio workflow route tests." };
    t.skip(dbReadyCache.reason);
    return false;
  }
  try {
    const tables = await pool.query("SELECT to_regclass('public.cs_race_events') AS races, to_regclass('public.cs_content_jobs') AS jobs");
    if (!tables.rows[0]?.races || !tables.rows[0]?.jobs) {
      dbReadyCache = { ready: false, reason: "Content Studio V109 migration is not applied in this database." };
      t.skip(dbReadyCache.reason);
      return false;
    }
    dbReadyCache = { ready: true };
    return true;
  } catch (err) {
    dbReadyCache = { ready: false, reason: `Postgres unavailable for Content Studio workflow route test: ${err?.code || err?.message}` };
    t.skip(dbReadyCache.reason);
    return false;
  }
}

test.after(async () => {
  await pool.end();
});

test("content studio generate, approval, and export workflow", async (t) => {
  if (!await dbReady(t)) return;
  const app = buildApp();
  let raceEventId;
  const jobIds = [];
  try {
    const upload = await request(app, `/api/admin/content-studio/races/upload?eventName=${encodeURIComponent(`Workflow Test ${Date.now()}`)}&division=open&sex=male&season=2026`, {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: csvBody(),
    });
    assert.equal(upload.response.status, 200);
    raceEventId = upload.body.raceEventId;

    const generated = await request(app, `/api/admin/content-studio/races/${raceEventId}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "race_breakdown", params: { raceName: "Workflow Test" } }),
    });
    assert.equal(generated.response.status, 200);
    assert.ok(generated.body.jobId);
    assert.equal(generated.body.status, "draft");
    jobIds.push(generated.body.jobId);

    const jobs = await request(app, "/api/admin/content-studio/jobs");
    assert.equal(jobs.response.status, 200);
    assert.equal(jobs.body.jobs.some((job) => job.id === generated.body.jobId), true);

    const jobDetail = await request(app, `/api/admin/content-studio/jobs/${generated.body.jobId}`);
    assert.equal(jobDetail.response.status, 200);
    assert.equal(jobDetail.body.job.status, "draft");
    assert.equal(jobDetail.body.items.length > 0, true);

    const submitted = await request(app, `/api/admin/content-studio/jobs/${generated.body.jobId}/submit`, { method: "PATCH" });
    assert.equal(submitted.response.status, 200);
    assert.equal(submitted.body.status, "pending_review");

    const approved = await request(app, `/api/admin/content-studio/jobs/${generated.body.jobId}/approve`, { method: "PATCH" });
    assert.equal(approved.response.status, 200);
    assert.equal(approved.body.status, "approved");

    const draft = await request(app, `/api/admin/content-studio/races/${raceEventId}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "athlete_spotlight", params: { athleteName: "Workflow Athlete 1" } }),
    });
    assert.equal(draft.response.status, 200);
    jobIds.push(draft.body.jobId);
    const rejectDraft = await request(app, `/api/admin/content-studio/jobs/${draft.body.jobId}/reject`, { method: "PATCH" });
    assert.equal(rejectDraft.response.status, 400);

    const exported = await request(app, `/api/admin/content-studio/jobs/${generated.body.jobId}/export`);
    assert.equal(exported.response.status, 200);
    assert.ok(exported.body.carouselJson);
    assert.equal(Array.isArray(exported.body.carouselJson.slides), true);

    const myth = await request(app, `/api/admin/content-studio/races/${raceEventId}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "myth_buster", params: { myth: "sleds" } }),
    });
    assert.equal(myth.response.status, 200);
    jobIds.push(myth.body.jobId);
  } finally {
    if (raceEventId) await pool.query("DELETE FROM cs_race_events WHERE id = $1", [raceEventId]);
    if (jobIds.length) await pool.query("DELETE FROM cs_content_jobs WHERE id = ANY($1::uuid[])", [jobIds]);
  }
});
