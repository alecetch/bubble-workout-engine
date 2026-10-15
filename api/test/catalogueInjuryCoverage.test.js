import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { fetchCoverageReport } from '../src/routes/adminCoverage.js';
import { getAllowedExerciseIds } from '../engine/getAllowedExercises.js';

after(() => pool.end());
let dbCheck;
async function ensureDb(t) {
  dbCheck ??= pool.query('SELECT 1').then(() => null, err => err);
  const err = await dbCheck;
  if (!err) return true;
  t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`);
  return false;
}

for (const flag of ['shoulder_issues', 'knee_issues', 'lower_back_spine', 'ankle_foot', 'wrist_elbow', 'cardiovascular_limitations']) {
  test(`${flag} leaves every slot, equipment preset and fitness rank covered`, async t => {
    if (!(await ensureDb(t))) return;
    const report = await fetchCoverageReport({ db: pool, injury_flags: [flag] });
    assert.ok(report.rows.length > 0, 'Expected active configuration slots');
    const empty = report.rows.flatMap(row => report.presets.flatMap(preset => report.ranks.flatMap(rank => {
      const count = row.counts[`${preset.code}_${rank.value}`];
      return count > 0 ? [] : [[flag, row.config_key, row.day_key, row.slot, preset.code, rank.value].join('|')];
    })));
    assert.deepEqual(empty, [], `Empty injury coverage cells:\n${empty.join('\n')}`);
  });
}

test('knee flags exclude box jumps while keeping Air Squat available', async t => {
  if (!(await ensureDb(t))) return;
  const equipment = (await pool.query('SELECT exercise_slug FROM equipment_items')).rows.map(row => row.exercise_slug);
  const profile = { fitness_rank: 3, equipment_items_slugs: equipment };
  const baseline = await getAllowedExerciseIds(pool, { ...profile, injury_flags_slugs: [] });
  assert.ok(baseline.includes('box_jump'), 'Box Jump must be eligible before injury filtering');
  const allowed = await getAllowedExerciseIds(pool, { ...profile, injury_flags_slugs: ['knee_issues'] });
  assert.ok(!allowed.includes('box_jump'));
  assert.ok(allowed.includes('air_squat'));
});
