import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { pool } from '../src/db.js';

const migrationUrl = [
  new URL('../../migrations/V138__equipment_running_space_profile_migration.sql', import.meta.url),
  new URL('../migrations/V138__equipment_running_space_profile_migration.sql', import.meta.url),
].find(url => existsSync(url));
const migration = readFileSync(migrationUrl, 'utf8');
after(() => pool.end());
async function ensureDb(t) {
  try { await pool.query('SELECT 1'); return true; }
  catch (err) { t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`); return false; }
}

test('running-space migration updates profiles and day overrides by preset and is idempotent', async t => {
  if (!(await ensureDb(t))) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cases = [
      ...['minimal_equipment', 'decent_home_gym', 'crossfit_hyrox_gym', 'crossfit/hyrox_gym'].map(preset => ({ preset, before: ['bodyweight', 'treadmill'], after: ['bodyweight', 'running_space'] })),
      { preset: 'commercial_gym', before: ['bodyweight', 'treadmill'], after: ['bodyweight', 'treadmill', 'running_space'] },
      { preset: null, before: ['bodyweight', 'treadmill'], after: ['bodyweight', 'treadmill'] },
      { preset: 'custom', before: ['bodyweight', 'treadmill'], after: ['bodyweight', 'treadmill'] },
      { preset: 'commercial_gym', before: ['treadmill', 'running_space'], after: ['treadmill', 'running_space'] },
      { preset: 'minimal_equipment', before: ['bodyweight'], after: ['bodyweight'] },
    ];
    const profileIds = [], dayIds = [];
    for (const [index, fixture] of cases.entries()) {
      const { rows: [user] } = await client.query('INSERT INTO app_user (subject_id) VALUES ($1) RETURNING id', [`running-space-${randomUUID()}`]);
      const { rows: [profile] } = await client.query(`INSERT INTO client_profile
        (user_id, fitness_level_slug, fitness_rank, equipment_items_slugs, equipment_preset_slug,
         preferred_days, minutes_per_session, main_goals_slugs)
        VALUES ($1, 'beginner', 0, $2, $3, ARRAY['mon'], 40, ARRAY['hypertrophy']) RETURNING id`, [user.id, fixture.before, fixture.preset]);
      profileIds.push(profile.id);
      const { rows: [program] } = await client.query(`INSERT INTO program
        (user_id, program_title, program_summary, weeks_count, days_per_week, program_outline_json,
         start_date, start_weekday, preferred_days_sorted_json)
        VALUES ($1, 'Running space fixture', '', 1, 1, '{}', CURRENT_DATE, 'mon', '["mon"]') RETURNING id`, [user.id]);
      const { rows: [week] } = await client.query('INSERT INTO program_week (program_id, week_number) VALUES ($1, 1) RETURNING id', [program.id]);
      const { rows: [day] } = await client.query(`INSERT INTO program_day
        (program_id, program_week_id, week_number, day_number, global_day_index, program_day_key,
         session_duration_mins, scheduled_date, equipment_override_preset_slug, equipment_override_items_slugs)
        VALUES ($1, $2, 1, 1, 1, $3, 40, CURRENT_DATE, $4, $5) RETURNING id`,
      [program.id, week.id, `rank-fixture-${index}`, fixture.preset, fixture.before]);
      dayIds.push(day.id);
    }
    // Null overrides must stay null even when the saved preset normally implies running space.
    const { rows: [nullDay] } = await client.query(`INSERT INTO program_day
      (program_id, program_week_id, week_number, day_number, global_day_index, program_day_key,
       session_duration_mins, scheduled_date, equipment_override_preset_slug, equipment_override_items_slugs)
      SELECT program_id, program_week_id, week_number, 2, 2, 'null-override', 40, CURRENT_DATE, 'commercial_gym', NULL
      FROM program_day WHERE id=$1 RETURNING id`, [dayIds[0]]);
    const snapshot = async () => ({
      profiles: (await client.query('SELECT id, equipment_items_slugs AS slugs FROM client_profile WHERE id=ANY($1) ORDER BY id', [profileIds])).rows,
      days: (await client.query('SELECT id, equipment_override_items_slugs AS slugs FROM program_day WHERE id=ANY($1) ORDER BY id', [[...dayIds, nullDay.id]])).rows,
    });
    await client.query(migration);
    const first = await snapshot();
    for (const [index, fixture] of cases.entries()) {
      assert.deepEqual(first.profiles.find(row => row.id === profileIds[index]).slugs, fixture.after, `Profile ${fixture.preset}`);
      assert.deepEqual(first.days.find(row => row.id === dayIds[index]).slugs, fixture.after, `Day override ${fixture.preset}`);
    }
    assert.equal(first.days.find(row => row.id === nullDay.id).slugs, null);
    await client.query(migration);
    assert.deepEqual(await snapshot(), first, 'Repeated migration must not add duplicate slugs or alter results');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
