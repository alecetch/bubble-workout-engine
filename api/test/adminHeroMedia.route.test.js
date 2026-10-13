import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { requireInternalToken } from "../src/middleware/auth.js";
import { createAdminHeroMediaRouter, selectCell, statusForKey } from "../src/routes/adminHeroMedia.js";

const row = { id: 1, asset_key: "program_day:hypertrophy:upper_body:program_day/x.png", usage_scope: "program_day", day_type: "hypertrophy", focus_type: "upper_body", label: "Upper", sort_order: 1, is_active: true, image_key: "program_day/x.png", image_url: "", updated_at: new Date(), promoted_at: null };
async function server(t, db, deps = {}) {
  const app = express(); app.use("/admin", createAdminHeroMediaRouter({ db, auditLogFn: async () => {}, ...deps }));
  const instance = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => new Promise(resolve => instance.close(resolve)));
  return `http://127.0.0.1:${instance.address().port}/admin`;
}

test("file status distinguishes exact case, mismatched case, missing bucket objects", async t => {
  const dir = mkdtempSync(join(tmpdir(), "hero-media-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "program")); mkdirSync(join(dir, "program_day")); writeFileSync(join(dir, "program", "Hero.png"), "x");
  assert.equal(await statusForKey("program/Hero.png", async () => {}, dir), "found");
  assert.equal(await statusForKey("program/hero.png", async () => {}, dir), "case_mismatch");
  assert.equal(await statusForKey("hero-media/program/a.jpg", async () => { const e = new Error(); e.name = "NotFound"; throw e; }, dir), "missing");
});

test("coverage selection reports exact, full-body and generic fallbacks", () => {
  const rows = [row, { ...row, id: 2, day_type: "strength", focus_type: "full_body" }, { ...row, id: 3, day_type: "generic", focus_type: null }];
  assert.equal(selectCell(rows, "hypertrophy", "upper_body", "program_day").method, "exact");
  assert.equal(selectCell(rows, "strength", "lower_body", "program_day").method, "type_full_body");
  assert.equal(selectCell(rows, "hyrox", "lower_body", "program_day").method, "generic");
});

test("PATCH is partial-safe and DELETE only deactivates", async t => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: sql.includes("RETURNING") ? [{ ...row, sort_order: params[0], is_active: sql.includes("is_active") ? params[0] : true }] : [] }; } };
  const base = await server(t, db);
  let response = await fetch(`${base}/hero-media/1`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sortOrder: 9 }) });
  assert.equal(response.status, 200); assert.match(calls[0].sql, /sort_order = \$1/); assert.doesNotMatch(calls[0].sql, /image_key|day_type|focus_type|label/); assert.deepEqual(calls[0].params, [9, "1"]);
  response = await fetch(`${base}/hero-media/1`, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" }); assert.equal(response.status, 400);
  response = await fetch(`${base}/hero-media/1`, { method: "DELETE" }); assert.equal(response.status, 200);
  assert.match(calls.at(-1).sql, /^UPDATE media_assets SET is_active/); assert.doesNotMatch(calls.at(-1).sql, /^DELETE/i);
});

test("POST validates scope and derives a stable asset key", async t => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes("DISTINCT program_type")) return { rows: [{ program_type: "hypertrophy" }] };
    return { rows: [{ ...row, asset_key: params[0] }] };
  } };
  const dir = mkdtempSync(join(tmpdir(), "hero-create-")); t.after(() => rmSync(dir, { recursive: true, force: true })); mkdirSync(join(dir, "program")); mkdirSync(join(dir, "program_day")); writeFileSync(join(dir, "program_day", "x.png"), "x");
  const base = await server(t, db, { legacyAssetsDir: dir });
  let response = await fetch(`${base}/hero-media`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usageScope: "bad" }) }); assert.equal(response.status, 400);
  response = await fetch(`${base}/hero-media`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ usageScope: "program_day", dayType: "hypertrophy", focusType: "upper_body", imageKey: "program_day/x.png", label: "Upper" }) });
  assert.equal(response.status, 201); assert.equal(calls.at(-1).params[0], "program_day:hypertrophy:upper_body:program_day/x.png");
});

// ── Additional coverage: auth, list, upload, promote, import ────────────────

const pngOfWidth = width => sharp({ create: { width, height: 600, channels: 3, background: "#334155" } }).png().toBuffer();

async function uploadImage(base, id, buffer, type = "image/png", filename = "Hero Shot.PNG") {
  const form = new FormData();
  form.append("image", new Blob([buffer], { type }), filename);
  return fetch(`${base}/hero-media/${id}/image`, { method: "POST", body: form });
}

test("admin hero routes require the internal token when mounted behind it", async t => {
  const previous = process.env.INTERNAL_API_TOKEN;
  process.env.INTERNAL_API_TOKEN = "test-token";
  t.after(() => { if (previous === undefined) delete process.env.INTERNAL_API_TOKEN; else process.env.INTERNAL_API_TOKEN = previous; });
  const app = express();
  app.use("/admin", requireInternalToken, createAdminHeroMediaRouter({ db: { query: async () => ({ rows: [] }) }, auditLogFn: async () => {} }));
  const instance = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(() => new Promise(resolve => instance.close(resolve)));
  const base = `http://127.0.0.1:${instance.address().port}/admin`;
  for (const [method, path] of [["GET", "/hero-media/list"], ["GET", "/hero-media/coverage"], ["POST", "/hero-media"], ["PATCH", "/hero-media/1"], ["DELETE", "/hero-media/1"], ["POST", "/hero-media/promote-all"], ["POST", "/hero-media/import"]]) {
    assert.equal((await fetch(`${base}${path}`, { method })).status, 401, `${method} ${path} without token`);
  }
  assert.equal((await fetch(`${base}/hero-media/list`, { headers: { "X-Internal-Token": "test-token" } })).status, 200);
});

test("GET list returns active and inactive rows with a file status each", async t => {
  const dir = mkdtempSync(join(tmpdir(), "hero-list-")); t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "program_day")); writeFileSync(join(dir, "program_day", "x.png"), "x");
  const rows = [row, { ...row, id: 2, is_active: false, image_key: "program_day/gone.png", asset_key: "k2" }, { ...row, id: 3, image_key: "hero-media/program_day/new.png", asset_key: "k3" }];
  const db = { query: async () => ({ rows }) };
  const base = await server(t, db, { legacyAssetsDir: dir, headObjectFn: async () => {} });
  const body = await (await fetch(`${base}/hero-media/list`)).json();
  assert.deepEqual(body.rows.map(r => [r.id, r.isActive, r.fileStatus]), [[1, true, "found"], [2, false, "missing"], [3, true, "found"]]);
});

test("upload stores a normalised lowercase key and rejects bad images", async t => {
  const puts = [];
  const db = { query: async (sql, params) => sql.startsWith("SELECT") ? { rows: [row] } : { rows: [{ ...row, image_key: params[0] }] } };
  const base = await server(t, db, { putObjectFn: async (key, _buf, type) => { puts.push({ key, type }); } });

  let response = await uploadImage(base, 1, await pngOfWidth(1200));
  assert.equal(response.status, 200);
  assert.equal(puts.at(-1).key, "hero-media/program_day/upper.png");
  assert.match(puts.at(-1).key, /^hero-media\/program_day\/[a-z0-9_-]+\.png$/);
  assert.equal((await response.json()).row.imageKey, "hero-media/program_day/upper.png");

  response = await uploadImage(base, 1, await pngOfWidth(800));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /1080/);

  response = await uploadImage(base, 1, Buffer.from("not an image"), "text/plain", "notes.txt");
  assert.equal(response.status, 400);

  response = await uploadImage(base, 1, Buffer.alloc(6 * 1024 * 1024), "image/png", "huge.png");
  assert.equal(response.status, 413);
  assert.equal(puts.length, 1, "only the valid upload reaches storage");
});

test("promote posts the asset_key and image to production and stamps promoted_at", async t => {
  const calls = []; const fetches = [];
  const heroRow = { ...row, image_key: "hero-media/program_day/upper.png", asset_key: "program_day:hypertrophy:upper_body:hero-media/program_day/upper.png" };
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: sql.startsWith("SELECT") ? [heroRow] : [] }; } };
  const base = await server(t, db, {
    promotionConfig: { enabled: true, baseUrl: "https://prod.example", token: "prod-token" },
    getObjectFn: async () => Buffer.from("png-bytes"),
    fetchFn: async (url, init) => { fetches.push({ url, init }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); },
  });
  const response = await fetch(`${base}/hero-media/1/promote`, { method: "POST" });
  assert.equal(response.status, 200);
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].url, "https://prod.example/admin/hero-media/import");
  assert.equal(fetches[0].init.headers["X-Internal-Token"], "prod-token");
  assert.equal(fetches[0].init.body.get("asset_key"), heroRow.asset_key);
  assert.ok(fetches[0].init.body.get("image"), "image file is attached for hero-media keys");
  assert.ok(calls.some(c => /UPDATE media_assets SET promoted_at = now\(\)/.test(c.sql)), "promoted_at is stamped");
});

test("promote reports a clear error when production promotion isn't configured", async t => {
  const db = { query: async () => ({ rows: [row] }) };
  const base = await server(t, db, { promotionConfig: { enabled: false } });
  const response = await fetch(`${base}/hero-media/1/promote`, { method: "POST" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, "Production promotion is not configured");
});

test("import upserts by asset_key and validates the image key", async t => {
  const calls = []; const puts = [];
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [{ ...row, asset_key: params[0] }] }; } };
  const base = await server(t, db, { putObjectFn: async key => { puts.push(key); } });
  const importForm = (imageKey) => { const f = new FormData(); for (const [k, v] of Object.entries({ asset_key: "program_day:strength:lower_body:" + imageKey, usage_scope: "program_day", day_type: "strength", focus_type: "lower_body", label: "Strength Lower", sort_order: "1", is_active: "true", image_key: imageKey })) f.append(k, v); f.append("image", new Blob([Buffer.from("x")], { type: "image/png" }), "a.png"); return f; };

  for (let i = 0; i < 2; i++) assert.equal((await fetch(`${base}/hero-media/import`, { method: "POST", body: importForm("hero-media/program_day/strength_lower.png") })).status, 200);
  const upserts = calls.filter(c => /INSERT INTO media_assets/.test(c.sql));
  assert.equal(upserts.length, 2);
  assert.ok(upserts.every(c => /ON CONFLICT \(asset_key\) DO UPDATE/.test(c.sql)), "import upserts on asset_key, never by id");
  assert.ok(upserts.every(c => !/\bid\b\s*=/.test(c.sql)));

  const bad = await fetch(`${base}/hero-media/import`, { method: "POST", body: importForm("../../secrets/x.png") });
  assert.equal(bad.status, 400);
  assert.deepEqual(puts, ["hero-media/program_day/strength_lower.png", "hero-media/program_day/strength_lower.png"], "a bad key never reaches storage");
});
