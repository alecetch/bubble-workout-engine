import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, rankBest } from '../exerciseSelector.js';

// Match the catalogue's movement metadata and preference tags. Real ergs carry
// conditioning_main and erg-specific sw2 values; bodyweight substitutes do not.
const byId = buildIndex({ ex: [
  { id: 'row_erg', mp: 'cyclical_engine', sw: 'row_erg', sw2: 'row_interval', pref: ['conditioning_main', 'hyrox_station', 'hyrox_buy_in'], den: 3, cx: 1 },
  { id: 'ski_erg', mp: 'cyclical_engine', sw: 'ski_erg', sw2: 'ski_interval', pref: ['conditioning_main', 'hyrox_station', 'hyrox_buy_in'], den: 3, cx: 1 },
  { id: 'jumping_jack', mp: 'cyclical_engine', sw: 'engine', sw2: null, pref: ['finisher'], den: 3, cx: 1 },
  { id: 'squat_thrust', mp: 'cyclical_engine', sw: 'engine', sw2: null, pref: ['hyrox_station', 'finisher'], den: 3, cx: 1 },
  { id: 'bodyweight_ski_hinge', mp: 'cyclical_engine', sw: 'ski_erg', sw2: null, pref: ['hyrox_station', 'finisher'], den: 3, cx: 1 },
] });
const all = new Set(Object.keys(byId));
const bodyweight = new Set(['jumping_jack', 'squat_thrust', 'bodyweight_ski_hinge']);
const conditioning = { mp: 'cyclical_engine', requirePref: 'conditioning_main', prefMode: 'soft', rankValue: 0 };
const ski = { sw: 'ski_erg', sw2: 'ski_interval', requirePref: 'hyrox_station', prefMode: 'strict', rankValue: 0 };
const rank = (allowed, selector) => rankBest(allowed, byId, selector, null, null, null);

test('conditioning engine slots rank both real ergs above every bodyweight substitute', () => {
  const ranked = rank(all, conditioning);
  assert.equal(ranked.length, 5);
  const scores = new Map(ranked.map(({ ex, score }) => [ex.id, score]));
  for (const erg of ['row_erg', 'ski_erg']) for (const substitute of bodyweight) {
    assert.ok(scores.get(erg) > scores.get(substitute), `${erg} must outrank ${substitute}`);
  }
});

test('strict HYROX ski slot prefers the real Ski Erg', () => {
  assert.equal(rank(all, ski)[0].ex.id, 'ski_erg');
});

test('bodyweight-only users can still fill conditioning and strict ski slots', () => {
  const ranked = rank(bodyweight, conditioning);
  assert.ok(ranked.length > 0);
  assert.ok(ranked.every(({ ex }) => bodyweight.has(ex.id)));
  assert.deepEqual(rank(bodyweight, ski).map(({ ex }) => ex.id), ['bodyweight_ski_hinge']);
});
