import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { STATION_KEYS } from "../../config/segmentMap.js";
import { setBenchmarkData } from "../../engine/benchmarkService.js";
import { generatePopulationInsights, rankStationGaps } from "../populationInsights.js";

const GROUP_KEY = "hyrox:historical_hyrox_2026_06_v1:open:male:all";
const INSIGHT_DEF = { id: "INSIGHT_046", enabled: true };

function stationMetric(segmentKey, gapSeconds, overrides = {}) {
  return {
    groupKey: GROUP_KEY,
    metricKey: segmentKey,
    sampleSize: 2500,
    medianSeconds: 300,
    p25Seconds: 300 - gapSeconds,
    p50Seconds: 300,
    cv: 0.05,
    missingnessRate: 0,
    ...overrides,
  };
}

function loadStationGapFixture(metricOverrides = {}) {
  setBenchmarkData({
    groups: [{ groupKey: GROUP_KEY, sampleSize: metricOverrides.sampleSize ?? 2500 }],
    metrics: STATION_KEYS.map((key) => stationMetric(
      key,
      key === "row" ? 80 : key === "wall_balls" ? 70 : key === "sled_push" ? 10 : key === "sled_pull" ? 10 : 30,
      metricOverrides,
    )),
  });
}

describe("populationInsights confidence grading", () => {
  beforeEach(() => {
    setBenchmarkData({ groups: [], metrics: [] });
  });

  it("does not self-certify grade A from sample size when variance is poor", () => {
    loadStationGapFixture({ sampleSize: 1200, cv: 0.45, missingnessRate: 0 });

    const rankings = rankStationGaps(GROUP_KEY);
    const wall = rankings.find((row) => row.segmentKey === "wall_balls");
    const insights = generatePopulationInsights(GROUP_KEY, INSIGHT_DEF);

    assert.ok(wall, "expected Wall Balls ranking");
    assert.notEqual(wall.confidenceGrade, "A");
    assert.equal(insights.length, 0);
  });

  it("emits grade A evidence when the cohort genuinely earns it", () => {
    loadStationGapFixture({ sampleSize: 2500, cv: 0.05, missingnessRate: 0 });

    const insights = generatePopulationInsights(GROUP_KEY, INSIGHT_DEF);

    assert.equal(insights.length, 1);
    assert.equal(insights[0].evidenceValues.confidenceGrade, "A");
    assert.equal(insights[0].evidenceValues.sampleSize, 2500);
  });
});
