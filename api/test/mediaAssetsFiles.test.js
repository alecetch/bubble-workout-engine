import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";

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
  const missing = rows.map(row => row.image_key).filter(key => !files.has(key));
  assert.deepEqual(missing, [], `Missing or mis-cased active media asset keys:\n${missing.join("\n")}`);
});
