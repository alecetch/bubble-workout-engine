export const SCORING_WEIGHTS = Object.freeze({
  engine: Object.freeze([
    { metricKey: "run_time", weight: 0.6 },
    { metricKey: "ski_erg", weight: 0.2 },
    { metricKey: "row", weight: 0.2 },
  ]),
  strength: Object.freeze([
    { metricKey: "sled_push", weight: 0.25 },
    { metricKey: "sled_pull", weight: 0.25 },
    { metricKey: "farmers_carry", weight: 0.2 },
    { metricKey: "sandbag_lunges", weight: 0.3 },
  ]),
  bodyweightGrit: Object.freeze([
    { metricKey: "burpee_broad_jump", weight: 0.4 },
    { metricKey: "wall_balls", weight: 0.4 },
    { metricKey: "sandbag_lunges", weight: 0.2 },
  ]),
  execution: Object.freeze([
    { metricKey: "roxzone_time", weight: 0.5 },
    { metricKey: "run_fade", weight: 0.3 },
    { metricKey: "station_consistency", weight: 0.2 },
  ]),
  raceEfficiency: Object.freeze({
    engineScore: 0.25,
    strengthScore: 0.25,
    bodyweightGritScore: 0.2,
    executionScore: 0.2,
    hybridBalanceScore: 0.1,
  }),
});
