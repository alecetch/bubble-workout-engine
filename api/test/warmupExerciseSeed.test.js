import test, { after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";

after(() => pool.end());

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

test('cardio has at least two low-impact no-equipment warm-ups', async t => {
  if (!(await ensureDb(t))) return;
  const { rows: [row] } = await pool.query(`SELECT count(*)::int AS count
    FROM warmup_exercise
    WHERE is_archived=false AND target_regions_json ? 'cardio'
      AND equipment_items_slugs='{}'::text[] AND movement_class='cardio'
      AND warmup_exercise_id NOT IN ('warmup-jumping-jacks', 'warmup-high-knees')`);
  assert.ok(row.count >= 2, `Expected two low-impact cardio options, found ${row.count}`);
});

test('every live region keeps a no-equipment warm-up for each injury flag', async t => {
  if (!(await ensureDb(t))) return;
  // Injury filtering must never leave a region without a safe bodyweight option.
  const shortfalls = [];
  for (const flag of ['shoulder_issues', 'knee_issues', 'lower_back_spine', 'ankle_foot', 'wrist_elbow', 'cardiovascular_limitations']) {
    const { rows } = await pool.query(`WITH regions AS (
      SELECT DISTINCT region FROM exercise_catalogue, jsonb_array_elements_text(target_regions_json) AS region
      WHERE is_archived=false
    ), coverage AS (
      SELECT region, count(*)::int AS count FROM warmup_exercise, jsonb_array_elements_text(target_regions_json) AS region
      WHERE is_archived=false AND equipment_items_slugs='{}'::text[] AND NOT ($1 = ANY(contraindications_slugs))
      GROUP BY region
    ) SELECT regions.region FROM regions LEFT JOIN coverage USING (region) WHERE COALESCE(coverage.count, 0) < 1`, [flag]);
    for (const row of rows) shortfalls.push(`${flag}: ${row.region}`);
  }
  assert.deepEqual(shortfalls, [], `Regions without a safe no-equipment warm-up:\n${shortfalls.join('\n')}`);
});

test('reviewed warm-up injury tags match the seed exactly', async t => {
  if (!(await ensureDb(t))) return;
  const expected = {
    'warmup-plank-up-down': ['wrist_elbow'],
    'warmup-scap-push-up': ['wrist_elbow'],
    'warmup-push-up-plus': ['wrist_elbow'],
    'warmup-walkout-shoulder-tap': ['wrist_elbow'],
    'warmup-floor-triceps-dip': ['shoulder_issues', 'wrist_elbow'],
    'warmup-incline-push-up': ['wrist_elbow'],
    'warmup-jumping-jacks': ['ankle_foot', 'knee_issues'],
    'warmup-high-knees': ['ankle_foot', 'knee_issues'],
    'warmup-cossack-squat': ['knee_issues'],
    'warmup-kb-cossack-squat': ['knee_issues'],
    'warmup-ankle-bounces': ['ankle_foot'],
    'warmup-dead-hang': ['shoulder_issues'],
  };
  const { rows } = await pool.query('SELECT warmup_exercise_id AS id, contraindications_slugs FROM warmup_exercise WHERE warmup_exercise_id = ANY($1)', [Object.keys(expected)]);
  assert.equal(rows.length, Object.keys(expected).length, 'Expected every tagged id to exist');
  for (const row of rows) assert.deepEqual([...row.contraindications_slugs].sort(), expected[row.id], row.id);
});
