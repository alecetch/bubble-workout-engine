export const BENCHMARK_THRESHOLDS = Object.freeze({
  limiterTieSeconds: 15,
  strengthMinimumAdvantageSeconds: 10,
  wallBallBottleneckGapSeconds: 45,
  eliteOverallPercentile: 85,
  eliteMaxStationGapSeconds: 30,
});

export const PERFORMANCE_BAND_THRESHOLDS_MINUTES = Object.freeze([
  60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 120,
]);

export const PERFORMANCE_BAND_KEYS = Object.freeze(
  PERFORMANCE_BAND_THRESHOLDS_MINUTES.map((threshold) => `sub_${threshold}`),
);

export const PERFORMANCE_BAND_KEYS_WITH_OVER_120 = Object.freeze([
  ...PERFORMANCE_BAND_KEYS,
  "over_120",
]);

export const HYROX_ANALYSIS_VERSION = "hyrox_engine_v1.0.0";
export const DEFAULT_DATASET_VERSION = "historical_hyrox_2026_06_v1";
