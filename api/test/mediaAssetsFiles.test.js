import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";
import { EXERCISE_MEDIA_BUCKET, headObject } from "../src/services/s3Service.js";

async function ensureDb(t) {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`);
    return false;
  }
}

const assetsDir = [new URL("../../assets/media-assets/", import.meta.url), new URL("../assets/media-assets/", import.meta.url)]
  .find(dir => existsSync(dir));

function collectFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const key = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...collectFiles(join(directory, entry.name), `${key}/`));
    else if (entry.isFile()) files.push(key);
  }
  return files;
}

test("every active media asset image_key matches a file with exact casing", async (t) => {
  if (!(await ensureDb(t))) return;
  assert.ok(assetsDir, "media-assets directory not found in checkout or container layout");
  const files = new Set(collectFiles(fileURLToPath(assetsDir)));
  const { rows } = await pool.query("SELECT image_key FROM public.media_assets WHERE is_active = true");
  assert.ok(rows.length > 0, "expected seeded active media assets");
  const missing = rows.map(row => row.image_key).filter(key => !key.startsWith("hero-media/") && !files.has(key));
  assert.deepEqual(missing, [], `Missing or mis-cased active media asset keys:\n${missing.join("\n")}`);
});

test("every media asset has a unique non-null asset_key", async t => {
  if (!(await ensureDb(t))) return;
  const { rows: [result] } = await pool.query("SELECT count(*)::int AS total, count(asset_key)::int AS keyed, count(DISTINCT asset_key)::int AS unique_keys FROM media_assets");
  assert.equal(result.keyed, result.total); assert.equal(result.unique_keys, result.total);
});

test("active hero-media keys exist in the exercise media bucket", async t => {
  if (!(await ensureDb(t))) return;
  const { rows } = await pool.query("SELECT image_key FROM media_assets WHERE is_active=true AND image_key LIKE 'hero-media/%'");
  if (!rows.length) return;
  try { await headObject(rows[0].image_key, EXERCISE_MEDIA_BUCKET); }
  catch (err) { t.skip(`Exercise media storage unavailable: ${err?.name || err?.message}`); return; }
  for (const row of rows) await assert.doesNotReject(headObject(row.image_key, EXERCISE_MEDIA_BUCKET));
});
