import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeBenchmarkGroupKey } from "../../confidence/fallbackRules.js";
import { adaptEnrichedRow, buildGroups, groupKey, isBenchmarkSourceRowEligible, performanceBandForSeconds } from "../buildDoublesBenchmarks.js";

function row(overrides = {}) {
  return {
    division_category: "doubles_male",
    age_group: "35-39",
    event_country: "GBR",
    athlete_1_name: "Example",
    overall_time_seconds: 5000,
    run_total_seconds: 2400,
    station_total_seconds: 2100,
    roxzone_total_seconds: 500,
    split_coverage_score: 1,
    split_run_1: 301,
    split_run_2: 302,
    split_run_3: 303,
    split_run_4: 304,
    split_run_5: 305,
    split_run_6: 306,
    split_run_7: 307,
    split_run_8: 308,
    split_skierg: 250,
    split_sled_push: 310,
    split_sled_pull: 320,
    split_burpee_bj: 330,
    split_row: 340,
    split_farmers_carry: 350,
    split_sandbag_lunge: 360,
    split_wall_balls: 370,
    rox_skierg_in: 10,
    rox_skierg_out: 11,
    rox_sled_push_in: 12,
    rox_sled_push_out: 13,
    rox_sled_pull_in: 14,
    rox_sled_pull_out: 15,
    rox_burpee_bj_in: 16,
    rox_burpee_bj_out: 17,
    rox_row_in: 18,
    rox_row_out: 19,
    rox_farmers_carry_in: 20,
    rox_farmers_carry_out: 21,
    rox_sandbag_lunge_in: 22,
    rox_sandbag_lunge_out: 23,
    ...overrides,
  };
}

describe("adaptEnrichedRow", () => {
  it("maps all top-level time fields", () => {
    const adapted = adaptEnrichedRow(row());
    assert.equal(adapted.total_time_seconds, 5000);
    assert.equal(adapted._performanceBand, "sub_90");
    assert.equal(adapted._region, "europe");
    assert.equal(adapted.run_time_seconds, 2400);
    assert.equal(adapted.work_time_seconds, 2100);
    assert.equal(adapted.roxzone_time_seconds, 500);
  });

  it("maps station splits to the correct segment key names", () => {
    const adapted = adaptEnrichedRow(row());
    assert.equal(adapted.segments.ski_erg.seconds, 250);
    assert.equal(adapted.segments.burpee_broad_jump.seconds, 330);
    assert.equal(adapted.segments.sandbag_lunges.seconds, 360);
  });

  it("sums roxzone in/out for each roxzone segment", () => {
    const adapted = adaptEnrichedRow(row());
    assert.equal(adapted.segments.roxzone_1.seconds, 21);
    assert.equal(adapted.segments.roxzone_4.seconds, 33);
    assert.equal(adapted.segments.roxzone_7.seconds, 45);
  });

  it("returns null for roxzone segment when either in or out is null", () => {
    const adapted = adaptEnrichedRow(row({ rox_row_out: null }));
    assert.equal(adapted.segments.roxzone_5.seconds, null);
  });

  it("returns null for roxzone_8 because it is not captured in enriched data", () => {
    const adapted = adaptEnrichedRow(row());
    assert.equal(adapted.segments.roxzone_8.seconds, null);
  });

  it("includes all 8 run splits", () => {
    const adapted = adaptEnrichedRow(row());
    for (let i = 1; i <= 8; i += 1) {
      assert.equal(adapted.segments[`run_${i}`].seconds, 300 + i);
    }
  });

  it("sets segment-level values to null for low-coverage rows while keeping top-level metrics", () => {
    const adapted = adaptEnrichedRow(row({ split_coverage_score: 0.5 }));
    assert.equal(adapted.total_time_seconds, 5000);
    assert.equal(adapted.run_time_seconds, 2400);
    assert.equal(adapted.segments.run_1.seconds, null);
    assert.equal(adapted.segments.ski_erg.seconds, null);
    assert.equal(adapted.segments.roxzone_1.seconds, null);
  });

  it("removes unsafe run totals from partial run rows", () => {
    const adapted = adaptEnrichedRow(row({
      run_total_seconds: 379,
      split_run_1: 379,
      split_run_2: null,
      split_run_3: null,
      split_run_4: null,
      split_run_5: null,
      split_run_6: null,
      split_run_7: null,
      split_run_8: null,
      data_quality_flags: ["incomplete_run_splits", "missing_run_total"],
    }));

    assert.equal(adapted.run_time_seconds, null);
  });
});

describe("performanceBandForSeconds", () => {
  it("matches the calculator performance band thresholds", () => {
    assert.equal(performanceBandForSeconds(59 * 60 + 59), "sub_60");
    assert.equal(performanceBandForSeconds(60 * 60), "sub_60");
    assert.equal(performanceBandForSeconds(60 * 60 + 1), "sub_65");
    assert.equal(performanceBandForSeconds(104 * 60 + 59), "sub_105");
    assert.equal(performanceBandForSeconds(106 * 60), "over_105");
    assert.equal(performanceBandForSeconds(null), null);
  });
});

describe("buildGroups", () => {
  function adaptedRecord(division, performanceBand, totalSeconds = 4200) {
    return {
      _division: division,
      _performanceBand: performanceBand,
      _ageGroup: "35-39",
      _region: null,
      total_time_seconds: totalSeconds,
      run_time_seconds: 2400,
      work_time_seconds: 1500,
      roxzone_time_seconds: 300,
      segments: {},
    };
  }

  function records(count, division, performanceBand, totalSeconds) {
    return Array.from({ length: count }, () => adaptedRecord(division, performanceBand, totalSeconds));
  }

  it("creates overall and performance-band groups using selector-compatible keys", () => {
    const groups = buildGroups([
      ...records(100, "doubles_male", "sub_70", 4100),
      ...records(20, "doubles_male", "sub_75", 4400),
    ]);

    const overall = groups.find((group) => group.groupKey === "hyrox:doubles_v2:doubles_male:all:all");
    const band = groups.find((group) => group.groupKey === "hyrox:doubles_v2:band:sub_70:doubles_male:all");
    const thinBand = groups.find((group) => group.groupKey === "hyrox:doubles_v2:band:sub_75:doubles_male:all");

    assert.equal(overall?.sampleSize, 120);
    assert.equal(overall?.performanceBand, null);
    assert.equal(band?.sampleSize, 100);
    assert.equal(band?.performanceBand, "sub_70");
    assert.equal(thinBand, undefined);
  });

  it("does not build pro_doubles_mixed groups", () => {
    const groups = buildGroups(records(120, "pro_doubles_mixed", "sub_90", 5200));
    assert.equal(groups.length, 0);
  });

  it("creates over-105 groups when the enriched doubles sample is sufficient", () => {
    const groups = buildGroups(records(120, "doubles_female", "over_105", 6500));
    const band = groups.find((group) => group.groupKey === "hyrox:doubles_v2:band:over_105:doubles_female:all");

    assert.equal(band?.sampleSize, 120);
    assert.equal(band?.performanceBand, "over_105");
  });

  it("creates over-105 groups for pro doubles when the sample is sufficient", () => {
    const groups = buildGroups(records(120, "pro_doubles_female", "over_105", 6500));
    const band = groups.find((group) => group.groupKey === "hyrox:doubles_v2:band:over_105:pro_doubles_female:all");

    assert.equal(band?.sampleSize, 120);
    assert.equal(band?.performanceBand, "over_105");
  });
  it("creates age-segmented groups when there is enough age-band data", () => {
    const groups = buildGroups(records(50, "doubles_male", "sub_80", 4700));
    const ageGroup = groups.find((group) => group.groupKey === "hyrox:doubles_v2:doubles_male:male:35-39");

    assert.equal(ageGroup?.sampleSize, 50);
    assert.equal(ageGroup?.gender, "male");
    assert.equal(ageGroup?.ageGroup, "35-39");
  });

  it("does not create thin age-segmented groups", () => {
    const groups = buildGroups(records(49, "doubles_male", "sub_80", 4700));
    assert.equal(groups.find((group) => group.groupKey === "hyrox:doubles_v2:doubles_male:male:35-39"), undefined);
  });

  it("keeps non-whitelisted ages in division groups but excludes age groups", () => {
    const nonStandard = records(100, "doubles_male", "sub_80", 4700).map((record) => ({ ...record, _ageGroup: "30-39" }));
    const groups = buildGroups(nonStandard);

    assert.equal(groups.find((group) => group.groupKey === "hyrox:doubles_v2:doubles_male:all:all")?.sampleSize, 100);
    assert.equal(groups.some((group) => group.ageGroup === "30-39"), false);
  });

  it("creates regional groups when the regional sample is sufficient", () => {
    const europeRows = records(200, "doubles_male", "sub_80", 4700).map((record) => ({ ...record, _region: "europe" }));
    const groups = buildGroups(europeRows);
    const regional = groups.find((group) => group.groupKey === "hyrox:doubles_v2:doubles_male:male:all:europe");

    assert.equal(regional?.sampleSize, 200);
    assert.equal(regional?.gender, "male");
    assert.equal(regional?.ageGroup, "all");
    assert.equal(regional?.region, "europe");
  });

  it("does not create regional groups below the regional sample threshold", () => {
    const europeRows = records(199, "doubles_male", "sub_80", 4700).map((record) => ({ ...record, _region: "europe" }));
    const groups = buildGroups(europeRows);
    assert.equal(groups.find((group) => group.groupKey === "hyrox:doubles_v2:doubles_male:male:all:europe"), undefined);
  });
});

describe("groupKey", () => {
  it("formats band keys in the same shape used by benchmark selection", () => {
    assert.equal(groupKey("doubles_female"), "hyrox:doubles_v2:doubles_female:all:all");
    assert.equal(groupKey("doubles_female", "sub_80"), "hyrox:doubles_v2:band:sub_80:doubles_female:all");
  });

  it("matches fallbackRules key format for age groups", () => {
    const expected = makeBenchmarkGroupKey({ datasetVersion: "doubles_v2", division: "doubles_male", gender: "male", ageGroup: "35-39" });
    assert.equal(groupKey("doubles_male", null, "male", "35-39"), expected);
  });

  it("matches fallbackRules key format for regional groups", () => {
    const expected = makeBenchmarkGroupKey({ datasetVersion: "doubles_v2", division: "doubles_male", gender: "male", ageGroup: "all", region: "europe" });
    assert.equal(groupKey("doubles_male", null, "male", "all", "europe"), expected);
  });
});

describe("isBenchmarkSourceRowEligible", () => {
  it("rejects out-of-range times and test athletes", () => {
    assert.equal(isBenchmarkSourceRowEligible(row({ overall_time_seconds: 2699 })), false);
    assert.equal(isBenchmarkSourceRowEligible(row({ overall_time_seconds: 28801 })), false);
    assert.equal(isBenchmarkSourceRowEligible(row({ athlete_1_name: "Test, Test" })), false);
    assert.equal(isBenchmarkSourceRowEligible(row()), true);
  });
});
