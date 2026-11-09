import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { exerciseValues } from './fixtures/exerciseCatalogueSnapshot.js';

const directory = [new URL('../../migrations/', import.meta.url), new URL('../migrations/', import.meta.url)]
  .find(path => existsSync(path));
const catalogue = readFileSync(new URL('R__exercise_catalogue_edits.sql', directory), 'utf8');
const ids = [...catalogue.matchAll(/\) VALUES \(\r?\n  '([^']+)',/g)].map(match => match[1]);
const previouslyEmpty = new Set(['atomic_push_ups', 'bb_row_upright_row', 'db_pull_over', 'dead_tread',
  'kb_row_upright_row', 'kb_row_upright_row_and_swing', 'rdl_and_bent_over_row', 'table_row']);
const banned = /Rushing the movement|Forcing an uncomfortable range|Keep each repetition controlled|Move through a comfortable range/i;
const text = value => value === 'NULL' ? '' : value.slice(1, -1).replace(/''/g, "'");
const normalized = value => value.trim().toLowerCase();

test('every active exercise meets the Part A technique content standard', () => {
  const failures = [];
  for (const id of ids) {
    const { fields, archived } = exerciseValues(catalogue, id);
    if (archived) continue;
    const fail = rule => failures.push(`${id}: ${rule}`);
    const array = field => {
      try {
        const parsed = JSON.parse(text(fields[field].replace(/::jsonb$/, '')));
        if (Array.isArray(parsed)) return parsed;
      } catch { /* Report with the exercise id alongside other content failures. */ }
      fail(`${field} must be a JSON array`);
      return [];
    };
    const cue = text(fields.technique_cue);
    const setup = text(fields.technique_setup);
    if (!cue.trim() || cue.length > 40) fail('headline must be non-empty and <= 40 characters');
    if (!setup.trim()) fail('setup must be non-empty');
    const coaching = array('coaching_cues_json');
    if (coaching.length < 3) fail('at least three coaching cues required');
    for (const item of coaching) {
      if (typeof item !== 'string' || !item.trim() || item.length > 60) fail('each coaching cue must be a non-empty string <= 60 characters');
    }
    for (const field of ['coaching_cues_json', 'technique_execution_json', 'technique_mistakes_json']) {
      const items = field === 'coaching_cues_json' ? coaching : array(field);
      for (const item of items) {
        if (typeof item !== 'string' || !item.trim()) fail(`${field} entries must be non-empty strings`);
        else if (banned.test(item)) fail(`${field} contains banned boilerplate`);
      }
      if (field === 'coaching_cues_json') continue;
      const min = field === 'technique_execution_json' ? 3 : 2;
      const max = field === 'technique_execution_json' ? 4 : 3;
      if ((items.length || previouslyEmpty.has(id)) && (items.length < min || items.length > max)) fail(`${field} requires ${min}-${max} entries when present`);
      if (field === 'technique_execution_json' && items.some(item => typeof item === 'string'
        && [normalized(cue), normalized(setup)].includes(normalized(item)))) fail('execution repeats the setup or headline');
    }
    if (id === 'dead_tread' && !/non-motori[sz]ed|motor (is )?off/i.test(setup)) fail('setup must specify non-motorized treadmill or motor off');
    if (id === 'table_row' && !/sturdy/i.test(setup)) fail('setup must specify a sturdy table');
  }
  assert.ok(ids.length > 0, 'Expected catalogue blocks');
  assert.deepEqual(failures, [], `Technique content failures:\n${failures.join('\n')}`);
});

test('owner-reviewed atomic push-up uses floor support rather than TRX', () => {
  const { fields } = exerciseValues(catalogue, 'atomic_push_ups');
  assert.equal(fields.equipment_items_slugs, "'{}'::text[]");
  assert.equal(fields.equipment_json, "'[]'::jsonb");
  const guidance = [fields.technique_setup, fields.coaching_cues_json,
    fields.technique_execution_json, fields.technique_mistakes_json].join(' ');
  assert.doesNotMatch(guidance, /TRX|straps|cradles|suspend/i);
  assert.match(fields.technique_execution_json, /Jump your feet back while bending your elbows/i);
});
