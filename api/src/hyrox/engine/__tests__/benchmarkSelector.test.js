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
const DOUBLES_MALE_KEY = "hyrox:doubles_v1:doubles_male:all:all";
const DOUBLES_MIXED_KEY = "hyrox:doubles_v1:doubles_mixed:all:all";
const PRO_DOUBLES_MALE_KEY = "hyrox:doubles_v1:pro_doubles_male:all:all";

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
  seedBenchmarks();
});

describe("performance band helpers", () => {
  it("maps finish times to achieved bands", () => {
    assert.equal(performanceBandForGoal(59 * 60 + 8), "sub_60");
    assert.equal(performanceBandForGoal(74 * 60 + 20), "sub_75");
    assert.equal(performanceBandForGoal(106 * 60), null);
  });

  it("maps each band to the next faster band", () => {
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
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v1", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 150 },
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
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v1", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 150 },
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

  it("uses enriched doubles groups when source is auto and sample is sufficient", () => {
    process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "auto";
    setBenchmarkData({
      groups: [
        { groupKey: DEMOGRAPHIC_KEY, datasetVersion: DATASET, division: "open", gender: "male", sampleSize: 500 },
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v1", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 150 },
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
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v1", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 150 },
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
        { groupKey: DOUBLES_MIXED_KEY, datasetVersion: "doubles_v1", division: "doubles_mixed", gender: "all", ageGroup: "all", sampleSize: 180 },
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
        { groupKey: PRO_DOUBLES_MALE_KEY, datasetVersion: "doubles_v1", division: "pro_doubles_male", gender: "all", ageGroup: "all", sampleSize: 500 },
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
});
