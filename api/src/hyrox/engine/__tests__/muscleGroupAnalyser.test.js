import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { MUSCLE_GROUP_MAP } from "../../config/muscleGroupMap.js";
import { STATION_KEYS } from "../../config/segmentMap.js";
import { setBenchmarkData } from "../benchmarkService.js";
import { analyseSubmission } from "../hyroxAnalysisEngine.js";
import { analyseMuscleGroups } from "../muscleGroupAnalyser.js";

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

function station(segmentKey, timeGapSeconds, overrides = {}) {
  const labels = {
    ski_erg: "SkiErg",
    sled_push: "Sled Push",
    sled_pull: "Sled Pull",
    burpee_broad_jump: "Burpee Broad Jump",
    row: "Row",
    farmers_carry: "Farmers Carry",
    sandbag_lunges: "Sandbag Lunges",
    wall_balls: "Wall Balls",
    run_1: "Run 1",
    roxzone_time: "RoxZone",
  };
  return {
    segmentKey,
    label: labels[segmentKey] ?? segmentKey,
    percentile: timeGapSeconds > 0 ? 25 : timeGapSeconds < 0 ? 75 : 50,
    fieldPercentile: timeGapSeconds > 0 ? 25 : timeGapSeconds < 0 ? 75 : 50,
    timeGapSeconds,
    confidence: "medium",
    nextBandMedianSeconds: 300,
    ...overrides,
  };
}

function analyseStations(stations, overrides = {}) {
  return analyseMuscleGroups({ stationBreakdown: stations, ...overrides });
}

function signal(profile, groupId) {
  return profile.muscleGroupSignals.find((entry) => entry.groupId === groupId);
}

describe("analyseMuscleGroups unit scoring", () => {
  it("returns unavailable with fewer than 3 qualifying stations", () => {
    const result = analyseStations([
      station("wall_balls", 30),
      station("sandbag_lunges", 20),
    ]);

    assert.equal(result.available, false);
  });

  it("excludes low-confidence stations from eligibility", () => {
    const result = analyseStations([
      station("wall_balls", 30),
      station("sandbag_lunges", 20),
      station("sled_push", 10, { confidence: "low" }),
    ]);

    assert.equal(result.available, false);
  });

  it("ignores running and RoxZone segment keys for eligibility", () => {
    const result = analyseStations([
      station("wall_balls", 30),
      station("sandbag_lunges", 20),
      station("run_1", 60),
      station("roxzone_time", 60),
    ]);

    assert.equal(result.available, false);
  });

  it("classifies positive, negative, and zero gaps as weak, strong, and neutral", () => {
    const result = analyseStations([
      station("wall_balls", 30),
      station("sled_pull", -20),
      station("ski_erg", 0),
    ]);

    const classes = Object.fromEntries(result.stationClassifications.map((entry) => [entry.segmentKey, entry.relativeClass]));
    assert.equal(classes.wall_balls, "weak");
    assert.equal(classes.sled_pull, "strong");
    assert.equal(classes.ski_erg, "neutral");
  });

  it("keeps one weak and one strong vote for the same group neutral", () => {
    const result = analyseStations([
      station("wall_balls", 30),
      station("sled_push", -20),
      station("ski_erg", 0),
    ]);

    assert.equal(signal(result, "quad_dominant").weakCount, 1);
    assert.equal(signal(result, "quad_dominant").strongCount, 1);
    assert.equal(signal(result, "quad_dominant").signal, "neutral");
  });

  it("marks two weak and zero strong votes as a limiter", () => {
    const result = analyseStations([
      station("wall_balls", 30),
      station("sandbag_lunges", 20),
      station("ski_erg", 0),
    ]);

    assert.equal(signal(result, "quad_dominant").weakCount, 2);
    assert.equal(signal(result, "quad_dominant").strongCount, 0);
    assert.equal(signal(result, "quad_dominant").signal, "limiter");
  });

  it("keeps single-station evidence eligible and lets Farmers Carry produce a grip limiter", () => {
    const result = analyseStations([
      station("farmers_carry", 40),
      station("ski_erg", 0),
      station("row", 0),
    ]);

    assert.equal(signal(result, "grip_forearm").weakCount, 1);
    assert.equal(signal(result, "grip_forearm").strongCount, 0);
    assert.equal(signal(result, "grip_forearm").signal, "limiter");
  });

  it("marks groups with more strong than weak votes as assets", () => {
    const result = analyseStations([
      station("sled_pull", -40),
      station("row", -30),
      station("wall_balls", 0),
    ]);

    assert.equal(signal(result, "upper_back_pull").strongCount, 2);
    assert.equal(signal(result, "upper_back_pull").weakCount, 0);
    assert.equal(signal(result, "upper_back_pull").signal, "asset");
  });

  it("uses the explicit tie-break order for tied limiter groups", () => {
    const result = analyseStations([
      station("sled_pull", 40),
      station("wall_balls", 35),
      station("ski_erg", 0),
    ]);

    assert.deepEqual(result.primaryLimiters, ["posterior_chain", "quad_dominant"]);
  });

  it("returns only the top 2 limiters when 3 or more groups qualify", () => {
    const result = analyseStations([
      station("sled_pull", 40),
      station("wall_balls", 35),
      station("ski_erg", 0),
    ]);

    assert.equal(result.primaryLimiters.length, 2);
    assert.ok(signal(result, "upper_back_pull").signal !== "limiter");
    assert.ok(signal(result, "push_shoulder").signal !== "limiter");
  });

  it("returns only the top 1 asset when 2 or more groups qualify", () => {
    const result = analyseStations([
      station("sled_pull", -40),
      station("wall_balls", -35),
      station("ski_erg", 0),
    ]);

    assert.deepEqual(result.primaryAssets, ["posterior_chain"]);
    assert.equal(signal(result, "quad_dominant").signal, "neutral");
    assert.equal(signal(result, "upper_back_pull").signal, "neutral");
  });

  it("uses the revised primary map exposure counts for all 8 stations", () => {
    const result = analyseStations([
      station("ski_erg", 30),
      station("sled_push", 30),
      station("sled_pull", 30),
      station("burpee_broad_jump", 30),
      station("row", 30),
      station("farmers_carry", 30),
      station("sandbag_lunges", 30),
      station("wall_balls", 30),
    ]);

    assert.equal(signal(result, "posterior_chain").weakCount, 4);
    assert.equal(signal(result, "quad_dominant").weakCount, 4);
    assert.equal(signal(result, "upper_back_pull").weakCount, 3);
    assert.equal(signal(result, "push_shoulder").weakCount, 2);
    assert.equal(signal(result, "core_stability").weakCount, 2);
    assert.equal(signal(result, "grip_forearm").weakCount, 1);
  });

  it("does not count secondary group membership in weak or strong counters", () => {
    const skiErgMap = MUSCLE_GROUP_MAP.find((entry) => entry.segmentKey === "ski_erg");
    assert.ok(skiErgMap.secondary.includes("push_shoulder"));
    assert.ok(skiErgMap.secondary.includes("posterior_chain"));

    const result = analyseStations([
      station("ski_erg", 30),
      station("row", 0),
      station("wall_balls", 0),
    ]);

    assert.equal(signal(result, "upper_back_pull").weakCount, 1);
    assert.equal(signal(result, "core_stability").weakCount, 1);
    assert.equal(signal(result, "push_shoulder").weakCount, 0);
    assert.equal(signal(result, "posterior_chain").weakCount, 0);
  });

  it("softens single-station limiter narrative and preserves common-thread wording for repeated evidence", () => {
    const single = analyseStations([
      station("farmers_carry", 40),
      station("ski_erg", 0),
      station("row", 0),
    ]);
    assert.match(single.conclusion.headline, /biggest individual station gap/i);
    assert.match(single.conclusion.body, /single-station signal/i);
    assert.doesNotMatch(single.conclusion.headline, /common thread/i);
    assert.doesNotMatch(single.conclusion.body, /cross-station pattern/i);

    const repeated = analyseStations([
      station("wall_balls", 40),
      station("sandbag_lunges", 35),
      station("ski_erg", 0),
    ]);
    assert.match(repeated.conclusion.headline, /common thread across your weakest stations/i);
    assert.match(repeated.conclusion.body, /highest-leverage cross-station investment/i);
  });

  it("softens single-station asset narrative", () => {
    const result = analyseStations([
      station("farmers_carry", -40),
      station("ski_erg", 0),
      station("row", 0),
    ]);

    assert.match(result.conclusion.headline, /clearest individual station strength/i);
    assert.match(result.conclusion.body, /clearest individual station strength/i);
    assert.doesNotMatch(result.conclusion.headline, /consistently your strongest/i);
  });
});

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
