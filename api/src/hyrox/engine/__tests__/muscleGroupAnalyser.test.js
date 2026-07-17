import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { STATION_KEYS } from "../../config/segmentMap.js";
import { setBenchmarkData } from "../benchmarkService.js";
import { analyseSubmission } from "../hyroxAnalysisEngine.js";

const DATASET = "historical_hyrox_2026_06_v1";
const DEMOGRAPHIC_KEY = `hyrox:${DATASET}:open:male:all`;
const SUB_75_KEY = `hyrox:${DATASET}:band:sub_75:open:male`;
const SUB_65_KEY = `hyrox:${DATASET}:band:sub_65:open:male`;
const RUN_KEYS = Object.freeze(["run_1", "run_2", "run_3", "run_4", "run_5", "run_6", "run_7", "run_8"]);

function metric(groupKey, metricKey, medianSeconds, sampleSize = 500) {
  return {
    groupKey,
    metricKey,
    sampleSize,
    meanSeconds: medianSeconds,
    medianSeconds,
    p10Seconds: Math.round(medianSeconds * 0.8),
    p25Seconds: Math.round(medianSeconds * 0.9),
    p50Seconds: medianSeconds,
    p75Seconds: Math.round(medianSeconds * 1.1),
    p90Seconds: Math.round(medianSeconds * 1.2),
    cv: 0.1,
    missingnessRate: 0,
  };
}

function metricsForGroup(groupKey, medians) {
  return Object.entries(medians).map(([metricKey, medianSeconds]) => metric(groupKey, metricKey, medianSeconds));
}

function raceSubmission(calculatorMode) {
  const stationTimes = {
    ski_erg: 260,
    sled_push: 300,
    sled_pull: 260,
    burpee_broad_jump: 300,
    row: 260,
    farmers_carry: 240,
    sandbag_lunges: 300,
    wall_balls: 300,
  };
  return {
    calculatorMode,
    athlete: { division: "open", sex: "male" },
    athleteContext: { targetFinishTimeSeconds: 3900 },
    race: {
      division: "open",
      finishTimeSeconds: 4490,
      targetTimeSeconds: 3900,
    },
    splits: [
      ...RUN_KEYS.map((segmentKey) => ({ segmentKey, timeSeconds: 270 })),
      ...Object.entries(stationTimes).map(([segmentKey, timeSeconds]) => ({ segmentKey, timeSeconds })),
    ],
  };
}

function limiterGroupIds(analysis) {
  return (analysis.muscleGroupProfile?.muscleGroupSignals ?? [])
    .filter((signal) => signal.signal === "limiter")
    .map((signal) => signal.groupId);
}

describe("analyseMuscleGroups engine wiring", () => {
  beforeEach(() => {
    process.env.HYROX_SINGLES_BENCHMARK_SOURCE = "legacy";

    const demographicMedians = {
      total_time: 4800,
      run_time: 2400,
      work_time: 2200,
      roxzone_time: 200,
      ...Object.fromEntries(RUN_KEYS.map((key) => [key, 300])),
      ...Object.fromEntries(STATION_KEYS.map((key) => [key, 275])),
    };
    const achievedBandMedians = {
      total_time: 4490,
      run_time: 2160,
      work_time: 2220,
      roxzone_time: 60,
      ...Object.fromEntries(RUN_KEYS.map((key) => [key, 270])),
      ski_erg: 260,
      sled_push: 340,
      sled_pull: 260,
      burpee_broad_jump: 340,
      row: 260,
      farmers_carry: 180,
      sandbag_lunges: 340,
      wall_balls: 340,
    };
    const targetBandMedians = {
      total_time: 3900,
      run_time: 2160,
      work_time: 1680,
      roxzone_time: 60,
      ...Object.fromEntries(RUN_KEYS.map((key) => [key, 270])),
      ski_erg: 260,
      sled_push: 200,
      sled_pull: 260,
      burpee_broad_jump: 200,
      row: 260,
      farmers_carry: 240,
      sandbag_lunges: 200,
      wall_balls: 200,
    };

    setBenchmarkData({
      groups: [
        { groupKey: DEMOGRAPHIC_KEY, datasetVersion: DATASET, division: "open", gender: "male", ageGroup: "all", sampleSize: 500 },
        { groupKey: SUB_75_KEY, datasetVersion: DATASET, division: "open", gender: "male", performanceBand: "sub_75", sampleSize: 500 },
        { groupKey: SUB_65_KEY, datasetVersion: DATASET, division: "open", gender: "male", performanceBand: "sub_65", sampleSize: 500 },
      ],
      metrics: [
        ...metricsForGroup(DEMOGRAPHIC_KEY, demographicMedians),
        ...metricsForGroup(SUB_75_KEY, achievedBandMedians),
        ...metricsForGroup(SUB_65_KEY, targetBandMedians),
      ],
    });
  });

  it("keeps muscle-group signals stable between analyse and target modes for the same race", () => {
    const analyse = analyseSubmission(raceSubmission("analyse"));
    const target = analyseSubmission(raceSubmission("target"));

    assert.deepEqual(limiterGroupIds(target), limiterGroupIds(analyse));
    assert.deepEqual(limiterGroupIds(target), ["core_stability", "grip_forearm"]);
    assert.match(target.muscleGroupProfile?.conclusion?.trainingHint ?? "", /loaded carry|carry progressions|farmer walks/i);
    assert.doesNotMatch(target.muscleGroupProfile?.conclusion?.trainingHint ?? "", /front squats|step-ups/i);
  });
});
