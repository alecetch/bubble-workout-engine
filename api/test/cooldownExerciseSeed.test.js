import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pool } from '../src/db.js';

after(() => pool.end());
async function ensureDb(t) {
  try { await pool.query('SELECT 1'); return true; }
  catch (err) { t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`); return false; }
}

test('lower-back stretches cover glutes with ready media and clear cues', async t => {
  if (!(await ensureDb(t))) return;
  const seedPath = [new URL('../../migrations/R__seed_cooldown_exercises.sql', import.meta.url),
    new URL('../migrations/R__seed_cooldown_exercises.sql', import.meta.url)].find(path => existsSync(path));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = ['cooldown-childs-pose', 'cooldown-supine-twist-hold', 'cooldown-butterfly-stretch'];
    // Uploads are environment-owned; fresh databases intentionally have placeholders.
    // Model existing ready uploads transactionally, then prove replay preserves them.
    await client.query(`UPDATE cooldown_exercise_media SET video_status='ready'
      WHERE cooldown_exercise_id = ANY($1) AND video_status <> 'ready' AND NOT video_not_needed`, [ids.slice(0, 2)]);
    const mediaBefore = (await client.query(`SELECT * FROM cooldown_exercise_media
      WHERE cooldown_exercise_id = ANY($1) ORDER BY cooldown_exercise_id`, [ids])).rows;
    // Simulate pre-change/admin-edited rows: WHERE NOT EXISTS inserts alone cannot fix these.
    await client.query(`UPDATE cooldown_exercise SET target_regions_json = '[]'::jsonb,
      cue_text = 'Legacy cue' WHERE cooldown_exercise_id = ANY($1)`, [ids]);
    await client.query(readFileSync(seedPath, 'utf8'));
    const { rows } = await client.query(`SELECT e.cooldown_exercise_id AS id, e.target_regions_json,
      e.is_archived, e.cue_text, m.video_status, m.video_not_needed
      FROM cooldown_exercise e LEFT JOIN cooldown_exercise_media m USING (cooldown_exercise_id)
      WHERE e.cooldown_exercise_id = ANY($1)`, [ids]);
    assert.equal(rows.length, ids.length);
    const byId = new Map(rows.map(row => [row.id, row]));
    for (const [id, regions] of [
      ['cooldown-childs-pose', ['lats', 'upper_back', 'glutes']],
      ['cooldown-supine-twist-hold', ['core', 'glutes']],
    ]) {
      const row = byId.get(id);
      assert.deepEqual([...row.target_regions_json].sort(), [...regions].sort(), id);
      assert.equal(row.is_archived, false, id);
      assert.ok(row.video_status === 'ready' || row.video_not_needed === true, `${id} must retain usable media`);
      assert.match(row.cue_text, /lower back/i, id);
    }
    assert.match(byId.get('cooldown-butterfly-stretch').cue_text, /inner thighs/i);
    const mediaAfter = (await client.query(`SELECT * FROM cooldown_exercise_media
      WHERE cooldown_exercise_id = ANY($1) ORDER BY cooldown_exercise_id`, [ids])).rows;
    assert.deepEqual(mediaAfter, mediaBefore, 'Replaying the seed must not alter existing media');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

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

test('every live region keeps a no-equipment cool-down for each injury flag', async t => {
  if (!(await ensureDb(t))) return;
  // Injury filtering must never leave a region without a safe bodyweight option.
  const shortfalls = [];
  for (const flag of ['shoulder_issues', 'knee_issues', 'lower_back_spine', 'ankle_foot', 'wrist_elbow', 'cardiovascular_limitations']) {
    const { rows } = await pool.query(`WITH regions AS (
      SELECT DISTINCT region FROM exercise_catalogue, jsonb_array_elements_text(target_regions_json) AS region
      WHERE is_archived=false
    ), coverage AS (
      SELECT region, count(*)::int AS count FROM cooldown_exercise, jsonb_array_elements_text(target_regions_json) AS region
      WHERE is_archived=false AND equipment_items_slugs='{}'::text[] AND NOT ($1 = ANY(contraindications_slugs))
      GROUP BY region
    ) SELECT regions.region FROM regions LEFT JOIN coverage USING (region) WHERE COALESCE(coverage.count, 0) < 1`, [flag]);
    for (const row of rows) shortfalls.push(`${flag}: ${row.region}`);
  }
  assert.deepEqual(shortfalls, [], `Regions without a safe no-equipment cool-down:\n${shortfalls.join('\n')}`);
});

test('reviewed cool-down injury tags match the seed exactly', async t => {
  if (!(await ensureDb(t))) return;
  const expected = {
    'cooldown-pigeon-stretch': ['knee_issues'],
  };
  const { rows } = await pool.query('SELECT cooldown_exercise_id AS id, contraindications_slugs FROM cooldown_exercise WHERE cooldown_exercise_id = ANY($1)', [Object.keys(expected)]);
  assert.equal(rows.length, Object.keys(expected).length, 'Expected every tagged id to exist');
  for (const row of rows) assert.deepEqual([...row.contraindications_slugs].sort(), expected[row.id], row.id);
});
