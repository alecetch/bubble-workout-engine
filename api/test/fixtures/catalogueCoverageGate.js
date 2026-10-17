// Later catalogue specs remove KNOWN_EMPTY entries when they fill slots and add
// MIN_COUNTS entries for the slots they improve.
const emptySlots = [];
// No slot is known-empty after the bodyweight engine and core expansion.
export const KNOWN_EMPTY = emptySlots.flatMap(parts =>
  [0, 1, 2, 3].map(rank => [...parts, 'no_equipment', rank].join('|')));

export const MIN_COUNTS = [
  ...[
    ['pull_day', 'A:pull_horizontal', 10, 'Band and TRX rows expand horizontal pulling'],
    ['pull_day', 'D:biceps', 12, 'Band and TRX curls expand Minimal arm choices'],
    ['push_day', 'D:triceps', 6, 'Band pushdowns expand Minimal triceps choices'],
    ['push_day', 'B:push_vertical', 4, 'Band overhead presses expand Minimal pressing'],
    ['pull_day', 'B:pull_vertical', 2, 'Anchored band pulldowns add a Minimal vertical pull'],
  ].map(([day_key, slot, min, reason]) => ({
    config_key: 'hypertrophy_default_v1', day_key, slot, preset: 'minimal_equipment', rank: 0, min, reason,
  })),
  ...[
    ['push_day', 'D:triceps', 'no_equipment', [0], 3, 'Bodyweight triceps staples'],
    ['pull_day', 'D:biceps', 'no_equipment', [0], 7, 'Towel curl adds a real bodyweight biceps option'],
    ['legs_day', 'C:hamstring_iso', 'no_equipment', [0, 1, 2, 3], 2, 'Towel curl expands hamstring isolation'],
    ['day3', 'C:glute', 'no_equipment', [0], 2, 'Glute Bridge adds a bilateral regression'],
    ['pull_day', 'B:pull_vertical', 'decent_home_gym', [0], 4, 'Beginner pull-up progressions'],
  ].flatMap(([day_key, slot, preset, ranks, min, reason]) => ranks.map(rank => ({
    config_key: 'hypertrophy_default_v1', day_key, slot, preset, rank, min, reason,
  }))),
  ...[
    ['conditioning_default_v1', 'day1', 'A:engine', 5, 'Bodyweight engine options cover conditioning days'],
    ['conditioning_default_v1', 'day2', 'B:engine', 5, 'Bodyweight engine options cover conditioning days'],
    ['conditioning_default_v1', 'day3', 'A:engine', 5, 'Bodyweight engine options cover conditioning days'],
    ['hypertrophy_default_v1', 'day1', 'D:core', 4, 'Expanded bodyweight core options'],
    ['hypertrophy_default_v1', 'day3', 'D:core', 4, 'Expanded bodyweight core options'],
    ['strength_default_v1', 'day1', 'D:core_strength', 4, 'Expanded bodyweight core options'],
    ['strength_default_v1', 'day2', 'D:core_upper_strength', 4, 'Expanded bodyweight core options'],
    ['strength_default_v1', 'day3', 'D:core_posterior_strength', 4, 'Expanded bodyweight core options'],
    ['hyrox_default_v1', 'engine_day', 'B:station_erg', 2, 'Two bodyweight engine moves carry hyrox_station'],
    ['hyrox_default_v1', 'hyrox_simulation', 'A:ski_1', 1, 'Bodyweight Ski Hinge fills the strict ski slot'],
  ].flatMap(([config_key, day_key, slot, min, reason]) => [0, 1, 2, 3].map(rank => ({
    config_key, day_key, slot, preset: 'no_equipment', rank, min, reason,
  }))),
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
