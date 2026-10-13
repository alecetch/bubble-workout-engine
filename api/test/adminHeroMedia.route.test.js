import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
