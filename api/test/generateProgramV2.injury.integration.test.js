import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../src/db.js';
import { createGenerateProgramV2Handler } from '../src/routes/generateProgramV2.js';

after(() => pool.end());

test('generation for a knee-injury profile persists no contraindicated exercise or bookend', async t => {
  try { await pool.query('SELECT 1'); }
  catch (err) { t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`); return; }
  const subject = `injury-test-${randomUUID()}`;
  const user = (await pool.query('INSERT INTO app_user(subject_id) VALUES ($1) RETURNING id', [subject])).rows[0];
  try {
    const profile = (await pool.query('INSERT INTO client_profile(user_id) VALUES ($1) RETURNING id', [user.id])).rows[0];
    const equipment = (await pool.query('SELECT exercise_slug FROM equipment_items')).rows.map(row => row.exercise_slug);
    const handler = createGenerateProgramV2Handler({
      db: pool,
      getProfileByUser: async () => ({
        id: profile.id, goals: ['conditioning'], fitnessLevel: 'elite', injuryFlags: ['knee_issues'],
        equipmentPreset: 'commercial_gym', equipmentItemCodes: equipment,
        preferredDays: ['mon', 'wed', 'fri'], minutesPerSession: 60,
      }),
    });
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    const errors = [];
    await handler({
      request_id: subject,
      body: { user_id: subject, anchor_date_ms: Date.UTC(2026, 9, 19), programType: 'conditioning' },
      log: { info() {}, debug() {}, warn() {}, error(detail) { errors.push(detail); } },
    }, res);
    assert.equal(res.statusCode, 200, JSON.stringify({ body: res.body, errors }));
    assert.equal(res.body.ok, true);
    const { rows } = await pool.query(`SELECT pe.exercise_id, pe.segment_type,
      CASE WHEN pe.segment_type='warmup' THEN we.contraindications_slugs
           WHEN pe.segment_type='cooldown' THEN ce.contraindications_slugs
           ELSE ec.contraindications_slugs END AS flags
      FROM program_exercise pe
      LEFT JOIN exercise_catalogue ec ON ec.exercise_id=pe.exercise_id
      LEFT JOIN warmup_exercise we ON we.warmup_exercise_id=pe.exercise_id
      LEFT JOIN cooldown_exercise ce ON ce.cooldown_exercise_id=pe.exercise_id
      WHERE pe.program_id=$1`, [res.body.program_id]);
    assert.ok(rows.some(row => !['warmup', 'cooldown'].includes(row.segment_type)), 'Expected main work');
    assert.ok(rows.some(row => row.segment_type === 'warmup'), 'Expected warm-ups');
    assert.ok(rows.some(row => row.segment_type === 'cooldown'), 'Expected cool-downs');
    assert.deepEqual(rows.filter(row => !Array.isArray(row.flags) || row.flags.includes('knee_issues')), []);
  } finally {
    await pool.query('DELETE FROM generation_run WHERE program_id IN (SELECT id FROM program WHERE user_id=$1)', [user.id]);
    await pool.query('DELETE FROM program WHERE user_id=$1', [user.id]);
    await pool.query('DELETE FROM app_user WHERE id=$1', [user.id]);
  }
});
