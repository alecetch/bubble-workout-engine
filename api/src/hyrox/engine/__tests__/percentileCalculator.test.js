import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { setBenchmarkData } from "../benchmarkService.js";
import { calculateSegmentStats } from "../percentileCalculator.js";

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
        metric("ski_erg", Array.from({ length: 150 }, (_, index) => 220 + index)),
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
});
