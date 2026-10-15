import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { pool } from '../../db.js';
import { adminExerciseCatalogueRouter } from '../adminExerciseCatalogue.js';

after(() => pool.end());
const token = 'selector-flags-test-token';
async function withServer(fn) {
  process.env.INTERNAL_API_TOKEN = token;
  const app = express();
  app.use(express.json());
  app.use('/admin', adminExerciseCatalogueRouter);
  const server = await new Promise(resolve => { const server = app.listen(0, () => resolve(server)); });
  try { await fn(`http://127.0.0.1:${server.address().port}/admin/exercise-catalogue`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

for (const [field, value] of [['max_fitness_rank', null], ['is_substitute', false]]) {
  test(`admin rejects queued edits to ${field}`, async () => {
    await withServer(async base => {
      const response = await fetch(`${base}/session/queue-change`, {
        method: 'POST', headers: { 'X-Internal-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit', exercise_id: 'pushup', changes: { [field]: value } }),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error, 'max_fitness_rank and is_substitute are managed in R__seed_exercise_catalogue_selector_flags.sql');
    });
  });

  test(`CSV import rejects the seed-owned ${field} column even when blank`, async t => {
    try { await pool.query('SELECT 1'); }
    catch (err) { t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`); return; }
    await withServer(async base => {
      const response = await fetch(`${base}/csv-import-dry-run`, {
        method: 'POST', headers: { 'X-Internal-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: `exercise_id,name,movement_class,movement_pattern_primary,${field}\nnew_selector_test,Selector Test,compound,squat,\n` }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, false);
      assert.ok(body.errors.some(error => error.row === 2 && error.error.includes('R__seed_exercise_catalogue_selector_flags.sql')), JSON.stringify(body));
      assert.equal(body.valid_rows, 0);
      assert.equal(body.sql_preview, null);
    });
  });
}
