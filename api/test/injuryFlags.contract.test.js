import { applyNarration } from "../engine/steps/05_applyNarration.js";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pool } from "../src/db.js";
import { getAllowedExerciseIds } from "../engine/getAllowedExercises.js";
import { INJURY_FLAG_OPTIONS, normalizeInjuryFlags } from "../src/utils/injuryFlags.js";
after(() => pool.end());
const mobile = readFileSync(new URL("../../mobile/src/state/onboarding/types.ts", import.meta.url), "utf8");
const codes = [...(mobile.match(/export const INJURY_FLAGS = \[([\s\S]*?)\] as const/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(m => m[1]);
const labels = new Map([...(mobile.match(/export const INJURY_FLAG_LABELS[^=]*= \{([\s\S]*?)\};/)?.[1] ?? "").matchAll(/(\w+): "([^"]+)"/g)].map(m => [m[1], m[2]]));
assert.equal(codes.length, INJURY_FLAG_OPTIONS.length, "Failed to parse mobile injury codes");
assert.equal(labels.size, INJURY_FLAG_OPTIONS.length, "Failed to parse mobile injury labels");

test("catalogue contraindications use known codes and cover every real flag", async t => {
  try { await pool.query("SELECT 1"); } catch (e) { t.skip(`Postgres unavailable: ${e.code}`); return; }
  const known = new Set(INJURY_FLAG_OPTIONS.map(x => x.code));
  const seen = new Set();
  for (const table of ["exercise_catalogue", "warmup_exercise", "cooldown_exercise"]) {
    const { rows } = await pool.query(`SELECT contraindications_slugs FROM ${table}`);
    for (const row of rows) for (const flag of row.contraindications_slugs ?? []) {
      assert.ok(known.has(flag), `Unknown catalogue code on ${table}`); seen.add(flag);
    }
  }
  for (const code of known) if (code !== "no_known_issues") assert.ok(seen.has(code), `No tagged exercise for ${code}`);
});
for (const { code, label } of INJURY_FLAG_OPTIONS) {
  assert.ok(codes.includes(code)); assert.ok(labels.has(code));
  for (const value of new Set([code, label, labels.get(code), code.replace(/_(spine|foot|elbow)$/, "_/_$1")])) {
    test(`filter contract: ${value}`, async t => {
      assert.deepEqual(normalizeInjuryFlags([value]), [code]);
      try { await pool.query("SELECT 1"); } catch (e) { t.skip(`Postgres unavailable: ${e.code}`); return; }
      const equipment = (await pool.query("SELECT exercise_slug FROM equipment_items")).rows.map(r => r.exercise_slug);
      const filters = { fitness_rank: 3, equipment_items_slugs: equipment };
      const warmupCatalog = (await pool.query("SELECT * FROM warmup_exercise")).rows;
      const cooldownCatalog = (await pool.query("SELECT * FROM cooldown_exercise")).rows;
      const out = await applyNarration({
        program: { program_type: "hypertrophy", duration_mins: 60, days_per_week: 1, weeks: [{ week_index: 1, days: [{
          week_index: 1, day_index: 1, program_day_key: "W1D1",
          segments: [{ purpose: "main", segment_type: "single", rounds: 1, items: [{ ex_id: "main", ex_name: "main", sets: 3, reps_prescribed: "8", reps_unit: "reps" }] }],
        }] }] },
        narrationTemplates: [{ template_id: "program_title", scope: "program", field: "PROGRAM_TITLE", priority: 1, text_pool_json: ["Program"] }],
        narrationSource: "db", programGenerationConfigJson: {}, fitnessRank: 3, programLength: 1,
        catalogJson: { ex: [{ id: "main", tr: ["glutes", "hamstrings", "chest", "shoulders", "upper_back", "quads", "core"] }] },
        warmupCatalog, cooldownCatalog, effectiveEquipment: equipment, injuryFlags: [value],
      });
      for (const [type, catalog] of [["warmup", warmupCatalog], ["cooldown", cooldownCatalog]]) {
        const items = out.program.weeks[0].days[0].segments.find(s => s.segment_type === type)?.items ?? [];
        assert.ok(items.length > 0, `Expected ${type} selection`);
        for (const item of items) {
          const row = catalog.find(r => r[`${type}_exercise_id`] === item.exercise_id);
          assert.ok(row, "Expected catalogue item");
          assert.ok(!row.contraindications_slugs?.includes(code), `Contraindicated ${type}`);
        }
      }

      const baseline = await getAllowedExerciseIds(pool, filters);
      // Pass the original value to also cover the selection boundary.
      const allowed = await getAllowedExerciseIds(pool, { ...filters, injury_flags_slugs: [value] });
      const tagged = (await pool.query("SELECT exercise_id FROM exercise_catalogue WHERE $1 = ANY(contraindications_slugs)", [code])).rows.map(r => r.exercise_id);
      assert.ok(!allowed.some(id => tagged.includes(id)));
      if (code === "no_known_issues") assert.deepEqual(allowed, baseline);
      else assert.ok(allowed.length < baseline.length, "Flag must actually exclude exercises");
    });
  }
}

test("unknown flags stop selection before querying the catalogue", async () => {
  let queried = false;
  const db = { query() { queried = true; throw new Error("Unexpected query"); } };
  await assert.rejects(getAllowedExerciseIds(db, { injury_flags_slugs: ["unmapped_injury"] }), { code: "invalid_injury_flag" });
  assert.equal(queried, false);
});
