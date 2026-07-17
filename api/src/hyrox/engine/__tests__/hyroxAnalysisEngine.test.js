import assert from "node:assert/strict";
import test from "node:test";
import { submissionInput } from "../../hyroxController.js";
import { setBenchmarkData } from "../benchmarkService.js";
import { analyseSubmission } from "../hyroxAnalysisEngine.js";

const DOUBLES_MALE_KEY = "hyrox:doubles_v2:doubles_male:all:all";
const DOUBLES_MALE_OVER_120_KEY = "hyrox:doubles_v2:band:over_120:doubles_male:all";

function metric(groupKey, metricKey, medianSeconds, sampleSize = 500) {
  return {
    groupKey,
    metricKey,
    sampleSize,
    meanSeconds: medianSeconds,
    medianSeconds,
    p10Seconds: medianSeconds * 0.8,
    p25Seconds: medianSeconds * 0.9,
    p50Seconds: medianSeconds,
    p75Seconds: medianSeconds * 1.1,
    p90Seconds: medianSeconds * 1.2,
    p95Seconds: medianSeconds * 1.3,
    p99Seconds: medianSeconds * 1.45,
    cv: 0.1,
    missingnessRate: 0,
  };
}

test("analyse mode doubles strength falls back from aggregate station time to individual station benchmark", () => {
  const previousSource = process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
  process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
  setBenchmarkData({
    groups: [
      { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 500 },
      { groupKey: DOUBLES_MALE_OVER_120_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", performanceBand: "over_120", sampleSize: 500 },
    ],
    metrics: [
      metric(DOUBLES_MALE_KEY, "total_time", 8500),
      metric(DOUBLES_MALE_KEY, "sled_pull", 305),
      metric(DOUBLES_MALE_KEY, "burpee_broad_jump", 314),
      metric(DOUBLES_MALE_OVER_120_KEY, "total_time", 8400),
      metric(DOUBLES_MALE_OVER_120_KEY, "run_time", 4800),
      metric(DOUBLES_MALE_OVER_120_KEY, "work_time", 2525),
      metric(DOUBLES_MALE_OVER_120_KEY, "roxzone_time", 1900),
    ],
  });

  try {
    const input = submissionInput({
      calculatorMode: "analyse",
      athlete: {
        displayName: "Anirudh Pradhan & Felipe Haddad",
        division: "doubles",
        sex: "male",
      },
      race: {
        raceName: "General Ranking",
        division: "doubles",
        finishTimeSeconds: 8480,
      },
      splits: [
        { segmentKey: "run_1", label: "Run 1", type: "run", index: 1, timeSeconds: 513, fieldRank: null },
        { segmentKey: "ski_erg", label: "SkiErg", type: "station", index: 2, timeSeconds: 228, fieldRank: 127 },
        { segmentKey: "run_2", label: "Run 2", type: "run", index: 3, timeSeconds: 468, fieldRank: null },
        { segmentKey: "sled_push", label: "Sled Push", type: "station", index: 4, timeSeconds: 98, fieldRank: 120 },
        { segmentKey: "run_3", label: "Run 3", type: "run", index: 5, timeSeconds: 488, fieldRank: null },
        { segmentKey: "sled_pull", label: "Sled Pull", type: "station", index: 6, timeSeconds: 154, fieldRank: 87 },
        { segmentKey: "run_4", label: "Run 4", type: "run", index: 7, timeSeconds: 514, fieldRank: null },
        { segmentKey: "burpee_broad_jump", label: "Burpee Broad Jump", type: "station", index: 8, timeSeconds: 136, fieldRank: 69 },
        { segmentKey: "run_5", label: "Run 5", type: "run", index: 9, timeSeconds: 642, fieldRank: null },
        { segmentKey: "row", label: "Row", type: "station", index: 10, timeSeconds: 276, fieldRank: 110 },
        { segmentKey: "run_6", label: "Run 6", type: "run", index: 11, timeSeconds: 668, fieldRank: null },
        { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", index: 12, timeSeconds: 160, fieldRank: 95 },
        { segmentKey: "run_7", label: "Run 7", type: "run", index: 13, timeSeconds: 900, fieldRank: null },
        { segmentKey: "sandbag_lunges", label: "Sandbag Lunges", type: "station", index: 14, timeSeconds: 280, fieldRank: 105 },
        { segmentKey: "run_8", label: "Run 8", type: "run", index: 15, timeSeconds: 700, fieldRank: null },
        { segmentKey: "wall_balls", label: "Wall Balls", type: "station", index: 16, timeSeconds: 300, fieldRank: 100 },
      ],
    });

    const analysis = analyseSubmission(input);
    const burpee = analysis.segments.find((segment) => segment.segmentKey === "burpee_broad_jump");
    const sledPull = analysis.segments.find((segment) => segment.segmentKey === "sled_pull");
    const workTime = analysis.segments.find((segment) => segment.segmentKey === "work_time");

    assert.equal(analysis.benchmarkContext.primaryBenchmarkGroup.key, DOUBLES_MALE_OVER_120_KEY);
    assert.equal(workTime.frameGapSeconds, -893);
    assert.equal(burpee.type, "station");
    assert.equal(burpee.benchmarkGroupUsed, DOUBLES_MALE_KEY);
    assert.equal(burpee.frameGapSeconds, -178);
    assert.equal(sledPull.type, "station");
    assert.equal(sledPull.benchmarkGroupUsed, DOUBLES_MALE_KEY);
    assert.equal(sledPull.frameGapSeconds, -151);
    assert.equal(analysis.headline.biggestStrength.segmentKey, "burpee_broad_jump");
    assert.notEqual(analysis.headline.biggestStrength.segmentKey, "work_time");
  } finally {
    if (previousSource === undefined) {
      delete process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
    } else {
      process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = previousSource;
    }
  }
});
