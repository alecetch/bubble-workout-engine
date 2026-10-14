import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { fetchCoverageReport, PRESETS, RANKS } from '../src/routes/adminCoverage.js';
import { KNOWN_EMPTY, MIN_COUNTS } from './fixtures/catalogueCoverageGate.js';

after(() => pool.end());
let reportPromise;
let dbCheck;
async function ensureDb(t) {
  dbCheck ??= pool.query('SELECT 1').then(() => null, err => err);
  const err = await dbCheck;
  if (!err) return true;
  t.skip(`Postgres unavailable: ${err?.code || err?.message || err}`);
  return false;
}
async function cells(t) {
  if (!(await ensureDb(t))) return null;
  reportPromise ??= fetchCoverageReport({ db: pool });
  const report = await reportPromise;
  assert.ok(report.rows.length > 0, 'Expected active configuration slots');
  return new Map(report.rows.flatMap(row => report.presets.flatMap(preset => report.ranks.map(rank => {
    const key = [row.config_key, row.day_key, row.slot, preset.code, rank.value].join('|');
    return [key, row.counts[`${preset.code}_${rank.value}`]];
  }))));
}

test('catalogue coverage has no unexpected empty slot', async t => {
  const counts = await cells(t); if (!counts) return;
  const allowed = new Set(KNOWN_EMPTY);
  const unexpected = [...counts].filter(([key, count]) => count === 0 && !allowed.has(key)).map(([key]) => key);
  assert.deepEqual(unexpected, [], `Unexpected empty coverage cells:\n${unexpected.join('\n')}`);
});

test('known empty coverage cells still exist and remain empty', async t => {
  const counts = await cells(t); if (!counts) return;
  const obsolete = KNOWN_EMPTY.filter(key => counts.get(key) !== 0);
  assert.deepEqual(obsolete, [], `Remove filled or missing entries from KNOWN_EMPTY:\n${obsolete.map(key => `${key}: ${counts.get(key) ?? 'missing'}`).join('\n')}`);
});

test('catalogue coverage meets minimum candidate counts', async t => {
  const counts = await cells(t); if (!counts) return;
  const failures = MIN_COUNTS.flatMap(entry => {
    const key = [entry.config_key, entry.day_key, entry.slot, entry.preset, entry.rank].join('|');
    const count = counts.get(key);
    return Number.isFinite(count) && count >= entry.min ? [] : [`${key}: actual ${count ?? 'missing'}, minimum ${entry.min}; ${entry.reason}`];
  });
  assert.deepEqual(failures, [], `Coverage minimum failures:\n${failures.join('\n')}`);
});

test('catalogue coverage fixture has unique keys and valid presets and ranks', () => {
  assert.equal(new Set(KNOWN_EMPTY).size, KNOWN_EMPTY.length, 'Duplicate KNOWN_EMPTY keys');
  const presets = new Set(PRESETS.map(preset => preset.code));
  const ranks = new Set(RANKS.map(rank => rank.value));
  for (const entry of MIN_COUNTS) {
    assert.ok(presets.has(entry.preset), `Unknown preset ${entry.preset}`);
    assert.ok(ranks.has(entry.rank), `Unknown rank ${entry.rank}`);
  }
});
