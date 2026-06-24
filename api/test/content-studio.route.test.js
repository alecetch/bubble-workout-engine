import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { pool } from "../src/db.js";
import { adminContentStudioRouter } from "../src/routes/adminContentStudio.js";

const TOKEN = "test-content-studio-token";

function csvBody() {
  const header = "rank,athlete_name,instagram_handle,finish_time,roxzone_time,run_1,skierg,run_2,sled_push,run_3,sled_pull,run_4,burpee_bj,run_5,row,run_6,farmers_carry,run_7,sandbag_lunge,run_8,wall_balls";
  const rows = Array.from({ length: 10 }, (_, i) => {
    const rank = i + 1;
    const run = 250 + i * 8;
    const station = 230 + i * 10;
    return `${rank},Route Athlete ${rank},routeathlete${rank},1:10:00,2:00,${fmt(run)},${fmt(station)},${fmt(run + 4)},${fmt(station + (9 - i) * 8)},${fmt(run + 8)},${fmt(station + (9 - i) * 7)},${fmt(run + 12)},${fmt(station + 20)},${fmt(run + 16)},${fmt(station + 12)},${fmt(run + 20)},${fmt(station + 18)},${fmt(run + 24)},${fmt(station + 30)},${fmt(run + 28)},${fmt(station + i * 15)}`;
  });
  return [header, ...rows].join("\n");
}

function fmt(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
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
    dbReadyCache = { ready: false, reason: "Postgres credentials are not configured for Content Studio route tests." };
    t.skip(dbReadyCache.reason);
    return false;
  }
  try {
    const tables = await pool.query(`
      SELECT to_regclass('public.cs_race_events') AS races,
             to_regclass('public.cs_athletes') AS athletes,
             to_regclass('public.cs_content_jobs') AS jobs,
             to_regclass('public.cs_content_items') AS items
    `);
    const row = tables.rows[0] ?? {};
    if (!row.races || !row.athletes || !row.jobs || !row.items) {
      dbReadyCache = { ready: false, reason: "Content Studio V109 migration is not applied in this database." };
      t.skip(dbReadyCache.reason);
      return false;
    }
    dbReadyCache = { ready: true };
    return true;
  } catch (err) {
    dbReadyCache = { ready: false, reason: `Postgres unavailable for Content Studio route test: ${err?.code || err?.message}` };
    t.skip(dbReadyCache.reason);
    return false;
  }
}

test.after(async () => {
  await pool.end();
});

test("content studio upload, auto-pick, and athlete registry flow", async (t) => {
  if (!await dbReady(t)) return;
  const app = buildApp();
  const eventName = `Route Test ${Date.now()}`;
  let raceEventId;
  let athleteId;
  try {
    const upload = await request(app, `/api/admin/content-studio/races/upload?eventName=${encodeURIComponent(eventName)}&division=open&sex=male&season=2026`, {
      method: "POST",
      headers: { "content-type": "text/csv" },
      body: csvBody(),
    });
    assert.equal(upload.response.status, 200, JSON.stringify(upload.body));
    assert.ok(upload.body.raceEventId);
    assert.equal(upload.body.status, "analysed");
    raceEventId = upload.body.raceEventId;

    const races = await request(app, "/api/admin/content-studio/races");
    assert.equal(races.response.status, 200);
    assert.equal(races.body.races.some((race) => race.id === raceEventId), true);

    const autoPick = await request(app, `/api/admin/content-studio/races/${raceEventId}/auto-pick`, { method: "POST" });
    assert.equal(autoPick.response.status, 200);
    assert.equal(autoPick.body.insights.length > 0, true);
    assert.equal(autoPick.body.insights.every((insight, index) => index === 0 || autoPick.body.insights[index - 1].scores.compositeScore >= insight.scores.compositeScore), true);

    const created = await request(app, "/api/admin/content-studio/athletes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName: "Route Athlete", instagramHandle: "route", instagramFollowerCount: 1234, sex: "male", division: "open" }),
    });
    assert.equal(created.response.status, 200);
    assert.ok(created.body.athleteId);
    athleteId = created.body.athleteId;

    const athletes = await request(app, "/api/admin/content-studio/athletes");
    assert.equal(athletes.response.status, 200);
    assert.equal(athletes.body.athletes.some((athlete) => athlete.id === athleteId), true);

    const patched = await request(app, `/api/admin/content-studio/athletes/${athleteId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instagramHandle: "route-updated" }),
    });
    assert.equal(patched.response.status, 200);
    const afterPatch = await request(app, "/api/admin/content-studio/athletes");
    assert.equal(afterPatch.body.athletes.find((athlete) => athlete.id === athleteId).instagram_handle, "@route-updated");

    const deleted = await request(app, `/api/admin/content-studio/athletes/${athleteId}`, { method: "DELETE" });
    assert.equal(deleted.response.status, 200);
    athleteId = null;
    const afterDelete = await request(app, "/api/admin/content-studio/athletes");
    assert.equal(afterDelete.body.athletes.some((athlete) => athlete.id === deleted.body.athleteId), false);
  } finally {
    if (athleteId) await pool.query("DELETE FROM cs_athletes WHERE id = $1", [athleteId]);
    if (raceEventId) await pool.query("DELETE FROM cs_race_events WHERE id = $1", [raceEventId]);
  }
});
