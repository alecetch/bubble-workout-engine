import test, { after } from "node:test";
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

after(() => pool.end());

async function activeExercises() {
  const { rows } = await pool.query(`
    SELECT exercise_id, name, equipment_items_slugs
    FROM exercise_catalogue WHERE is_archived = false
    ORDER BY exercise_id
  `);
  assert.ok(rows.length > 0, "expected an active exercise catalogue");
  return rows;
}

function assertNoOffenders(rows, rule) {
  assert.deepEqual(rows, [], `${rule}: ${rows.map(row => `${row.exercise_id} (${row.name})`).join(", ")}`);
}

test("active exercise names are unique case-insensitively", async t => {
  if (!(await ensureDb(t))) return;
  const rows = await activeExercises();
  const counts = new Map();
  for (const row of rows) {
    const name = row.name.toLowerCase();
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  assertNoOffenders(rows.filter(row => counts.get(row.name.toLowerCase()) > 1), "Duplicate names");
});

test("exercise variants use suffixes instead of prefixes", async t => {
  if (!(await ensureDb(t))) return;
  const rows = await activeExercises();
  assertNoOffenders(rows.filter(row => /^(Tempo|Assisted|Heel-Elevated|Feet-Elevated|Kneeling|Close-Grip) /.test(row.name)), "Variant prefixes");
});

test("exercise names avoid obsolete abbreviations and spellings", async t => {
  if (!(await ensureDb(t))) return;
  const rows = await activeExercises();
  assertNoOffenders(rows.filter(row => /\bRDL\b|Med Ball|Pull Over|Front Rack|\bDB\b|\bKB\b|\(Bodyweight\)/.test(row.name)), "Obsolete names");
});

test("machine and cable equipment have explicit name prefixes", async t => {
  if (!(await ensureDb(t))) return;
  const machines = new Set(["leg_press", "leg_extension", "leg_curl", "pec_deck", "chest_press", "shoulder_press", "hack_squat", "calf_machine", "row_machine"]);
  const cables = new Set(["cable", "lat_pulldown"]);
  const rows = await activeExercises();
  assertNoOffenders(rows.filter(row => {
    const slugs = row.equipment_items_slugs ?? [];
    return (slugs.some(slug => machines.has(slug)) && !row.name.startsWith("Machine "))
      || (slugs.some(slug => cables.has(slug)) && !row.name.startsWith("Cable "));
  }), "Missing Machine/Cable prefix");
});

test("equipment name prefixes agree with equipment slugs", async t => {
  if (!(await ensureDb(t))) return;
  const prefixes = [["Dumbbell ", "dumbbells"], ["Kettlebell ", "kettlebells"], ["Barbell ", "barbell"]];
  const rows = await activeExercises();
  assertNoOffenders(rows.filter(row => prefixes.some(([prefix, slug]) => row.name.startsWith(prefix) && !(row.equipment_items_slugs ?? []).includes(slug))), "Equipment prefix mismatch");
});

test("goblet squat families are active and require exactly their matching implement", async t => {
  if (!(await ensureDb(t))) return;
  const rows = await activeExercises();
  const offenders = [];
  for (const source of ["goblet_squat", "tempo_goblet_squat", "heelelevated_goblet_squat"]) {
    for (const [id, slug] of [[source, "dumbbells"], [`kb_${source}`, "kettlebells"]]) {
      const row = rows.find(row => row.exercise_id === id);
      if (!row) offenders.push({ exercise_id: id, name: "missing or archived" });
      else if (row.equipment_items_slugs?.length !== 1 || row.equipment_items_slugs[0] !== slug) offenders.push(row);
    }
  }
  assertNoOffenders(offenders, "Goblet family missing or incorrectly tagged");
});

test("every active exercise equipment slug exists in equipment_items", async t => {
  if (!(await ensureDb(t))) return;
  const rows = await activeExercises();
  const equipment = await pool.query("SELECT exercise_slug FROM equipment_items");
  const slugs = new Set(equipment.rows.map(row => row.exercise_slug));
  const offenders = rows.flatMap(row => {
    const missing = (row.equipment_items_slugs ?? []).filter(slug => !slugs.has(slug));
    return missing.length ? [{ ...row, missing_slugs: missing }] : [];
  });
  assertNoOffenders(offenders, "Unknown equipment slugs");
});
