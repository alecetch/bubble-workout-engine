import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { setBenchmarkData } from "../benchmarkService.js";
import { calculateSegmentStats, scoreTimeAgainstGroup } from "../percentileCalculator.js";

const DOUBLES_MALE_KEY = "hyrox:doubles_v1:doubles_male:all:all";

function metric(metricKey, values) {
  return {
    groupKey: DOUBLES_MALE_KEY,
    metricKey,
    sampleSize: values.length,
    meanSeconds: values.reduce((sum, value) => sum + value, 0) / values.length,
    medianSeconds: values[Math.floor(values.length / 2)],
    p10Seconds: values[Math.floor(values.length * 0.1)],
    p25Seconds: values[Math.floor(values.length * 0.25)],
    p50Seconds: values[Math.floor(values.length * 0.5)],
    p75Seconds: values[Math.floor(values.length * 0.75)],
    p90Seconds: values[Math.floor(values.length * 0.9)],
    cv: 0.1,
    missingnessRate: 0,
    sortedValues: values,
  };
}

describe("calculateSegmentStats", () => {
  beforeEach(() => {
    setBenchmarkData({
      groups: [
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v1", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 150 },
      ],
      metrics: [
        metric("total_time", Array.from({ length: 150 }, (_, index) => 4200 + index * 10)),
        metric("run_time", Array.from({ length: 150 }, (_, index) => 2400 + index * 5)),
        metric("work_time", Array.from({ length: 150 }, (_, index) => 1800 + index * 4)),
        metric("roxzone_time", Array.from({ length: 150 }, (_, index) => 320 + index)),
        metric("ski_erg", Array.from({ length: 150 }, (_, index) => 220 + index)),
        metric("row", Array.from({ length: 150 }, (_, index) => 240 + index)),
      ],
    });
  });

  it("uses the selected enriched doubles group for segment percentiles", () => {
    const rows = calculateSegmentStats({
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 4500 },
      splitMap: new Map([
        ["ski_erg", { segmentKey: "ski_erg", type: "station", timeSeconds: 240 }],
      ]),
    }, {
      primaryBenchmarkGroup: {
        key: DOUBLES_MALE_KEY,
        datasetVersion: "doubles_v1",
        division: "doubles_male",
        gender: "all",
        ageGroup: "all",
      },
    });

    const ski = rows.find((row) => row.segmentKey === "ski_erg");
    assert.equal(ski?.benchmarkGroupUsed, DOUBLES_MALE_KEY);
    assert.equal(typeof ski?.percentile, "number");
  });

  it("forces low confidence for a repaired split even when benchmark selection is strong", () => {
    const rows = calculateSegmentStats({
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 4500 },
      splitMap: new Map([
        ["row", { segmentKey: "row", type: "station", timeSeconds: 260, estimated: true }],
      ]),
    }, {
      primaryBenchmarkGroup: {
        key: DOUBLES_MALE_KEY,
        datasetVersion: "doubles_v1",
        division: "doubles_male",
        gender: "all",
        ageGroup: "all",
      },
    });

    const row = rows.find((segment) => segment.segmentKey === "row");
    assert.equal(row?.confidence, "low");
    assert.ok(["A", "B", "C"].includes(row?.confidenceGrade), `expected strong selection grade, got ${row?.confidenceGrade}`);
  });

  function aggregateSubmission(penalties = []) {
    return {
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 5000 },
      runTimeSeconds: 2600,
      workTimeSeconds: 2050,
      roxzoneTimeSeconds: 350,
      penalties,
      splitMap: new Map([
        ["run_1", { segmentKey: "run_1", type: "run", timeSeconds: 320 }],
        ["farmers_carry", { segmentKey: "farmers_carry", type: "station", timeSeconds: 360 }],
      ]),
      penaltyAdjustedSplitMap: new Map([
        ["run_1", { segmentKey: "run_1", type: "run", timeSeconds: 320 }],
        ["farmers_carry", { segmentKey: "farmers_carry", type: "station", timeSeconds: 360 }],
      ]),
    };
  }

  function aggregateRows(penalties = []) {
    return calculateSegmentStats(aggregateSubmission(penalties), {
      primaryBenchmarkGroup: {
        key: DOUBLES_MALE_KEY,
        datasetVersion: "doubles_v1",
        division: "doubles_male",
        gender: "all",
        ageGroup: "all",
      },
    });
  }

  function row(rows, segmentKey) {
    const found = rows.find((segment) => segment.segmentKey === segmentKey);
    assert.ok(found, `${segmentKey} row should be present`);
    return found;
  }

  function assertNetGapMatches(rowValue) {
    assert.equal(rowValue.timeGapToMedianSecondsNetOfPenalty, rowValue.userSecondsNetOfPenalty - rowValue.benchmarkMedianSeconds);
  }

  it("adjusts total_time net-of-penalty by every attributed penalty", () => {
    const rows = aggregateRows([{ runKey: "farmers_carry", penaltySeconds: 180 }]);
    const total = row(rows, "total_time");
    const roxzone = row(rows, "roxzone_time");

    assert.equal(total.userSecondsNetOfPenalty, total.userSeconds - 180);
    assertNetGapMatches(total);
    assert.equal(roxzone.userSecondsNetOfPenalty, roxzone.userSeconds);
    assertNetGapMatches(roxzone);
  });

  it("adjusts work_time but not run_time when a material penalty is on a station key", () => {
    const rows = aggregateRows([{ runKey: "farmers_carry", penaltySeconds: 180 }]);
    const run = row(rows, "run_time");
    const work = row(rows, "work_time");
    const roxzone = row(rows, "roxzone_time");

    assert.equal(work.userSecondsNetOfPenalty, work.userSeconds - 180);
    assert.equal(run.userSecondsNetOfPenalty, run.userSeconds);
    assertNetGapMatches(work);
    assertNetGapMatches(run);
    assert.equal(roxzone.userSecondsNetOfPenalty, roxzone.userSeconds);
  });

  it("adjusts run_time but not work_time when a material penalty is on a run key", () => {
    const rows = aggregateRows([{ runKey: "run_1", penaltySeconds: 120 }]);
    const run = row(rows, "run_time");
    const work = row(rows, "work_time");
    const roxzone = row(rows, "roxzone_time");

    assert.equal(run.userSecondsNetOfPenalty, run.userSeconds - 120);
    assert.equal(work.userSecondsNetOfPenalty, work.userSeconds);
    assertNetGapMatches(run);
    assertNetGapMatches(work);
    assert.equal(roxzone.userSecondsNetOfPenalty, roxzone.userSeconds);
  });

  it("leaves aggregate net-of-penalty fields unchanged when there are no penalties", () => {
    const rows = aggregateRows();
    for (const segmentKey of ["total_time", "run_time", "work_time", "roxzone_time"]) {
      const aggregate = row(rows, segmentKey);
      assert.equal(aggregate.userSecondsNetOfPenalty, aggregate.userSeconds);
      assert.equal(aggregate.timeGapToMedianSecondsNetOfPenalty, aggregate.timeGapToMedianSeconds);
    }
  });

  it("does not adjust roxzone_time for run or station penalties", () => {
    for (const penalties of [
      [{ runKey: "farmers_carry", penaltySeconds: 180 }],
      [{ runKey: "run_1", penaltySeconds: 120 }],
      [{ runKey: "run_1", penaltySeconds: 120 }, { runKey: "farmers_carry", penaltySeconds: 180 }],
    ]) {
      const roxzone = row(aggregateRows(penalties), "roxzone_time");
      assert.equal(roxzone.userSecondsNetOfPenalty, roxzone.userSeconds);
      assert.equal(roxzone.timeGapToMedianSecondsNetOfPenalty, roxzone.timeGapToMedianSeconds);
    }
  });
});

describe("scoreTimeAgainstGroup", () => {
  it("returns null for null inputs", () => {
    assert.equal(scoreTimeAgainstGroup(null, DOUBLES_MALE_KEY), null);
    assert.equal(scoreTimeAgainstGroup(5000, null), null);
  });

  it("scores a finish time against benchmark stats", () => {
    setBenchmarkData({
      groups: [
        { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v1", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 150 },
      ],
      metrics: [
        metric("total_time", Array.from({ length: 150 }, (_, index) => 4200 + index * 10)),
      ],
    });

    assert.equal(typeof scoreTimeAgainstGroup(4500, DOUBLES_MALE_KEY), "number");
  });
});
