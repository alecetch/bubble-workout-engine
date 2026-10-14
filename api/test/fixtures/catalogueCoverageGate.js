// Later catalogue specs remove KNOWN_EMPTY entries when they fill slots and add
// MIN_COUNTS entries for the slots they improve.
const emptySlots = [
  ['conditioning_default_v1', 'day1', 'A:engine'],
  ['conditioning_default_v1', 'day2', 'B:engine'],
  ['conditioning_default_v1', 'day3', 'A:engine'],
  ['hyrox_default_v1', 'engine_day', 'B:station_erg'],
  ['hyrox_default_v1', 'engine_day', 'C:_ski_buy_in'],
  ['hyrox_default_v1', 'power_day', 'D:station_erg'],
  ['hyrox_default_v1', 'endurance_day', 'A:station_erg'],
  ['hyrox_default_v1', 'hyrox_simulation', 'A:ski_1'],
];
// Owned by catalogue-bodyweight-engine-and-core — remove when that spec lands.
export const KNOWN_EMPTY = emptySlots.flatMap(parts =>
  [0, 1, 2, 3].map(rank => [...parts, 'no_equipment', rank].join('|')));

export const MIN_COUNTS = [
  ...[
    ['hypertrophy_default_v1', 'pull_day', 'B:pull_vertical', 'no_equipment', 1, 'Prone Lat Pulldown replaces Table Row'],
    ['hyrox_default_v1', 'hyrox_simulation', 'C:sled_pull', 'no_equipment', 1, 'Backward Bear Crawl replaces Wheelbarrow Pull'],
    ['hyrox_default_v1', 'hyrox_simulation', 'F:carry', 'no_equipment', 1, 'Household Load Carry kept'],
    ['hyrox_default_v1', 'hyrox_simulation', 'C:sled_pull', 'decent_home_gym', 2, 'Sandbag Backward Drag'],
    ['hyrox_default_v1', 'hyrox_simulation', 'E:row', 'minimal_equipment', 2, 'Band Rowing Stroke'],
  ].map(([config_key, day_key, slot, preset, min, reason]) => ({
    config_key, day_key, slot, preset, rank: 0, min, reason,
  })),
  ...[
    ['hypertrophy_default_v1', 'day3', 'C:hamstring_iso', 3],
    ['hypertrophy_default_v1', 'legs_day', 'C:hamstring_iso', 3],
    ['hypertrophy_default_v1', 'pull_day', 'B:pull_vertical', 3],
    ['hypertrophy_default_v1', 'legs_day', 'D:calves', 4],
    ['hypertrophy_default_v1', 'push_day', 'D:triceps', 8],
    ['strength_default_v1', 'day1', 'C:hamstring_iso_strength', 3],
    ['strength_default_v1', 'day2', 'C:pull_vertical_strength', 3],
  ].map(([config_key, day_key, slot, min]) => ({
    config_key, day_key, slot, preset: 'commercial_gym', rank: 0, min,
    reason: 'Machines are rank 0',
  })),
  ...['B:sled_push', 'C:sled_pull', 'H:wall_ball', 'E:row'].map(slot => ({
    config_key: 'hyrox_default_v1', day_key: 'hyrox_simulation', slot,
    preset: 'crossfit_hyrox_gym', rank: 0, min: 2,
    reason: 'HYROX race stations are rank 0',
  })),
];
