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

test("active strength and hypertrophy day titles are scoped and contain the correct type word", async (t) => {
  if (!(await ensureDb(t))) return;
  const { rows } = await pool.query(`
    SELECT template_id, scope, field, priority, applies_json, text_pool_json
    FROM public.narration_template
    WHERE is_active = true AND template_id IN ('day_title_1', 'day_title_strength_v1', 'day_title_hypertrophy_v1')
  `);
  assert.equal(rows.length, 3);
  for (const [type, label, other] of [["strength", "Strength", "Hypertrophy"], ["hypertrophy", "Hypertrophy", "Strength"]]) {
    const row = rows.find(row => row.template_id === `day_title_${type}_v1`);
    assert.ok(row, `missing active ${type} title template`);
    assert.equal(row.scope, "day");
    assert.equal(row.field, "DAY_TITLE");
    assert.equal(row.priority, 5);
    assert.deepEqual(row.applies_json, { program_type: type });
    assert.deepEqual(row.text_pool_json, [`Day {DAY_INDEX}: {DAY_FOCUS} ${label} Session`]);
    assert.doesNotMatch(JSON.stringify(row.text_pool_json), new RegExp(other, "i"));
  }
  assert.deepEqual(rows.find(row => row.template_id === "day_title_1").text_pool_json, ["Day {DAY_INDEX}: {DAY_FOCUS} Session"]);
});
