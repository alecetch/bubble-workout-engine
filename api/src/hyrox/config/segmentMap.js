export const SEGMENT_MAP = Object.freeze([
  { rawField: "run_1", segmentKey: "run_1", type: "run", displayName: "Run 1", raceOrder: 1 },
  { rawField: "work_1", segmentKey: "ski_erg", type: "station", displayName: "SkiErg", raceOrder: 2 },
  { rawField: "roxzone_1", segmentKey: "roxzone_1", type: "roxzone", displayName: "Roxzone 1", raceOrder: null },
  { rawField: "run_2", segmentKey: "run_2", type: "run", displayName: "Run 2", raceOrder: 3 },
  { rawField: "work_2", segmentKey: "sled_push", type: "station", displayName: "Sled Push", raceOrder: 4 },
  { rawField: "roxzone_2", segmentKey: "roxzone_2", type: "roxzone", displayName: "Roxzone 2", raceOrder: null },
  { rawField: "run_3", segmentKey: "run_3", type: "run", displayName: "Run 3", raceOrder: 5 },
  { rawField: "work_3", segmentKey: "sled_pull", type: "station", displayName: "Sled Pull", raceOrder: 6 },
  { rawField: "roxzone_3", segmentKey: "roxzone_3", type: "roxzone", displayName: "Roxzone 3", raceOrder: null },
  { rawField: "run_4", segmentKey: "run_4", type: "run", displayName: "Run 4", raceOrder: 7 },
  { rawField: "work_4", segmentKey: "burpee_broad_jump", type: "station", displayName: "Burpee Broad Jump", raceOrder: 8 },
  { rawField: "roxzone_4", segmentKey: "roxzone_4", type: "roxzone", displayName: "Roxzone 4", raceOrder: null },
  { rawField: "run_5", segmentKey: "run_5", type: "run", displayName: "Run 5", raceOrder: 9 },
  { rawField: "work_5", segmentKey: "row", type: "station", displayName: "Row", raceOrder: 10 },
  { rawField: "roxzone_5", segmentKey: "roxzone_5", type: "roxzone", displayName: "Roxzone 5", raceOrder: null },
  { rawField: "run_6", segmentKey: "run_6", type: "run", displayName: "Run 6", raceOrder: 11 },
  { rawField: "work_6", segmentKey: "farmers_carry", type: "station", displayName: "Farmers Carry", raceOrder: 12 },
  { rawField: "roxzone_6", segmentKey: "roxzone_6", type: "roxzone", displayName: "Roxzone 6", raceOrder: null },
  { rawField: "run_7", segmentKey: "run_7", type: "run", displayName: "Run 7", raceOrder: 13 },
  { rawField: "work_7", segmentKey: "sandbag_lunges", type: "station", displayName: "Sandbag Lunges", raceOrder: 14 },
  { rawField: "roxzone_7", segmentKey: "roxzone_7", type: "roxzone", displayName: "Roxzone 7", raceOrder: null },
  { rawField: "run_8", segmentKey: "run_8", type: "run", displayName: "Run 8", raceOrder: 15 },
  { rawField: "work_8", segmentKey: "wall_balls", type: "station", displayName: "Wall Balls", raceOrder: 16 },
  { rawField: "roxzone_8", segmentKey: "roxzone_8", type: "roxzone", displayName: "Roxzone 8", raceOrder: null },
]);

export const STATION_KEYS = Object.freeze(SEGMENT_MAP.filter((s) => s.type === "station").map((s) => s.segmentKey));
export const RUN_KEYS = Object.freeze(SEGMENT_MAP.filter((s) => s.type === "run").map((s) => s.segmentKey));
export const ROXZONE_KEYS = Object.freeze(SEGMENT_MAP.filter((s) => s.type === "roxzone").map((s) => s.segmentKey));
