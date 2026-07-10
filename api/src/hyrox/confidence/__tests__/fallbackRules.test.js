import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFallbackChain, makeBenchmarkGroupKey } from "../fallbackRules.js";

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

  it("keeps the no-region chain unchanged", () => {
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
        ["hyrox:singles_s8_v1:open:male:broad_40_49", 1, "adjacent_age_band"],
        ["hyrox:singles_s8_v1:open:male:all", 2, "sex_division"],
        ["hyrox:singles_s8_v1:open:all:all", 3, "division_only"],
        ["hyrox:singles_s8_v1:all:all:all", 4, "population"],
      ],
    );
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
