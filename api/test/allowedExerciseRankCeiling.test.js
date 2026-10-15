import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { getAllowedExerciseIds } from '../engine/getAllowedExercises.js';

after(() => pool.end());
for (const [rank, excluded, included] of [
  [2, ['kneeling_pushup', 'incline_pushup', 'assisted_pistol_squat', 'shrimp_squat_assisted', 'band_assisted_pullup', 'negative_pullup'], ['pushup', 'pistol_squat', 'pullup']],
  [1, ['kneeling_pushup'], ['incline_pushup', 'band_assisted_pullup', 'negative_pullup']],
  [0, [], ['kneeling_pushup', 'incline_pushup']],
]) {
  test(`allowed exercises respect rank ceilings at rank ${rank}`, async t => {
    try { await pool.query('SELECT 1'); }
    catch (err) { t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`); return; }
    const allowed = await getAllowedExerciseIds(pool, { fitness_rank: rank, injury_flags_slugs: [], equipment_items_slugs: ['bodyweight', 'pullup_bar', 'resistance_band'] });
    for (const id of excluded) assert.ok(!allowed.includes(id), `${id} should be excluded at rank ${rank}`);
    for (const id of included) assert.ok(allowed.includes(id), `${id} should be included at rank ${rank}`);
    for (const id of ['air_squat', 'bodyweight_box_squat', 'squat_to_overhead_reach', 'step_back_burpee']) assert.ok(allowed.includes(id), `${id} must stay uncapped`);
  });
}
