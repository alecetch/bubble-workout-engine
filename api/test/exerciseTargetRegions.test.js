import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";

async function ensureDb(t) {
  try { await pool.query("SELECT 1"); return true; }
  catch (err) { t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`); return false; }
}
const vocabulary = new Set(["arms","biceps","calves","cardio","chest","core","glutes","grip","hamstrings","lats","quads","rear_delts","shoulders","triceps","upper_back"]);

test("all active exercises have valid target regions", async t => {
  if (!(await ensureDb(t))) return;
  const { rows } = await pool.query("SELECT exercise_id, target_regions_json FROM exercise_catalogue WHERE is_archived=false ORDER BY exercise_id");
  const empty = rows.filter(r => !Array.isArray(r.target_regions_json) || !r.target_regions_json.length).map(r => r.exercise_id);
  assert.deepEqual(empty, [], `Active exercises without target regions:\n${empty.join("\n")}`);
  const invalid = rows.flatMap(r => r.target_regions_json.filter(region => !vocabulary.has(region)).map(region => `${r.exercise_id}:${region}`));
  assert.deepEqual(invalid, [], `Invalid target regions:\n${invalid.join("\n")}`);
});

test("resolved target-region decisions remain exact", async t => {
  if (!(await ensureDb(t))) return;
  const ids = ["cable_fly","pec_deck_fly","box_step_up","bb_bench_press"];
  const { rows } = await pool.query("SELECT exercise_id,target_regions_json FROM exercise_catalogue WHERE exercise_id=ANY($1)", [ids]);
  const byId = Object.fromEntries(rows.map(r => [r.exercise_id, r.target_regions_json]));
  assert.deepEqual(byId.cable_fly, ["chest","shoulders"]);
  assert.deepEqual(byId.pec_deck_fly, ["chest","shoulders"]);
  assert.deepEqual(byId.box_step_up, ["quads","glutes"]);
  assert.deepEqual(byId.bb_bench_press, ["chest","triceps","shoulders"]);
});
