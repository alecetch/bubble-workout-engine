import assert from "node:assert/strict";
import test from "node:test";
import { runHarnessMode } from "../../../routes/adminHyroxTestHarness.js";
import { submissionInput } from "../../hyroxController.js";
import { RUN_KEYS, STATION_KEYS } from "../../config/segmentMap.js";
import { setBenchmarkData } from "../benchmarkService.js";
import { analyseSubmission } from "../hyroxAnalysisEngine.js";

const DOUBLES_MALE_KEY = "hyrox:doubles_v2:doubles_male:all:all";
const DOUBLES_MALE_OVER_120_KEY = "hyrox:doubles_v2:band:over_120:doubles_male:all";

function metric(groupKey, metricKey, medianSeconds, sampleSize = 500, overrides = {}) {
  return {
    groupKey,
    metricKey,
    sampleSize,
    meanSeconds: overrides.meanSeconds ?? medianSeconds,
    medianSeconds,
    p10Seconds: medianSeconds * 0.8,
    p25Seconds: medianSeconds * 0.9,
    p50Seconds: medianSeconds,
    p75Seconds: medianSeconds * 1.1,
    p90Seconds: medianSeconds * 1.2,
    p95Seconds: medianSeconds * 1.3,
    p99Seconds: medianSeconds * 1.45,
    cv: overrides.cv ?? 0.1,
    missingnessRate: overrides.missingnessRate ?? 0,
  };
}

function anirudhFelipeSplits({ includeAggregateTotals = false } = {}) {
  const splits = [
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
  ];
  if (includeAggregateTotals) {
    splits.push(
      { segmentKey: "run_time", label: "Total Run Time", type: "aggregate", timeSeconds: 4893 },
      { segmentKey: "work_time", label: "Total Station Time", type: "aggregate", timeSeconds: 1493 },
      { segmentKey: "roxzone_time", label: "Total RoxZone Time", type: "aggregate", timeSeconds: 603 },
    );
  }
  return splits;
}

function basicRaceSplits({ omit = [] } = {}) {
  const omitted = new Set(omit);
  return [
    ...RUN_KEYS
      .filter((segmentKey) => !omitted.has(segmentKey))
      .map((segmentKey) => ({ segmentKey, type: "run", timeSeconds: 300 })),
    ...STATION_KEYS
      .filter((segmentKey) => !omitted.has(segmentKey))
      .map((segmentKey) => ({ segmentKey, type: "station", timeSeconds: 200 })),
  ];
}

function setBasicDoublesBenchmarks() {
  setBenchmarkData({
    groups: [
      { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 500 },
    ],
    metrics: [
      metric(DOUBLES_MALE_KEY, "total_time", 4520),
      metric(DOUBLES_MALE_KEY, "run_time", 2400),
      metric(DOUBLES_MALE_KEY, "work_time", 1600),
      metric(DOUBLES_MALE_KEY, "roxzone_time", 300),
      metric(DOUBLES_MALE_KEY, "row", 420),
    ],
  });
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
      splits: anirudhFelipeSplits(),
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

test("dataQuality reports repaired split keys without inflating completeness", () => {
  const previousSource = process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
  process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
  try {
    setBasicDoublesBenchmarks();
    const analysis = analyseSubmission(submissionInput({
      calculatorMode: "analyse",
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 4520 },
      splits: [
        ...basicRaceSplits({ omit: ["row"] }),
        { segmentKey: "roxzone_time", type: "aggregate", timeSeconds: 300 },
      ],
    }));

    assert.ok(analysis.dataQuality.warnings.includes("split_estimated_from_residual"));
    assert.equal(analysis.dataQuality.warnings.includes("partial_split_data"), false);
    assert.deepEqual(analysis.dataQuality.estimatedSplitKeys, ["row"]);
    assert.equal(analysis.dataQuality.inputCompleteness, 0.94);
    assert.equal(analysis.dataQuality.confidence, "medium");
  } finally {
    if (previousSource === undefined) {
      delete process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
    } else {
      process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = previousSource;
    }
  }
});

test("dataQuality keeps partial_split_data for unrepairable missing splits", () => {
  const previousSource = process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
  process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
  try {
    setBasicDoublesBenchmarks();
    const analysis = analyseSubmission(submissionInput({
      calculatorMode: "analyse",
      athlete: { division: "doubles", sex: "male" },
      race: { division: "doubles", finishTimeSeconds: 4520 },
      splits: [
        ...basicRaceSplits({ omit: ["row", "farmers_carry"] }),
        { segmentKey: "roxzone_time", type: "aggregate", timeSeconds: 300 },
      ],
    }));

    assert.ok(analysis.dataQuality.warnings.includes("partial_split_data"));
    assert.equal(analysis.dataQuality.warnings.includes("split_estimated_from_residual"), false);
    assert.deepEqual(analysis.dataQuality.unrepairableMissingSplitKeys, ["row", "farmers_carry"]);
  } finally {
    if (previousSource === undefined) {
      delete process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
    } else {
      process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = previousSource;
    }
  }
});

test("test harness path keeps doubles over-120 individual station strength ahead of total station time", () => {
  const previousSource = process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
  process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
  setBenchmarkData({
    groups: [
      { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 98994 },
      { groupKey: DOUBLES_MALE_OVER_120_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", performanceBand: "over_120", sampleSize: 1084 },
    ],
    metrics: [
      metric(DOUBLES_MALE_KEY, "total_time", 4516, 98994, { cv: 0.17535833272274165 }),
      metric(DOUBLES_MALE_KEY, "run_time", 2479, 98413, { cv: 0.2099200621501358 }),
      metric(DOUBLES_MALE_KEY, "work_time", 1605, 98671, { cv: 0.16063991539024827 }),
      metric(DOUBLES_MALE_KEY, "roxzone_time", 408, 94760, { cv: 0.5368093617014122 }),
      metric(DOUBLES_MALE_KEY, "burpee_broad_jump", 192, 98023, { cv: 0.27971799769328154 }),
      metric(DOUBLES_MALE_KEY, "sled_pull", 198, 98015, { cv: 0.2654009138548325 }),
      metric(DOUBLES_MALE_OVER_120_KEY, "total_time", 7733, 1084, { cv: 0.124225615975552 }),
      metric(DOUBLES_MALE_OVER_120_KEY, "run_time", 4532, 1059, { cv: 0.15604950027198286, missingnessRate: 0.023062730627306273 }),
      metric(DOUBLES_MALE_OVER_120_KEY, "work_time", 2386, 1072, { cv: 0.3162829291859306, missingnessRate: 0.01107011070110701 }),
      metric(DOUBLES_MALE_OVER_120_KEY, "roxzone_time", 891, 1030, { cv: 0.6208755591730954, missingnessRate: 0.04981549815498155 }),
      metric(DOUBLES_MALE_OVER_120_KEY, "burpee_broad_jump", 314, 1066, { cv: 0.34415628932264125, missingnessRate: 0.016605166051660517 }),
      metric(DOUBLES_MALE_OVER_120_KEY, "sled_pull", 305, 1066, { cv: 0.6478202961103908, missingnessRate: 0.016605166051660517 }),
    ],
  });

  try {
    const result = runHarnessMode(
      { modeName: "Analyse mode", calculatorMode: "analyse" },
      {
        athleteName: "Anirudh Pradhan & Felipe Haddad",
        sex: "male",
        division: "doubles",
        raceName: "General Ranking",
        eventDate: null,
        finishTimeSeconds: 8480,
        splits: anirudhFelipeSplits(),
      },
      null,
      {},
    );
    const analysis = result.analysisJson;
    const burpee = analysis.segments.find((segment) => segment.segmentKey === "burpee_broad_jump");
    const sledPull = analysis.segments.find((segment) => segment.segmentKey === "sled_pull");
    const workTime = analysis.segments.find((segment) => segment.segmentKey === "work_time");
    const roxzone = analysis.segments.find((segment) => segment.segmentKey === "roxzone_time");

    assert.equal(analysis.benchmarkContext.primaryBenchmarkGroup.key, DOUBLES_MALE_OVER_120_KEY);
    assert.equal(analysis.benchmarkContext.primaryBenchmarkGroup.sampleSize, 1084);
    assert.equal(workTime.frameGapSeconds, -754);
    assert.equal(burpee.frameGapSeconds, -178);
    assert.equal(sledPull.frameGapSeconds, -151);
    assert.equal(analysis.headline.biggestStrength.segmentKey, "burpee_broad_jump");
    assert.equal(result.raceCardData.strongestStation.name, "Burpee Broad Jump");
  } finally {
    if (previousSource === undefined) {
      delete process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
    } else {
      process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = previousSource;
    }
  }
});

test("test harness path with unknown doubles sex keeps individual station strength ahead of total station time", () => {
  const previousSource = process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
  process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "enriched";
  setBenchmarkData({
    groups: [
      { groupKey: DOUBLES_MALE_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", sampleSize: 98994 },
      { groupKey: DOUBLES_MALE_OVER_120_KEY, datasetVersion: "doubles_v2", division: "doubles_male", gender: "all", ageGroup: "all", performanceBand: "over_120", sampleSize: 1084 },
    ],
    metrics: [
      metric(DOUBLES_MALE_KEY, "total_time", 4516, 98994, { cv: 0.17535833272274165 }),
      metric(DOUBLES_MALE_KEY, "run_time", 2479, 98413, { cv: 0.2099200621501358 }),
      metric(DOUBLES_MALE_KEY, "work_time", 1605, 98671, { cv: 0.16063991539024827 }),
      metric(DOUBLES_MALE_KEY, "roxzone_time", 408, 94760, { cv: 0.5368093617014122 }),
      metric(DOUBLES_MALE_KEY, "burpee_broad_jump", 192, 98023, { cv: 0.27971799769328154 }),
      metric(DOUBLES_MALE_KEY, "sled_pull", 198, 98015, { cv: 0.2654009138548325 }),
      metric(DOUBLES_MALE_OVER_120_KEY, "total_time", 7733, 1084, { cv: 0.124225615975552 }),
      metric(DOUBLES_MALE_OVER_120_KEY, "run_time", 4532, 1059, { cv: 0.15604950027198286, missingnessRate: 0.023062730627306273 }),
      metric(DOUBLES_MALE_OVER_120_KEY, "work_time", 2386, 1072, { cv: 0.3162829291859306, missingnessRate: 0.01107011070110701 }),
      metric(DOUBLES_MALE_OVER_120_KEY, "roxzone_time", 891, 1030, { cv: 0.6208755591730954, missingnessRate: 0.04981549815498155 }),
      metric(DOUBLES_MALE_OVER_120_KEY, "burpee_broad_jump", 314, 1066, { cv: 0.34415628932264125, missingnessRate: 0.016605166051660517 }),
      metric(DOUBLES_MALE_OVER_120_KEY, "sled_pull", 305, 1066, { cv: 0.6478202961103908, missingnessRate: 0.016605166051660517 }),
    ],
  });

  try {
    const result = runHarnessMode(
      { modeName: "Analyse mode", calculatorMode: "analyse" },
      {
        athleteName: "Anirudh Pradhan & Felipe Haddad",
        sex: null,
        ageGroup: "30-34",
        division: "doubles",
        raceName: "General Ranking",
        eventDate: null,
        finishTimeSeconds: 8480,
        splits: anirudhFelipeSplits({ includeAggregateTotals: true }),
      },
      null,
      {},
    );
    const analysis = result.analysisJson;
    const burpee = analysis.segments.find((segment) => segment.segmentKey === "burpee_broad_jump");
    const sledPull = analysis.segments.find((segment) => segment.segmentKey === "sled_pull");
    const workTime = analysis.segments.find((segment) => segment.segmentKey === "work_time");
    const roxzone = analysis.segments.find((segment) => segment.segmentKey === "roxzone_time");

    assert.equal(result.input.athlete.sex, null);
    assert.equal(analysis.benchmarkContext.primaryBenchmarkGroup.key, DOUBLES_MALE_OVER_120_KEY);
    assert.equal(analysis.benchmarkContext.primaryBenchmarkGroup.sampleSize, 1084);
    assert.equal(workTime.frameGapSeconds, -893);
    assert.equal(roxzone.frameGapSeconds, -288);
    assert.equal(burpee.frameGapSeconds, -178);
    assert.equal(sledPull.frameGapSeconds, -151);
    assert.equal(analysis.headline.biggestStrength.segmentKey, "burpee_broad_jump");
    assert.notEqual(analysis.headline.biggestStrength.segmentKey, "work_time");
    assert.equal(result.raceCardData.strongestStation.name, "Burpee Broad Jump");
    assert.notEqual(result.raceCardData.strongestStation.name, "Total Station Time");
  } finally {
    if (previousSource === undefined) {
      delete process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
    } else {
      process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = previousSource;
    }
  }
});
