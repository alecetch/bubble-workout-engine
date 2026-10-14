import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';

after(() => pool.end());
async function ensureDb(t) {
  try { await pool.query('SELECT 1'); return true; }
  catch (err) { t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`); return false; }
}

test('every live region including cardio has at least two no-equipment cool-downs', async t => {
  if (!(await ensureDb(t))) return;
  const { rows } = await pool.query(`WITH regions AS (
    SELECT DISTINCT region FROM exercise_catalogue, jsonb_array_elements_text(target_regions_json) AS region
    WHERE is_archived=false
  ), coverage AS (
    SELECT region, count(*)::int AS count FROM cooldown_exercise, jsonb_array_elements_text(target_regions_json) AS region
    WHERE is_archived=false AND equipment_items_slugs='{}'::text[] GROUP BY region
  ) SELECT regions.region, COALESCE(coverage.count,0) AS count
    FROM regions LEFT JOIN coverage USING (region) ORDER BY regions.region`);
  assert.ok(rows.length > 0, 'Expected catalogue regions');
  assert.ok(rows.some(row => row.region === 'cardio'), 'Cardio must be included in coverage');
  const shortfalls = rows.filter(row => row.count < 2);
  assert.deepEqual(shortfalls, [], `Cool-down region shortfalls: ${JSON.stringify(shortfalls)}`);
});

test('seven launch stretches are restored while the other nine remain archived', async t => {
  if (!(await ensureDb(t))) return;
  const restored = ['cooldown-doorway-pec-stretch', 'cooldown-cross-chest-triceps-stretch', 'cooldown-supine-twist-hold',
    'cooldown-straight-knee-calf-stretch', 'cooldown-standing-biceps-stretch', 'cooldown-standing-quad-stretch', 'cooldown-side-lying-rear-shoulder-stretch'];
  const archived = ['cooldown-supine-chest-stretch', 'cooldown-finger-extension-stretch', 'cooldown-overhead-shoulder-stretch',
    'cooldown-wall-shoulder-flexion-stretch', 'cooldown-rounded-back-hold', 'cooldown-seated-upper-back-stretch',
    'cooldown-seated-biceps-stretch', 'cooldown-supine-knee-to-shoulder-stretch', 'cooldown-seated-hamstring-stretch'];
  const { rows } = await pool.query('SELECT cooldown_exercise_id, is_archived FROM cooldown_exercise WHERE cooldown_exercise_id=ANY($1)', [[...restored, ...archived]]);
  assert.equal(rows.length, restored.length + archived.length);
  const byId = new Map(rows.map(row => [row.cooldown_exercise_id, row.is_archived]));
  for (const id of restored) assert.equal(byId.get(id), false, `${id} must be active`);
  for (const id of archived) assert.equal(byId.get(id), true, `${id} must remain archived`);
});

test('every active cool-down has a media row', async t => {
  if (!(await ensureDb(t))) return;
  const { rows } = await pool.query(`SELECT ce.cooldown_exercise_id FROM cooldown_exercise ce
    LEFT JOIN cooldown_exercise_media cm USING (cooldown_exercise_id)
    WHERE ce.is_archived=false AND cm.cooldown_exercise_id IS NULL`);
  assert.deepEqual(rows, [], `Active cool-downs missing media: ${JSON.stringify(rows)}`);
});
