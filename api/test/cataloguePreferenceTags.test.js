import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pool } from '../src/db.js';
import { fetchCoverageReport } from '../src/routes/adminCoverage.js';

// Repo checkout (CI, host): <repo>/migrations. Docker Compose api container: mounted at /app/migrations.
const MIGRATIONS_DIR = [new URL('../../migrations/', import.meta.url), new URL('../migrations/', import.meta.url)]
  .find(dir => existsSync(dir));
const catalogue = readFileSync(new URL('R__exercise_catalogue_edits.sql', MIGRATIONS_DIR), 'utf8');

// Real exercises that a strict slot preference used to exclude, leaving gym and
// bodyweight slots with one or two candidates (launch-readiness reassessment, 2026-10-17).
const ADDED_TAGS = {
  hypertrophy_secondary: ['seated_cable_row', 'chestsupported_row_machine', 'bb_bentover_row'],
  strength_main: ['db_rdl', 'kb_romanian_deadlift', 'bb_romanian_deadlift'],
  hyrox_station: ['split_squat', 'bodyweight_reverse_lunge', 'bulgarian_split_squat'],
};

function preferredIn(id) {
  const block = catalogue.match(new RegExp(`\\) VALUES \\(\\r?\\n  '${id}',\\r?\\n([\\s\\S]*?)\\r?\\n\\)\\r?\\nON CONFLICT`));
  assert.ok(block, `Expected an INSERT block for ${id}`);
  // Field 19 of 35 is preferred_in_json; field 1 is the id line matched above.
  const line = block[1].split(/\r?\n/)[17].trim();
  return JSON.parse(line.replace(/^'/, '').replace(/'::jsonb,$/, ''));
}

test('real exercises carry the preference tags their strict slots require', () => {
  const missing = Object.entries(ADDED_TAGS).flatMap(([tag, ids]) =>
    ids.filter(id => !preferredIn(id).includes(tag)).map(id => `${id} lacks ${tag}`));
  assert.deepEqual(missing, [], `Missing preference tags:\n${missing.join('\n')}`);
});

after(() => pool.end());
async function ensureDb(t) {
  try { await pool.query('SELECT 1'); return true; }
  catch (err) { t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`); return false; }
}

const MINIMUMS = [
  // Commercial beginners had only Single-Arm DB Row as their main horizontal pull.
  ['hypertrophy_default_v1', 'day2', 'B:pull_horizontal', 'commercial_gym', [0], 3],
  // Home and CrossFit beginners had only KB Deadlift as their main hinge.
  ...['decent_home_gym', 'crossfit_hyrox_gym'].flatMap(preset => [
    ['hypertrophy_default_v1', 'day3', 'A:hinge', preset, [0], 3],
    ['strength_default_v1', 'day1', 'B:hinge_strength', preset, [0], 3],
    ['strength_default_v1', 'day3', 'A:hinge_posterior_strength', preset, [0], 3],
  ]),
  // No Equipment and Minimal had only Walking Lunges at the HYROX lunge station.
  ...['no_equipment', 'minimal_equipment'].map(preset =>
    ['hyrox_default_v1', 'hyrox_simulation', 'G:lunge', preset, [0, 1, 2, 3], 4]),
];

test('preference tag fixes widen the previously thin slots', async t => {
  if (!(await ensureDb(t))) return;
  const report = await fetchCoverageReport({ db: pool });
  const failures = MINIMUMS.flatMap(([config, day, slot, preset, ranks, min]) => {
    const row = report.rows.find(r => r.config_key === config && r.day_key === day && r.slot === slot);
    if (!row) return [`${config}|${day}|${slot}: slot missing`];
    return ranks.flatMap(rank => {
      const count = row.counts[`${preset}_${rank}`];
      return count >= min ? [] : [`${config}|${day}|${slot}|${preset}|${rank}: ${count ?? 'missing'} < ${min}`];
    });
  });
  assert.deepEqual(failures, [], `Thin slots:\n${failures.join('\n')}`);
});
