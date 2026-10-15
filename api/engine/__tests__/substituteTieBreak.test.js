import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalogJsonFromBubble, buildIndex, rankBest } from '../exerciseSelector.js';

// Movement, swap and preference fields copied from the catalogue snapshot.
const stationPrefs = ['conditioning_main', 'finisher', 'hyrox_station', 'hyrox_power'];
const ergPrefs = ['conditioning_main', 'hyrox_station', 'hyrox_buy_in'];
const burpeePrefs = ['hyrox_station', 'conditioning_main'];
const fixtures = [
  ['sled_push', 'sled_push', 'sled_push', 'sled_compound', stationPrefs, false, 3],
  ['towel_push', 'sled_push', 'sled_push', null, stationPrefs, true, 3],
  ['dead_tread', 'sled_push', 'sled_push', null, stationPrefs, true, 3],
  ['burpee_broad_jump', 'locomotion', 'burpee_jump', 'locomotion_compound', burpeePrefs, false, 2],
  ['step_back_burpee', 'locomotion', 'burpee_jump', null, burpeePrefs, true, 3],
  ['db_farmer_carry', 'carry', 'farmer_carry', 'carry_compound', stationPrefs, false, 2],
  ['farmer_carry_weighted', 'carry', 'farmer_carry', 'carry_compound', stationPrefs, true, 2],
  ['row_erg', 'cyclical_engine', 'row_erg', 'row_interval', ergPrefs, false, 3],
  ['ski_erg', 'cyclical_engine', 'ski_erg', 'ski_interval', ergPrefs, false, 3],
  ['squat_thrust', 'cyclical_engine', 'engine', null, ['hyrox_station', 'finisher'], true, 3],
  ['bodyweight_ski_hinge', 'cyclical_engine', 'ski_erg', null, ['hyrox_station', 'finisher'], true, 3],
].map(([exercise_id, movement_pattern_primary, swap_group_id_1, swap_group_id_2, preferred_in_json, is_substitute, density_rating]) => ({
  exercise_id, name: exercise_id, movement_pattern_primary, swap_group_id_1, swap_group_id_2, preferred_in_json, is_substitute, density_rating, complexity_rank: 1,
}));
const byId = buildIndex(JSON.parse(buildCatalogJsonFromBubble(fixtures)));

for (const [slot, ids, selector, real] of [
  ['D:station_burst', ['towel_push', 'dead_tread', 'sled_push'], { mp: 'sled_push', requirePref: 'hyrox_station', prefMode: 'soft' }, ['sled_push']],
  ['D:burpee', ['step_back_burpee', 'burpee_broad_jump'], { sw: 'burpee_jump', requirePref: 'hyrox_station', prefMode: 'strict' }, ['burpee_broad_jump']],
  ['F:carry', ['farmer_carry_weighted', 'db_farmer_carry'], { sw: 'farmer_carry', requirePref: 'hyrox_station', prefMode: 'strict' }, ['db_farmer_carry']],
  ['B:station_erg', ['squat_thrust', 'bodyweight_ski_hinge', 'row_erg', 'ski_erg'], { sw: 'carry', mp: 'cyclical_engine', requirePref: 'hyrox_station', prefMode: 'strict' }, ['row_erg', 'ski_erg']],
]) {
  test(`${slot} prefers real equipment regardless of allowed-set order`, () => {
    for (const ordered of [ids, [...ids].reverse()]) {
      const ranked = rankBest(new Set(ordered), byId, { ...selector, rankValue: 0 }, null, null, null);
      assert.equal(ranked.length, ids.length);
      assert.ok(real.includes(ranked[0].ex.id));
      assert.ok(ranked[0].score > Math.max(...ranked.filter(row => row.ex.is_substitute).map(row => row.score)));
    }
  });
}
