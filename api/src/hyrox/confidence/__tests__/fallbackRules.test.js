import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INDIVIDUAL_ANALYSIS_DIVISIONS } from "../../config/divisionGroups.js";
import { setBenchmarkData } from "../../engine/benchmarkService.js";
import { selectBenchmark } from "../benchmarkSelector.js";
import { buildFallbackChain, isIndividualDivision, makeBenchmarkGroupKey } from "../fallbackRules.js";

describe("makeBenchmarkGroupKey", () => {
  it("appends region to non-performance group keys", () => {
    assert.equal(
      makeBenchmarkGroupKey({ datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "all", region: "europe" }),
      "hyrox:singles_s8_v1:open:male:all:europe",
    );
  });

  it("does not append region to performance-band keys", () => {
    assert.equal(
      makeBenchmarkGroupKey({ datasetVersion: "singles_s8_v1", division: "open", gender: "male", performanceBand: "sub_75", region: "europe" }),
      "hyrox:singles_s8_v1:band:sub_75:open:male",
    );
  });
});

describe("buildFallbackChain regional matching", () => {
  it("starts with a regional exact candidate when region is provided", () => {
    const chain = buildFallbackChain({
      datasetVersion: "singles_s8_v1",
      division: "open",
      gender: "male",
      ageGroup: "35-39",
      region: "europe",
    });

    assert.equal(chain[0].groupKey, "hyrox:singles_s8_v1:open:male:35-39:europe");
    assert.equal(chain[0].matchType, "exact_regional");
    assert.equal(chain.some((candidate) => candidate.groupKey === "hyrox:singles_s8_v1:open:male:all:europe"), true);
  });

  it("uses granular neighboring age bands for singles S8 fallback chains", () => {
    const chain = buildFallbackChain({
      datasetVersion: "singles_s8_v1",
      division: "open",
      gender: "male",
      ageGroup: "35-39",
    });

    assert.deepEqual(
      chain.map((candidate) => [candidate.groupKey, candidate.level, candidate.matchType]),
      [
        ["hyrox:singles_s8_v1:open:male:35-39", 0, "exact"],
        ["hyrox:singles_s8_v1:open:male:30-34", 1, "adjacent_age_band"],
        ["hyrox:singles_s8_v1:open:male:40-44", 1, "adjacent_age_band"],
        ["hyrox:singles_s8_v1:open:male:all", 2, "sex_division"],
        ["hyrox:singles_s8_v1:open:all:all", 3, "division_only"],
        ["hyrox:singles_s8_v1:all:all:all", 4, "population"],
      ],
    );
  });

  it("keeps legacy historical adjacent-age fallback buckets", () => {
    const chain = buildFallbackChain({
      datasetVersion: "historical_hyrox_2026_06_v1",
      division: "open",
      gender: "male",
      ageGroup: "35-39",
    });

    assert.equal(
      chain.some((candidate) => candidate.groupKey === "hyrox:historical_hyrox_2026_06_v1:open:male:broad_40_49"),
      true,
    );
  });

  it("selects a real granular adjacent age group when the exact S8 group is too thin", () => {
    const exactKey = makeBenchmarkGroupKey({ datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "65-69" });
    const adjacentKey = makeBenchmarkGroupKey({ datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "60-64" });
    const allKey = makeBenchmarkGroupKey({ datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "all" });
    const metric = (groupKey, sampleSize) => ({
      groupKey,
      metricKey: "total_time",
      sampleSize,
      meanSeconds: 3600,
      medianSeconds: 3600,
      p50Seconds: 3600,
      cv: 0.1,
      missingnessRate: 0,
    });
    setBenchmarkData({
      groups: [
        { groupKey: exactKey, datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "65-69", sampleSize: 50 },
        { groupKey: adjacentKey, datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "60-64", sampleSize: 200 },
        { groupKey: allKey, datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "all", sampleSize: 500 },
      ],
      metrics: [
        metric(exactKey, 50),
        metric(adjacentKey, 200),
        metric(allKey, 500),
      ],
    });

    const selection = selectBenchmark(
      { datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "65-69" },
      "total_time",
      "overallPercentile",
    );

    assert.equal(selection.suppressed, false);
    assert.equal(selection.benchmarkUsed, adjacentKey);
    assert.equal(selection.group.ageGroup, "60-64");
  });

  it("deduplicates region chains when age group is absent", () => {
    const chain = buildFallbackChain({
      datasetVersion: "singles_s8_v1",
      division: "open",
      gender: "male",
      region: "europe",
    });
    const keys = chain.map((candidate) => candidate.groupKey);
    assert.equal(keys.length, new Set(keys).size);
    assert.equal(keys[0], "hyrox:singles_s8_v1:open:male:all:europe");
  });
});

describe("isIndividualDivision", () => {
  it("accepts every shared individual analysis division and mixed doubles aliases", () => {
    for (const division of INDIVIDUAL_ANALYSIS_DIVISIONS) {
      assert.equal(isIndividualDivision(division), true);
    }
    assert.equal(isIndividualDivision("mixed_doubles"), true);
    assert.equal(isIndividualDivision("mixed"), true);
  });
});
