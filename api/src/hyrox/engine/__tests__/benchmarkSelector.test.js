import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { setBenchmarkData } from "../benchmarkService.js";
import {
  confidenceLabelFromSampleSize,
  nextPerformanceBand,
  performanceBandForGoal,
  selectBenchmarkGroups,
} from "../benchmarkSelector.js";

const DATASET = "historical_hyrox_2026_06_v1";
const DEMOGRAPHIC_KEY = "hyrox:historical_hyrox_2026_06_v1:open:male:all";
const SUB_60_KEY = "hyrox:historical_hyrox_2026_06_v1:band:sub_60:open:male";
const SUB_75_KEY = "hyrox:historical_hyrox_2026_06_v1:band:sub_75:open:male";
const SUB_70_KEY = "hyrox:historical_hyrox_2026_06_v1:band:sub_70:open:male";
const DOUBLES_HISTORICAL_KEY = "hyrox:historical_hyrox_2026_06_v1:doubles:male:all";
const DOUBLES_MALE_KEY = "hyrox:doubles_v2:doubles_male:all:all";
const DOUBLES_MALE_AGE_KEY = "hyrox:doubles_v2:doubles_male:male:35-39";
const DOUBLES_MALE_THIN_AGE_KEY = "hyrox:doubles_v2:doubles_male:male:40-44";
const DOUBLES_MALE_OVER_105_KEY = "hyrox:doubles_v2:band:over_105:doubles_male:all";
const DOUBLES_MALE_SUB_105_KEY = "hyrox:doubles_v2:band:sub_105:doubles_male:all";
const DOUBLES_MIXED_KEY = "hyrox:doubles_v2:doubles_mixed:all:all";
const PRO_DOUBLES_MALE_KEY = "hyrox:doubles_v2:pro_doubles_male:all:all";
const S8_OPEN_MALE_KEY = "hyrox:singles_s8_v1:open:male:all";
const S8_OPEN_MALE_AGE_KEY = "hyrox:singles_s8_v1:open:male:35-39";
const S8_OPEN_MALE_EUROPE_KEY = "hyrox:singles_s8_v1:open:male:all:europe";

function metric(groupKey, metricKey = "total_time", sampleSize = 500) {
  return {
    groupKey,
    metricKey,
    sampleSize,
    meanSeconds: 3600,
    medianSeconds: 3600,
    p50Seconds: 3600,
    cv: 0.1,
    missingnessRate: 0,
  };
}

function seedBenchmarks() {
  setBenchmarkData({
    groups: [
      { groupKey: DEMOGRAPHIC_KEY, datasetVersion: DATASET, division: "open", gender: "male", sampleSize: 500 },
      { groupKey: SUB_60_KEY, datasetVersion: DATASET, division: "open", gender: "male", performanceBand: "sub_60", sampleSize: 500 },
      { groupKey: SUB_75_KEY, datasetVersion: DATASET, division: "open", gender: "male", performanceBand: "sub_75", sampleSize: 500 },
      { groupKey: SUB_70_KEY, datasetVersion: DATASET, division: "open", gender: "male", performanceBand: "sub_70", sampleSize: 500 },
    ],
    metrics: [
      metric(DEMOGRAPHIC_KEY),
      metric(SUB_60_KEY),
      metric(SUB_75_KEY),
      metric(SUB_70_KEY),
    ],
  });
}

function submission(finishTimeSeconds) {
  return {
    athlete: { division: "open", sex: "male" },
    race: { division: "open", finishTimeSeconds },
  };
}

beforeEach(() => {
  delete process.env.USE_DOUBLES_BENCHMARK_DATASET;
  delete process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
  delete process.env.HYROX_SINGLES_BENCHMARK_SOURCE;
  seedBenchmarks();
});

describe("performance band helpers", () => {
  it("maps finish times to achieved bands", () => {
    assert.equal(performanceBandForGoal(59 * 60 + 8), "sub_60");
    assert.equal(performanceBandForGoal(74 * 60 + 20), "sub_75");
    assert.equal(performanceBandForGoal(106 * 60), null);
    assert.equal(performanceBandForGoal(106 * 60, { includeOver105: true }), "over_105");
  });

  it("maps each band to the next faster band", () => {
    assert.equal(nextPerformanceBand("over_105"), "sub_105");
    assert.equal(nextPerformanceBand("sub_75"), "sub_70");
    assert.equal(nextPerformanceBand("sub_65"), "sub_60");
    assert.equal(nextPerformanceBand("sub_60"), null);
  });

  it("labels sample-size confidence", () => {
    assert.equal(confidenceLabelFromSampleSize(120), "strong");
    assert.equal(confidenceLabelFromSampleSize(30), "directional");
    assert.equal(confidenceLabelFromSampleSize(24), "low-confidence");
    assert.equal(confidenceLabelFromSampleSize(0), "insufficient");
  });
});

describe("selectBenchmarkGroups analyse mode", () => {
  it("uses the achieved performance band as the primary benchmark", () => {
    const result = selectBenchmarkGroups(submission(59 * 60 + 8), { calculatorMode: "analyse" });

    assert.equal(result.available, true);
    assert.equal(result.achievedBand, "sub_60");
    assert.equal(result.primaryBenchmarkGroup.key, SUB_60_KEY);
    assert.equal(result.primaryBenchmarkGroup.performanceBand, "sub_60");
    assert.equal(result.demographicBenchmarkGroup.key, DEMOGRAPHIC_KEY);
    assert.equal(result.nextBand, null);
    assert.equal(result.goalBenchmarkGroup, null);
    assert.equal(result.confidenceLabel, "strong");
  });

  it("keeps target mode on the demographic primary benchmark", () => {
    const result = selectBenchmarkGroups({
      ...submission(74 * 60 + 20),
      race: { ...submission(74 * 60 + 20).race, targetTimeSeconds: 70 * 60 },
    }, { calculatorMode: "target" });

    assert.equal(result.achievedBand, null);
    assert.equal(result.primaryBenchmarkGroup.key, DEMOGRAPHIC_KEY);
    assert.equal(result.goalBenchmarkGroup.key, SUB_70_KEY);
  });

  it("uses athleteContext targetFinishTimeSeconds when selecting the target benchmark", () => {
    const result = selectBenchmarkGroups({
      ...submission(74 * 60 + 20),
      athleteContext: { targetFinishTimeSeconds: 70 * 60 },
    }, { calculatorMode: "target" });

    assert.equal(result.primaryBenchmarkGroup.key, DEMOGRAPHIC_KEY);
    assert.equal(result.goalBenchmarkGroup.key, SUB_70_KEY);
  });

  it("records the next faster band when one exists", () => {
    const result = selectBenchmarkGroups(submission(74 * 60 + 20), { calculatorMode: "analyse" });

    assert.equal(result.achievedBand, "sub_75");
    assert.equal(result.primaryBenchmarkGroup.key, SUB_75_KEY);
    assert.equal(result.nextBand, "sub_70");
    assert.equal(result.nextBandGroup.key, SUB_70_KEY);
  });
});

describe("selectBenchmarkGroups doubles routing", () => {
  it("uses singles fallback when doubles feature flag is unset", () => {
    const result = selectBenchmarkGroups({
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.available, true);
    assert.equal(result.doublesBenchmarkedAsSingles, true);
    assert.equal(result.useDoublesBenchmarks, false);
    assert.equal(result.primaryBenchmarkGroup.key, DEMOGRAPHIC_KEY);
  });

  it("falls back to singles when flag is set but no doubles groups exist", () => {
    process.env.USE_DOUBLES_BENCHMARK_DATASET = "true";
    const result = selectBenchmarkGroups({
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.doublesBenchmarkedAsSingles, true);
    assert.equal(result.useDoublesBenchmarks, false);
    assert.equal(result.primaryBenchmarkGroup.key, DEMOGRAPHIC_KEY);
  });

  it("uses historical doubles group when flag is unset but doubles groups exist", () => {
    setBenchmarkData({
      groups: [
        { groupKey: DEMOGRAPHIC_KEY, datasetVersion: DATASET, division: "open", gender: "male", sampleSize: 500 },
        { groupKey: DOUBLES_HISTORICAL_KEY, datasetVersion: DATASET, division: "doubles", gender: "male", sampleSize: 500 },
      ],
      metrics: [
        metric(DEMOGRAPHIC_KEY),
        metric(DOUBLES_HISTORICAL_KEY),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.available, true);
    assert.equal(result.doublesBenchmarkedAsSingles, false);
    assert.equal(result.useDoublesBenchmarks, false);
    assert.equal(result.primaryBenchmarkGroup.key, DOUBLES_HISTORICAL_KEY);
  });

  it("falls back to singles when flag is unset and no doubles groups exist at all", () => {
    const result = selectBenchmarkGroups({
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.doublesBenchmarkedAsSingles, true);
    assert.equal(result.primaryBenchmarkGroup.key, DEMOGRAPHIC_KEY);
  });

  it("uses doubles benchmarks when flag is set and sample size is sufficient", () => {
    process.env.USE_DOUBLES_BENCHMARK_DATASET = "true";
    setBenchmarkData({
      groups: [
        { groupKey: DEMOGRAPHIC_KEY, datasetVersion: DATASET, division: "open", gender: "male", sampleSize: 500 },
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 150 },
      ],
      metrics: [
        metric(DEMOGRAPHIC_KEY),
        metric(DOUBLES_MALE_KEY, "total_time", 150),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.doublesBenchmarkedAsSingles, false);
    assert.equal(result.useDoublesBenchmarks, true);
    assert.equal(result.primaryBenchmarkGroup.key, DOUBLES_MALE_KEY);
  });

  it("uses enriched doubles groups when source is enriched", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
    setBenchmarkData({
      groups: [
        { groupKey: DEMOGRAPHIC_KEY, datasetVersion: DATASET, division: "open", gender: "male", sampleSize: 500 },
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 150 },
      ],
      metrics: [
        metric(DEMOGRAPHIC_KEY),
        metric(DOUBLES_MALE_KEY, "total_time", 150),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.useDoublesBenchmarks, true);
    assert.equal(result.doublesBenchmarkedAsSingles, false);
    assert.equal(result.primaryBenchmarkGroup.key, DOUBLES_MALE_KEY);
    assert.equal(result.primaryBenchmarkGroup.label, "Doubles Male");
  });

  it("passes athlete age group through for enriched doubles benchmarks", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
    setBenchmarkData({
      groups: [
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 500 },
        { groupKey: DOUBLES_MALE_AGE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "male", ageGroup: "35-39", sampleSize: 150 },
      ],
      metrics: [
        metric(DOUBLES_MALE_KEY, "total_time", 500),
        metric(DOUBLES_MALE_AGE_KEY, "total_time", 150),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "doubles", sex: "male", ageGroup: "35-39" },
      race: { division: "doubles", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.useDoublesBenchmarks, true);
    assert.equal(result.primaryBenchmarkGroup.key, DOUBLES_MALE_AGE_KEY);
    assert.equal(result.ageBenchmark.available, true);
    assert.equal(result.ageBenchmark.groupKey, DOUBLES_MALE_AGE_KEY);
  });

  it("does not expose age benchmark when age cell is below threshold", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
    setBenchmarkData({
      groups: [
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 500 },
        { groupKey: DOUBLES_MALE_THIN_AGE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "male", ageGroup: "40-44", sampleSize: 80 },
      ],
      metrics: [
        metric(DOUBLES_MALE_KEY, "total_time", 500),
        metric(DOUBLES_MALE_THIN_AGE_KEY, "total_time", 80),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "doubles", sex: "male", ageGroup: "40-44" },
      race: { division: "doubles", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.primaryBenchmarkGroup.key, DOUBLES_MALE_KEY);
    assert.equal(result.ageBenchmark.available, false);
  });

  it("uses the over-105 enriched doubles band instead of broad fallback when available", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
    setBenchmarkData({
      groups: [
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 500 },
        { groupKey: DOUBLES_MALE_OVER_105_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", performanceBand: "over_105", sampleSize: 500 },
        { groupKey: DOUBLES_MALE_SUB_105_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", performanceBand: "sub_105", sampleSize: 500 },
      ],
      metrics: [
        metric(DOUBLES_MALE_KEY, "total_time", 500),
        metric(DOUBLES_MALE_OVER_105_KEY, "total_time", 500),
        metric(DOUBLES_MALE_SUB_105_KEY, "total_time", 500),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 106 * 60 },
    }, { calculatorMode: "analyse" });

    assert.equal(result.useDoublesBenchmarks, true);
    assert.equal(result.achievedBand, "over_105");
    assert.equal(result.primaryBenchmarkGroup.key, DOUBLES_MALE_OVER_105_KEY);
    assert.equal(result.primaryBenchmarkGroup.label, "Doubles Male");
    assert.equal(result.nextBand, "sub_105");
    assert.equal(result.nextBandGroup.key, DOUBLES_MALE_SUB_105_KEY);
  });

  it("falls back to a scaled primary target profile when doubles performance bands are unavailable", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
    setBenchmarkData({
      groups: [
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 150 },
      ],
      metrics: [
        metric(DOUBLES_MALE_KEY, "total_time", 150),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 3900 },
      athleteContext: { targetFinishTimeSeconds: 55 * 60 },
    }, { calculatorMode: "target" });

    assert.equal(result.useDoublesBenchmarks, true);
    assert.equal(result.goalBenchmarkGroup.key, DOUBLES_MALE_KEY);
    assert.equal(result.goalBenchmarkGroup.targetFinishSeconds, 55 * 60);
    assert.equal(result.goalBenchmarkGroup.targetFallback, "scaled_primary_benchmark");
  });

  it("uses enriched doubles groups when source is auto and sample is sufficient", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "auto";
    setBenchmarkData({
      groups: [
        { groupKey: DEMOGRAPHIC_KEY, datasetVersion: DATASET, division: "open", gender: "male", sampleSize: 500 },
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 150 },
      ],
      metrics: [
        metric(DEMOGRAPHIC_KEY),
        metric(DOUBLES_MALE_KEY, "total_time", 150),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.useDoublesBenchmarks, true);
    assert.equal(result.doublesBenchmarkedAsSingles, false);
    assert.equal(result.primaryBenchmarkGroup.key, DOUBLES_MALE_KEY);
  });

  it("falls back to singles when source is legacy even if enriched doubles groups exist", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "legacy";
    setBenchmarkData({
      groups: [
        { groupKey: DEMOGRAPHIC_KEY, datasetVersion: DATASET, division: "open", gender: "male", sampleSize: 500 },
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 150 },
      ],
      metrics: [
        metric(DEMOGRAPHIC_KEY),
        metric(DOUBLES_MALE_KEY, "total_time", 150),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.useDoublesBenchmarks, false);
    assert.equal(result.doublesBenchmarkedAsSingles, true);
    assert.equal(result.primaryBenchmarkGroup.key, DEMOGRAPHIC_KEY);
  });

  it("maps mixed_doubles to the doubles_mixed group", () => {
    process.env.USE_DOUBLES_BENCHMARK_DATASET = "true";
    setBenchmarkData({
      groups: [
        { groupKey: DOUBLES_MIXED_KEY, datasetVersion: "doubles_v2", division: "doubles_mixed", gender: "all", ageGroup: "all", sampleSize: 180 },
      ],
      metrics: [metric(DOUBLES_MIXED_KEY, "total_time", 180)],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "mixed_doubles", sex: "female" },
      race: { division: "mixed_doubles", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.useDoublesBenchmarks, true);
    assert.equal(result.primaryBenchmarkGroup.key, DOUBLES_MIXED_KEY);
  });

  it("uses enriched pro doubles groups when the submission division is explicit", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
    setBenchmarkData({
      groups: [
        { groupKey: PRO_DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "pro_doubles_male", gender: "all", ageGroup: "all", sampleSize: 500 },
      ],
      metrics: [metric(PRO_DOUBLES_MALE_KEY, "total_time", 500)],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "pro_doubles_male", sex: "male" },
      race: { division: "pro_doubles_male", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.useDoublesBenchmarks, true);
    assert.equal(result.primaryBenchmarkGroup.key, PRO_DOUBLES_MALE_KEY);
  });

  it("leaves singles submissions unaffected when the flag is set", () => {
    process.env.USE_DOUBLES_BENCHMARK_DATASET = "true";
    const result = selectBenchmarkGroups(submission(74 * 60 + 20), { calculatorMode: "target" });

    assert.equal(result.doublesBenchmarkedAsSingles, false);
    assert.equal(result.useDoublesBenchmarks, false);
    assert.equal(result.primaryBenchmarkGroup.key, DEMOGRAPHIC_KEY);
  });

  it("uses singles S8 benchmarks by default when available", () => {
    setBenchmarkData({
      groups: [
        { groupKey: DEMOGRAPHIC_KEY, datasetVersion: DATASET, division: "open", gender: "male", ageGroup: "all", sampleSize: 500 },
        { groupKey: S8_OPEN_MALE_KEY, datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "all", sampleSize: 500 },
      ],
      metrics: [
        metric(DEMOGRAPHIC_KEY),
        metric(S8_OPEN_MALE_KEY, "total_time", 500),
      ],
    });

    const result = selectBenchmarkGroups(submission(74 * 60 + 20), { calculatorMode: "target" });

    assert.equal(result.primaryBenchmarkGroup.key, S8_OPEN_MALE_KEY);
    assert.equal(result.fallbacksUsed.some((fallback) => fallback.reason === "singles_s8_unavailable_using_legacy"), false);
  });

  it("falls back to legacy singles benchmarks when S8 is unavailable", () => {
    const result = selectBenchmarkGroups(submission(74 * 60 + 20), { calculatorMode: "target" });

    assert.equal(result.primaryBenchmarkGroup.key, DEMOGRAPHIC_KEY);
    assert.equal(result.fallbacksUsed.some((fallback) => fallback.reason === "singles_s8_unavailable_using_legacy"), true);
  });

  it("exposes singles age benchmark availability when the S8 age cell exists", () => {
    setBenchmarkData({
      groups: [
        { groupKey: S8_OPEN_MALE_KEY, datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "all", sampleSize: 500 },
        { groupKey: S8_OPEN_MALE_AGE_KEY, datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "35-39", sampleSize: 120 },
      ],
      metrics: [
        metric(S8_OPEN_MALE_KEY, "total_time", 500),
        metric(S8_OPEN_MALE_AGE_KEY, "total_time", 120),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "open", sex: "male", ageGroup: "35-39" },
      race: { division: "open", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.primaryBenchmarkGroup.key, S8_OPEN_MALE_AGE_KEY);
    assert.equal(result.ageBenchmark.available, true);
    assert.equal(result.ageBenchmark.groupKey, S8_OPEN_MALE_AGE_KEY);
  });

  it("does not expose regional benchmark availability when event country is absent", () => {
    setBenchmarkData({
      groups: [
        { groupKey: S8_OPEN_MALE_KEY, datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "all", sampleSize: 500 },
      ],
      metrics: [
        metric(S8_OPEN_MALE_KEY, "total_time", 500),
      ],
    });

    const result = selectBenchmarkGroups(submission(74 * 60 + 20), { calculatorMode: "target" });

    assert.equal(result.regionalBenchmark.available, false);
  });

  it("exposes regional benchmark availability when the event country maps to a populated region", () => {
    setBenchmarkData({
      groups: [
        { groupKey: S8_OPEN_MALE_KEY, datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "all", sampleSize: 500 },
        { groupKey: S8_OPEN_MALE_EUROPE_KEY, datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "all", region: "europe", sampleSize: 250 },
      ],
      metrics: [
        metric(S8_OPEN_MALE_KEY, "total_time", 500),
        metric(S8_OPEN_MALE_EUROPE_KEY, "total_time", 250),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "open", sex: "male" },
      race: { division: "open", finishTimeSeconds: 3900, eventCountry: "GBR" },
    }, { calculatorMode: "target" });

    assert.equal(result.regionalBenchmark.available, true);
    assert.equal(result.regionalBenchmark.region, "europe");
    assert.equal(result.regionalBenchmark.regionLabel, "Europe");
    assert.equal(result.regionalBenchmark.groupKey, S8_OPEN_MALE_EUROPE_KEY);
    assert.equal(typeof result.regionalBenchmark.fieldPercentile, "number");
  });

  it("does not expose regional benchmark availability when the mapped region has no group", () => {
    setBenchmarkData({
      groups: [
        { groupKey: S8_OPEN_MALE_KEY, datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "all", sampleSize: 500 },
      ],
      metrics: [
        metric(S8_OPEN_MALE_KEY, "total_time", 500),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "open", sex: "male" },
      race: { division: "open", finishTimeSeconds: 3900, eventCountry: "SGP" },
    }, { calculatorMode: "target" });

    assert.equal(result.regionalBenchmark.available, false);
  });

  // B-7: "mixed" is an alias for doubles_mixed
  it("B-7: maps division 'mixed' to the doubles_mixed benchmark group", () => {
    process.env.USE_DOUBLES_BENCHMARK_DATASET = "true";
    setBenchmarkData({
      groups: [
        { groupKey: DOUBLES_MIXED_KEY, datasetVersion: "doubles_v2", division: "doubles_mixed", gender: "all", ageGroup: "all", sampleSize: 180 },
      ],
      metrics: [metric(DOUBLES_MIXED_KEY, "total_time", 180)],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "mixed", sex: "female" },
      race: { division: "mixed", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.useDoublesBenchmarks, true);
    assert.equal(result.primaryBenchmarkGroup.key, DOUBLES_MIXED_KEY);
  });

  it("B-7 regression: division 'doubles_male' is not affected by the mixed alias fix", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
    setBenchmarkData({
      groups: [
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 150 },
        { groupKey: DOUBLES_MIXED_KEY, datasetVersion: "doubles_v2", division: "doubles_mixed", gender: "all", ageGroup: "all", sampleSize: 180 },
      ],
      metrics: [
        metric(DOUBLES_MALE_KEY, "total_time", 150),
        metric(DOUBLES_MIXED_KEY, "total_time", 180),
      ],
    });

    const result = selectBenchmarkGroups({
      athlete: { division: "doubles_male", sex: "male" },
      race: { division: "doubles_male", finishTimeSeconds: 3900 },
    }, { calculatorMode: "target" });

    assert.equal(result.useDoublesBenchmarks, true);
    assert.equal(result.primaryBenchmarkGroup.key, DOUBLES_MALE_KEY);
    assert.ok(result.primaryBenchmarkGroup.key !== DOUBLES_MIXED_KEY, "doubles_male should not be routed to doubles_mixed");
  });
});
