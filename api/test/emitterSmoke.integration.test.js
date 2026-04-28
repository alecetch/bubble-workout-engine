import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { runPipeline } from "../engine/runPipeline.js";
import { buildInputsFromProfile } from "../src/services/buildInputsFromProfile.js";

async function ensureDb(t) {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (err) {
    t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`);
    return false;
  }
}

async function makeMinimalInputs(db) {
  const exerciseResult = await db.query(`
    SELECT
      exercise_id,
      name,
      movement_pattern_primary,
      swap_group_id_1,
      swap_group_id_2,
      preferred_in_json,
      equipment_json,
      density_rating,
      complexity_rank,
      is_loadable,
      strength_equivalent,
      min_fitness_rank,
      movement_class,
      target_regions_json,
      warmup_hooks,
      accepts_distance_unit,
      coaching_cues_json,
      load_guidance,
      logging_guidance
    FROM exercise_catalogue
    WHERE is_archived = false
    ORDER BY exercise_id
  `);

  return buildInputsFromProfile(
    {
      fitnessLevel: "intermediate",
      equipmentItemCodes: ["barbell", "dumbbells", "bench"],
      preferredDays: ["Mon", "Wed", "Fri"],
      minutesPerSession: 40,
      goals: ["hypertrophy"],
    },
    exerciseResult.rows,
  );
}

test("emitter rows - PRG/DAY/EX column positions match importEmitterService expectations", async (t) => {
  if (!(await ensureDb(t))) return;

  const out = await runPipeline({
    inputs: await makeMinimalInputs(pool),
    programType: "hypertrophy",
    request: {
      config_key: "hypertrophy_default_v1",
      anchor_day_ms: new Date("2026-01-05T00:00:00.000Z").getTime(),
    },
    db: pool,
    userId: null,
  });

  const rows = out.rows;
  assert.ok(Array.isArray(rows) && rows.length > 0, "runPipeline must return rows");

  const parsed = rows.map((row) => row.split("|"));

  const prgRows = parsed.filter((cols) => cols[0] === "PRG");
  assert.equal(prgRows.length, 1, "exactly one PRG row");
  const prg = prgRows[0];
  assert.equal(prg.length, 9, "PRG row must have 9 columns");
  assert.ok(prg[1]?.trim().length > 0, "PRG cols[1] = program_title must be non-empty");
  assert.ok(Number(prg[3]) >= 1, "PRG cols[3] = weeks_count must be >= 1");
  assert.ok(Number(prg[4]) >= 1 && Number(prg[4]) <= 7, "PRG cols[4] = days_per_week must be 1-7");
  assert.ok(
    ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(prg[7]),
    `PRG cols[7] = start_weekday must be a weekday name, got: ${prg[7]}`,
  );

  const weekRows = parsed.filter((cols) => cols[0] === "WEEK");
  assert.ok(weekRows.length >= 1, "at least one WEEK row");
  for (const wk of weekRows) {
    assert.equal(wk.length, 4, "WEEK row must have 4 columns");
    assert.ok(Number(wk[1]) >= 1, "WEEK cols[1] = week_number must be >= 1");
  }

  const dayRows = parsed.filter((cols) => cols[0] === "DAY");
  assert.ok(dayRows.length >= 1, "at least one DAY row");
  const dayKeys = new Set();
  for (const day of dayRows) {
    assert.equal(day.length, 14, "DAY row must have 14 columns");
    assert.ok(Number(day[1]) >= 1, "DAY cols[1] = week_number must be >= 1");
    assert.ok(Number(day[2]) >= 1, "DAY cols[2] = day_number must be >= 1");
    assert.ok(day[13]?.trim().length > 0, "DAY cols[13] = program_day_key must be non-empty");
    dayKeys.add(day[13]);
  }

  const segRows = parsed.filter((cols) => cols[0] === "SEG");
  assert.ok(segRows.length >= 1, "at least one SEG row");
  for (const seg of segRows) {
    assert.equal(seg.length, 20, "SEG row must have 20 columns");
    assert.ok(seg[1]?.trim().length > 0, "SEG cols[1] = segment_key must be non-empty");
  }

  const exRows = parsed.filter((cols) => cols[0] === "EX");
  assert.ok(exRows.length >= 1, "at least one EX row");
  for (const ex of exRows) {
    assert.equal(ex.length, 26, "EX row must have 26 columns");
    assert.ok(ex[1]?.trim().length > 0, "EX cols[1] = exercise_id must be non-empty");
    assert.ok(Number(ex[7]) >= 1, "EX cols[7] = sets_prescribed must be >= 1");
    assert.ok(ex[8]?.trim().length > 0, "EX cols[8] = reps_prescribed must be non-empty");
    assert.ok(ex[17]?.trim().length > 0, "EX cols[17] = segment_key must be non-empty");
    assert.ok(
      ["single", "superset", "giant_set", "amrap", "emom"].includes(ex[18]),
      `EX cols[18] = segment_type must be a known type, got: ${ex[18]}`,
    );
    assert.ok(ex[25]?.trim().length > 0, "EX cols[25] = program_day_key must be non-empty");
    assert.ok(
      dayKeys.has(ex[25]),
      `EX cols[25] program_day_key "${ex[25]}" has no matching DAY row`,
    );
  }
});
