import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeBenchmarkGroupKey } from "../../confidence/fallbackRules.js";
import { buildGroups, groupKey, isBenchmarkSourceRowEligible } from "../buildSinglesS8Benchmarks.js";

function adaptedRecord(sourceDivision, performanceBand = "sub_75", ageGroup = "35-39") {
  return {
    _division: sourceDivision,
    _performanceBand: performanceBand,
    _ageGroup: ageGroup,
    _region: null,
    total_time_seconds: 4300,
    run_time_seconds: 2300,
    work_time_seconds: 1700,
    roxzone_time_seconds: 300,
    segments: {},
  };
}

function records(count, sourceDivision, performanceBand = "sub_75", ageGroup = "35-39") {
  return Array.from({ length: count }, () => adaptedRecord(sourceDivision, performanceBand, ageGroup));
}

describe("buildSinglesS8Benchmarks buildGroups", () => {
  it("creates open and pro groups using engine division plus gender", () => {
    const groups = buildGroups([
      ...records(100, "open_male"),
      ...records(100, "pro_female"),
    ]);

    assert.equal(groups.find((group) => group.groupKey === "hyrox:singles_s8_v1:open:male:all")?.sampleSize, 100);
    assert.equal(groups.find((group) => group.groupKey === "hyrox:singles_s8_v1:pro:female:all")?.sampleSize, 100);
    assert.equal(groups.some((group) => group.division === "open_male"), false);
  });

  it("creates division-level all-gender groups", () => {
    const groups = buildGroups([
      ...records(60, "open_male"),
      ...records(60, "open_female"),
    ]);

    assert.equal(groups.find((group) => group.groupKey === "hyrox:singles_s8_v1:open:all:all")?.sampleSize, 120);
  });

  it("creates performance-band groups with gender dimension", () => {
    const groups = buildGroups(records(100, "open_male", "sub_70"));
    const band = groups.find((group) => group.groupKey === "hyrox:singles_s8_v1:band:sub_70:open:male");

    assert.equal(band?.sampleSize, 100);
    assert.equal(band?.performanceBand, "sub_70");
  });

  it("creates age groups only when whitelisted and sufficiently sampled", () => {
    const groups = buildGroups([
      ...records(50, "open_male", "sub_75", "35-39"),
      ...records(100, "open_female", "sub_75", "30-39"),
      ...records(49, "pro_male", "sub_75", "40-44"),
    ]);

    assert.equal(groups.find((group) => group.groupKey === "hyrox:singles_s8_v1:open:male:35-39")?.sampleSize, 50);
    assert.equal(groups.some((group) => group.ageGroup === "30-39"), false);
    assert.equal(groups.find((group) => group.groupKey === "hyrox:singles_s8_v1:pro:male:40-44"), undefined);
  });

  it("creates regional groups when the regional sample is sufficient", () => {
    const europeRows = records(200, "open_male").map((record) => ({ ...record, _region: "europe" }));
    const groups = buildGroups(europeRows);
    const regional = groups.find((group) => group.groupKey === "hyrox:singles_s8_v1:open:male:all:europe");

    assert.equal(regional?.sampleSize, 200);
    assert.equal(regional?.region, "europe");
    assert.equal(regional?.gender, "male");
  });

  it("does not create regional groups below the regional sample threshold", () => {
    const europeRows = records(199, "open_male").map((record) => ({ ...record, _region: "europe" }));
    const groups = buildGroups(europeRows);
    assert.equal(groups.find((group) => group.groupKey === "hyrox:singles_s8_v1:open:male:all:europe"), undefined);
  });
});

describe("buildSinglesS8Benchmarks keys and cleaning", () => {
  it("matches fallbackRules key format", () => {
    const expected = makeBenchmarkGroupKey({ datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "35-39" });
    assert.equal(groupKey("open", null, "male", "35-39"), expected);
    assert.equal(groupKey("open", null, "male", "all", "europe"), makeBenchmarkGroupKey({ datasetVersion: "singles_s8_v1", division: "open", gender: "male", ageGroup: "all", region: "europe" }));
    assert.equal(groupKey("open", "sub_75", "male"), "hyrox:singles_s8_v1:band:sub_75:open:male");
  });

  it("rejects out-of-range and test source rows", () => {
    const base = { overall_time_seconds: 4300, athlete_1_name: "Example" };
    assert.equal(isBenchmarkSourceRowEligible(base), true);
    assert.equal(isBenchmarkSourceRowEligible({ ...base, overall_time_seconds: 2699 }), false);
    assert.equal(isBenchmarkSourceRowEligible({ ...base, overall_time_seconds: 28801 }), false);
    assert.equal(isBenchmarkSourceRowEligible({ ...base, athlete_1_name: "test athlete" }), false);
  });
});
