import test from "node:test";
import assert from "node:assert/strict";
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

test("every region used by exercise_catalogue has at least 2 no-equipment warm-up candidates", async (t) => {
  if (!(await ensureDb(t))) return;

  const regionsResult = await pool.query(`
    SELECT DISTINCT region
    FROM exercise_catalogue, jsonb_array_elements_text(target_regions_json) AS region
    WHERE is_archived = false
  `);
  const liveRegions = regionsResult.rows.map((r) => r.region);
  assert.ok(liveRegions.length > 0, "expected exercise_catalogue to expose at least one target region");

  const coverageResult = await pool.query(`
    SELECT
      region,
      count(*) FILTER (WHERE equipment_items_slugs = '{}') AS no_equip_rows
    FROM warmup_exercise, jsonb_array_elements_text(target_regions_json) AS region
    WHERE is_archived = false
    GROUP BY region
  `);
  const noEquipByRegion = new Map(coverageResult.rows.map((r) => [r.region, Number(r.no_equip_rows)]));

  const shortfalls = liveRegions
    .map((region) => ({ region, count: noEquipByRegion.get(region) ?? 0 }))
    .filter(({ count }) => count < 2);

  assert.deepEqual(
    shortfalls,
    [],
    `region(s) with fewer than 2 no-equipment warm-up candidates: ${JSON.stringify(shortfalls)}`,
  );
});

test("at least one active warm-up exercise requires equipment", async (t) => {
  if (!(await ensureDb(t))) return;

  const result = await pool.query(`
    SELECT count(*) AS count
    FROM warmup_exercise
    WHERE is_archived = false
      AND equipment_items_slugs <> '{}'
  `);

  assert.ok(
    Number(result.rows[0].count) > 0,
    "expected at least one active warm-up exercise with a non-empty equipment_items_slugs",
  );
});
