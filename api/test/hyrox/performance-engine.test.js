import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BENCHMARK_THRESHOLDS } from "../../src/hyrox/config/benchmarkThresholds.js";
import { INDIVIDUAL_ANALYSIS_DIVISIONS } from "../../src/hyrox/config/divisionGroups.js";
import { SEGMENT_MAP, ROXZONE_KEYS, RUN_KEYS, STATION_KEYS } from "../../src/hyrox/config/segmentMap.js";
import { isIndividualDivision } from "../../src/hyrox/confidence/fallbackRules.js";
import { setBenchmarkData } from "../../src/hyrox/engine/benchmarkService.js";
import { analyseSubmission } from "../../src/hyrox/engine/hyroxAnalysisEngine.js";
import { normaliseSubmission } from "../../src/hyrox/engine/segmentNormaliser.js";
import { calculatePercentile, calculateSegmentStats } from "../../src/hyrox/engine/percentileCalculator.js";
import { calculateScores } from "../../src/hyrox/engine/scoreCalculator.js";
import { findBiggestLimiter, findBiggestStrength, calculateTimePotential } from "../../src/hyrox/engine/limiterService.js";
import { analyseRunFade } from "../../src/hyrox/engine/runFadeAnalyser.js";
import { analyseRoxzone } from "../../src/hyrox/engine/roxzoneAnalyser.js";
import { classifyArchetype } from "../../src/hyrox/engine/archetypeClassifier.js";
import { buildEmailReport } from "../../src/hyrox/reports/emailReportBuilder.js";
import { buildBrowserSummary } from "../../src/hyrox/reports/browserSummaryBuilder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_DIR = path.resolve(__dirname, "../fixtures/hyrox");
const GROUP_KEY = "hyrox:historical_hyrox_2026_06_v1:open:male:30-34";
const FALLBACK_KEY = "hyrox:historical_hyrox_2026_06_v1:open:male:all";
const GOAL_BAND_KEY = "hyrox:historical_hyrox_2026_06_v1:band:sub_70:open:male";
const SUB_75_BAND_KEY = "hyrox:historical_hyrox_2026_06_v1:band:sub_75:open:male";
const SUB_80_BAND_KEY = "hyrox:historical_hyrox_2026_06_v1:band:sub_80:open:male";
const SUB_65_BAND_KEY = "hyrox:historical_hyrox_2026_06_v1:band:sub_65:open:male";
const SUB_60_BAND_KEY = "hyrox:historical_hyrox_2026_06_v1:band:sub_60:open:male";
const DOUBLES_MIXED_KEY = "hyrox:historical_hyrox_2026_06_v1:doubles_mixed:mixed:30-34";
const DOUBLES_MIXED_SUB_75_KEY = "hyrox:historical_hyrox_2026_06_v1:band:sub_75:doubles_mixed:mixed";

const BASE_MEDIANS = Object.freeze({
  total_time: 4440,
  run_time: 2400,
  work_time: 1800,
  roxzone_time: 240,
  run_1: 300,
  run_2: 300,
  run_3: 300,
  run_4: 300,
  run_5: 300,
  run_6: 300,
  run_7: 300,
  run_8: 300,
  ski_erg: 300,
  sled_push: 120,
  sled_pull: 120,
  burpee_broad_jump: 300,
  row: 300,
  farmers_carry: 120,
  sandbag_lunges: 240,
  wall_balls: 300,
  roxzone_1: 30,
  roxzone_2: 30,
  roxzone_3: 30,
  roxzone_4: 30,
  roxzone_5: 30,
  roxzone_6: 30,
  roxzone_7: 30,
  roxzone_8: 30,
});

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

function completeSubmission({ splitOverrides = {}, penalties = [], calculatorMode = "target" } = {}) {
  const splitSeconds = {
    ...Object.fromEntries(RUN_KEYS.map((key) => [key, BASE_MEDIANS[key]])),
    ...Object.fromEntries(STATION_KEYS.map((key) => [key, BASE_MEDIANS[key]])),
    ...Object.fromEntries(ROXZONE_KEYS.map((key) => [key, BASE_MEDIANS[key]])),
    ...splitOverrides,
  };
  const splits = [...RUN_KEYS, ...STATION_KEYS, ...ROXZONE_KEYS].map((segmentKey) => ({
    segmentKey,
    timeSeconds: splitSeconds[segmentKey],
  }));
  const finishTimeSeconds = Object.values(splitSeconds).reduce((sum, value) => sum + value, 0);
  return {
    athlete: { sex: "male", ageGroup: "30-34", division: "open" },
    race: { finishTimeSeconds, division: "open" },
    splits,
    penalties,
    roxzoneMode: "explicit_splits",
    calculatorMode,
  };
}

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
    iqrSeconds: medianSeconds * 0.2,
    missingnessRate: 0,
    outlierRate: 0,
  };
}

function seedBenchmarks() {
  const metrics = [];
  for (const [metricKey, median] of Object.entries(BASE_MEDIANS)) {
    metrics.push(metric(GROUP_KEY, metricKey, median));
    metrics.push(metric(FALLBACK_KEY, metricKey, median));
    metrics.push(metric(GOAL_BAND_KEY, metricKey, metricKey === "total_time" ? 4140 : median));
    metrics.push(metric(SUB_75_BAND_KEY, metricKey, metricKey === "total_time" ? 4440 : median));
    metrics.push(metric(SUB_80_BAND_KEY, metricKey, metricKey === "total_time" ? 4680 : median + 20));
    metrics.push(metric(SUB_65_BAND_KEY, metricKey, metricKey === "total_time" ? 3900 : median - 60));
    metrics.push(metric(SUB_60_BAND_KEY, metricKey, metricKey === "total_time" ? 3420 : median - 30));
  }
  metrics.push(metric(GROUP_KEY, "run_fade_pct", 5));
  metrics.push(metric(FALLBACK_KEY, "run_fade_pct", 5));
  metrics.push(metric(GOAL_BAND_KEY, "run_fade_pct", 5));
  metrics.push(metric(SUB_75_BAND_KEY, "run_fade_pct", 5));
  metrics.push(metric(SUB_80_BAND_KEY, "run_fade_pct", 5));
  metrics.push(metric(SUB_65_BAND_KEY, "run_fade_pct", 5));
  metrics.push(metric(SUB_60_BAND_KEY, "run_fade_pct", 5));
  setBenchmarkData({
    groups: [
      { groupKey: GROUP_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", ageGroup: "30-34", sampleSize: 500 },
      { groupKey: FALLBACK_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", ageGroup: null, fallbackLevel: 1, sampleSize: 600 },
      { groupKey: GOAL_BAND_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", performanceBand: "sub_70", sampleSize: 500 },
      { groupKey: SUB_75_BAND_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", performanceBand: "sub_75", sampleSize: 500 },
      { groupKey: SUB_80_BAND_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", performanceBand: "sub_80", sampleSize: 500 },
      { groupKey: SUB_65_BAND_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", performanceBand: "sub_65", sampleSize: 500 },
      { groupKey: SUB_60_BAND_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", performanceBand: "sub_60", sampleSize: 500 },
    ],
    metrics,
  });
}

test.beforeEach(() => {
  seedBenchmarks();
});

test("faster time produces higher percentile than slower time", () => {
  const values = [100, 120, 140, 160, 180];
  assert.ok(calculatePercentile(100, values) > calculatePercentile(180, values));
});

test("user at exact median returns approximately percentile 50", () => {
  assert.equal(calculatePercentile(140, [100, 120, 140, 160, 180]), 40);
  assert.equal(calculatePercentile(140, [100, 120, 141, 160, 180]), 60);
});

test("weights sum correctly when one component is missing", () => {
  const stats = [
    { segmentKey: "run_time", percentile: 80 },
    { segmentKey: "row", percentile: 40 },
    { segmentKey: "roxzone_time", percentile: 50 },
  ];
  const scores = calculateScores(stats, normaliseSubmission(readFixture("partial_splits.json")), { available: false });
  assert.equal(scores.engineScore, 70);
});

test("all scores are in range 0-100", () => {
  const analysis = analyseSubmission(readFixture("balanced_athlete.json"));
  for (const value of Object.values(analysis.scores)) {
    if (value !== null) assert.ok(value >= 0 && value <= 100);
  }
});

test("identical run splits produce 0% fade", () => {
  const result = analyseRunFade(normaliseSubmission(readFixture("balanced_athlete.json")), { primaryBenchmarkGroup: { key: GROUP_KEY } });
  assert.equal(result.runFadePct, 0);
});

test("returns partial when only run_1 and run_8 present", () => {
  const result = analyseRunFade(normaliseSubmission(readFixture("missing_age_group.json")), { primaryBenchmarkGroup: { key: GROUP_KEY } });
  assert.equal(result.available, true);
  assert.equal(result.partialCalculation, true);
});

test("returns available:false when fewer than 2 run splits", () => {
  const result = analyseRunFade(normaliseSubmission({ race: { finishTimeSeconds: 1000 }, splits: [{ segmentKey: "run_1", type: "run", timeSeconds: 300 }] }), {});
  assert.equal(result.available, false);
});

test("inferred mode returns segmentBreakdown:null", () => {
  const result = analyseRoxzone(normaliseSubmission(readFixture("inferred_roxzone_only.json")), { primaryBenchmarkGroup: { key: GROUP_KEY } });
  assert.equal(result.mode, "inferred_total");
  assert.equal(result.segmentBreakdown, null);
});

test("explicit mode returns per-segment breakdown", () => {
  const result = analyseRoxzone(normaliseSubmission(readFixture("balanced_athlete.json")), { primaryBenchmarkGroup: { key: GROUP_KEY } });
  assert.equal(result.mode, "explicit_splits");
  assert.equal(result.segmentBreakdown.length, ROXZONE_KEYS.length);
});

test("biggest limiter is wall_balls when wall_ball_gap fixture used", () => {
  const analysis = analyseSubmission(readFixture("wall_ball_gap.json"));
  assert.equal(analysis.headline.biggestLimiter.segmentKey, "wall_balls");
  assert.ok(analysis.timePotential.headlineGainSeconds >= 60);
});

test("biggest strength is not a roxzone segment unless exceptional", () => {
  const strength = findBiggestStrength([
    { segmentKey: "roxzone_1", percentile: 80, timeGapToMedianSeconds: -100 },
    { segmentKey: "run_1", percentile: 70, timeGapToMedianSeconds: -20 },
  ]);
  assert.equal(strength.segmentKey, "run_1");
});

test("strong_runner_weak_stations fixture classifies as strong_runner_station_limited", () => {
  const analysis = analyseSubmission(readFixture("strong_runner_weak_stations.json"));
  assert.ok(analysis.scores.engineScore >= 65);
  assert.ok(analysis.scores.strengthScore < 55);
  assert.equal(analysis.athleteArchetype.key, "strong_runner_station_limited");
});

test("strong_lifter_weak_running fixture classifies as strong_lifter_engine_limited", () => {
  const analysis = analyseSubmission(readFixture("strong_lifter_weak_running.json"));
  assert.ok(analysis.scores.strengthScore >= 65);
  assert.ok(analysis.scores.engineScore < 55);
  assert.equal(analysis.athleteArchetype.key, "strong_lifter_engine_limited");
});

test("elite_small_gaps fixture classifies as elite_marginal_gains", () => {
  const analysis = analyseSubmission(readFixture("elite_small_gaps.json"));
  assert.ok(analysis.scores.overallPerformanceScore >= 85);
  assert.equal(analysis.athleteArchetype.key, "elite_marginal_gains");
  assert.equal(analysis.athleteArchetype.label, "Advanced marginal gains");
});

test("doubles_result returns analysisScope: limited", () => {
  const analysis = analyseSubmission(readFixture("doubles_result.json"));
  assert.equal(analysis.analysisScope, "limited");
});

test("mixed_doubles analyse mode with a real benchmark is not limited by raw input spelling", () => {
  const previousSource = process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
  process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = "legacy";
  const metrics = [];
  for (const [metricKey, median] of Object.entries(BASE_MEDIANS)) {
    metrics.push(metric(DOUBLES_MIXED_KEY, metricKey, median));
    metrics.push(metric(DOUBLES_MIXED_SUB_75_KEY, metricKey, metricKey === "total_time" ? 4440 : median));
  }
  setBenchmarkData({
    groups: [
      { groupKey: DOUBLES_MIXED_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "doubles_mixed", gender: "mixed", ageGroup: "30-34", sampleSize: 500 },
      { groupKey: DOUBLES_MIXED_SUB_75_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "doubles_mixed", gender: "mixed", performanceBand: "sub_75", sampleSize: 500 },
    ],
    metrics,
  });

  try {
    const submission = readFixture("balanced_athlete.json");
    submission.athlete.sex = "mixed";
    submission.athlete.division = "mixed_doubles";
    submission.race.division = "mixed_doubles";
    submission.calculatorMode = "analyse";

    const analysis = analyseSubmission(submission);

    assert.ok(analysis.benchmarkContext.primaryBenchmarkGroup);
    assert.equal(analysis.benchmarkContext.primaryBenchmarkGroup.division, "doubles_mixed");
    assert.ok(!analysis.dataQuality.issues.includes("no_benchmark_data"));
    assert.notEqual(analysis.analysisScope, "limited");
    assert.equal(analysis.analysisScope, "full");
  } finally {
    if (previousSource === undefined) {
      delete process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
    } else {
      process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = previousSource;
    }
  }
});

test("fallback rules and analysis scope agree on individual analysis divisions", () => {
  setBenchmarkData({ groups: [], metrics: [] });

  for (const division of INDIVIDUAL_ANALYSIS_DIVISIONS) {
    const submission = readFixture("balanced_athlete.json");
    submission.athlete.division = division;
    submission.race.division = division;
    submission.calculatorMode = "analyse";

    assert.equal(isIndividualDivision(division), true);
    assert.equal(analyseSubmission(submission).analysisScope, "no_benchmark_data");
  }
});

test("potential gain is 0 when user is already faster than median", () => {
  const potential = calculateTimePotential([
    { segmentKey: "wall_balls", type: "station", userSeconds: 250, benchmarkMedianSeconds: 300, benchmarkTopQuartileSeconds: 330 },
  ], normaliseSubmission(readFixture("elite_small_gaps.json")), { primaryBenchmarkGroup: { key: GROUP_KEY } }, { segmentKey: "wall_balls" });
  assert.equal(potential.conservativeGainSeconds, 0);
});

test("goal_based gain is null when no target time supplied", () => {
  const analysis = analyseSubmission(readFixture("wall_ball_gap.json"));
  assert.equal(analysis.timePotential.goalBasedGainSeconds, null);
});

test("target time attaches exact segment targets and uses exact limiter gap", () => {
  const targetFinishTimeSeconds = 4200;
  const fixture = readFixture("wall_ball_gap.json");
  const analysis = analyseSubmission({
    ...fixture,
    race: { ...fixture.race, targetTimeSeconds: targetFinishTimeSeconds },
    athleteContext: { ...(fixture.athleteContext ?? {}), targetFinishTimeSeconds },
  });
  const total = analysis.segments.find((segment) => segment.segmentKey === "total_time");
  const run = analysis.segments.find((segment) => segment.segmentKey === "run_1");
  const limiter = analysis.segments.find((segment) => segment.segmentKey === analysis.headline.biggestLimiter.segmentKey);

  assert.equal(analysis.benchmarkContext.goalBenchmarkGroup.targetFinishSeconds, targetFinishTimeSeconds);
  assert.equal(total.exactTargetSeconds, targetFinishTimeSeconds);
  assert.equal(total.timeGapToExactTargetSeconds, analysis.race.finishTimeSeconds - targetFinishTimeSeconds);
  assert.ok(Number.isFinite(run.exactTargetSeconds));
  assert.ok(Number.isFinite(run.timeGapToExactTargetSeconds));
  assert.equal(
    analysis.timePotential.goalBasedGainSeconds,
    Math.max(0, limiter.timeGapToExactTargetSeconds),
  );
});

test("target mode uses penalty-adjusted exact target gap for strength and limiter selection", () => {
  const targetFinishTimeSeconds = 4140;
  const submission = completeSubmission({
    splitOverrides: { farmers_carry: 245, wall_balls: 370 },
    penalties: [{ station: "farmers_carry", penaltySeconds: 180 }],
    calculatorMode: "target",
  });
  const analysis = analyseSubmission({
    ...submission,
    race: {
      ...submission.race,
      targetTimeSeconds: targetFinishTimeSeconds,
    },
    athleteContext: { targetFinishTimeSeconds },
  });
  const farmers = analysis.segments.find((segment) => segment.segmentKey === "farmers_carry");

  assert.equal(farmers.exactTargetSeconds, 120);
  assert.equal(farmers.timeGapToExactTargetSeconds, 125);
  assert.equal(farmers.timeGapToExactTargetSecondsNetOfPenalty, -55);
  assert.equal(farmers.frameGapSeconds, 125);
  assert.equal(farmers.frameGapNetOfPenaltySeconds, -55);
  assert.equal(analysis.headline.biggestStrength?.segmentKey, "farmers_carry");
  assert.notEqual(analysis.headline.biggestLimiter?.segmentKey, "farmers_carry");
  assert.equal(analysis.headline.biggestLimiter?.segmentKey, "wall_balls");
});

test("calculateSegmentStats adds net-of-penalty fields without changing raw gaps", () => {
  const submission = completeSubmission({
    splitOverrides: { farmers_carry: 320, wall_balls: 370 },
    penalties: [{ station: "farmers_carry", penaltySeconds: 300 }],
  });
  const stats = calculateSegmentStats(normaliseSubmission(submission), {
    primaryBenchmarkGroup: {
      key: GROUP_KEY,
      datasetVersion: "historical_hyrox_2026_06_v1",
      division: "open",
      gender: "male",
      ageGroup: "30-34",
    },
  });
  const farmers = stats.find((segment) => segment.segmentKey === "farmers_carry");
  const wallBalls = stats.find((segment) => segment.segmentKey === "wall_balls");

  assert.equal(farmers.userSeconds, 320);
  assert.equal(farmers.timeGapToMedianSeconds, 200);
  assert.equal(farmers.userSecondsNetOfPenalty, 20);
  assert.equal(farmers.timeGapToMedianSecondsNetOfPenalty, -100);
  assert.equal(wallBalls.userSecondsNetOfPenalty, wallBalls.userSeconds);
  assert.equal(wallBalls.timeGapToMedianSecondsNetOfPenalty, wallBalls.timeGapToMedianSeconds);
});

test("station breakdown ranks by net-of-penalty gap so a penalized strength is not a weakness", () => {
  const analysis = analyseSubmission(completeSubmission({
    splitOverrides: { farmers_carry: 320, wall_balls: 370 },
    penalties: [{ station: "farmers_carry", penaltySeconds: 300 }],
  }));
  const farmersSegment = analysis.segments.find((segment) => segment.segmentKey === "farmers_carry");
  const farmersBreakdown = analysis.stationBreakdown.find((station) => station.segmentKey === "farmers_carry");
  const weakStations = analysis.stationBreakdown.filter((station) => station.timeGapSeconds > 0).map((station) => station.segmentKey);

  assert.equal(farmersSegment.timeGapToMedianSeconds, 200);
  assert.equal(farmersSegment.timeGapToMedianSecondsNetOfPenalty, -100);
  assert.equal(farmersSegment.frameGapSeconds, 200);
  assert.equal(farmersSegment.frameGapNetOfPenaltySeconds, -100);
  assert.equal(farmersBreakdown.timeGapSeconds, -100);
  assert.equal(weakStations.includes("farmers_carry"), false);
  assert.equal(weakStations[0], "wall_balls");
});

test("analyse mode keeps frame gaps on benchmark medians after exact-target penalty adjustment", () => {
  const analysis = analyseSubmission(completeSubmission({
    splitOverrides: { farmers_carry: 320, wall_balls: 370 },
    penalties: [{ station: "farmers_carry", penaltySeconds: 300 }],
    calculatorMode: "analyse",
  }));
  const farmers = analysis.segments.find((segment) => segment.segmentKey === "farmers_carry");

  assert.equal(farmers.exactTargetSeconds, null);
  assert.equal(farmers.timeGapToExactTargetSeconds, null);
  assert.equal(farmers.timeGapToExactTargetSecondsNetOfPenalty, null);
  assert.equal(farmers.frameGapSeconds, 200);
  assert.equal(farmers.frameGapNetOfPenaltySeconds, -100);
  assert.equal(analysis.headline.biggestStrength?.segmentKey, "farmers_carry");
  assert.notEqual(analysis.headline.biggestLimiter?.segmentKey, "farmers_carry");
});

test("biggest limiter and strength use net-of-penalty gaps", () => {
  const segments = [
    { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", frameGapSeconds: 200, frameGapNetOfPenaltySeconds: -100, timeGapToMedianSeconds: 200, percentile: 20, confidence: "high" },
    { segmentKey: "wall_balls", label: "Wall Balls", type: "station", frameGapSeconds: 70, frameGapNetOfPenaltySeconds: 70, timeGapToMedianSeconds: 70, percentile: 35, confidence: "high" },
  ];
  const limiter = findBiggestLimiter(segments);
  const strength = findBiggestStrength(segments);

  assert.equal(limiter.segmentKey, "wall_balls");
  assert.equal(limiter.timeGapSeconds, 70);
  assert.equal(strength.segmentKey, "farmers_carry");
  assert.equal(strength.timeAdvantageSeconds, 100);
});

test("browser summary separates penalty fastest win from the penalty-adjusted fitness limiter", () => {
  const analysis = analyseSubmission(completeSubmission({
    splitOverrides: { farmers_carry: 320, wall_balls: 370 },
    penalties: [{ station: "farmers_carry", penaltySeconds: 300 }],
  }));
  const summary = buildBrowserSummary(analysis, [], {}, analysis.calculatorMode);

  assert.equal(analysis.headline.biggestLimiter.segmentKey, "wall_balls");
  assert.notEqual(analysis.headline.biggestLimiter.segmentKey, "farmers_carry");
  assert.equal(summary.heroInsight.title, "Penalties are your fastest controllable win");
  assert.equal(summary.fastestControllableWin.label, "Penalties");
  assert.equal(summary.fastestControllableWin.timeGapFormatted, "5:00");
  assert.equal(summary.largestFitnessLimiter.label, "Wall Balls");
  assert.equal(summary.biggestLimiter.label, "Wall Balls");
});

test("no penalties leave net-of-penalty fields equal to raw fields", () => {
  const analysis = analyseSubmission(completeSubmission());

  for (const segment of analysis.segments) {
    assert.equal(segment.userSecondsNetOfPenalty, segment.userSeconds, `${segment.segmentKey} user seconds should be unchanged`);
    assert.equal(segment.timeGapToMedianSecondsNetOfPenalty, segment.timeGapToMedianSeconds, `${segment.segmentKey} median gap should be unchanged`);
    assert.equal(segment.frameGapNetOfPenaltySeconds, segment.frameGapSeconds, `${segment.segmentKey} frame gap should be unchanged`);
  }
  assert.equal(analysis.headline.biggestLimiter, null);
  assert.equal(analysis.athleteArchetype.key, "balanced_hybrid");
});

test("analyse mode uses achieved band cohort for top-level and segment gaps", () => {
  const analysis = analyseSubmission({
    ...readFixture("elite_small_gaps.json"),
    calculatorMode: "analyse",
  });
  const total = analysis.segments.find((segment) => segment.segmentKey === "total_time");
  const run1 = analysis.segments.find((segment) => segment.segmentKey === "run_1");

  assert.equal(analysis.benchmarkContext.achievedBand, "sub_60");
  assert.equal(analysis.benchmarkContext.primaryBenchmarkGroup.key, SUB_60_BAND_KEY);
  assert.equal(analysis.benchmarkContext.demographicBenchmarkGroup.key, GROUP_KEY);
  assert.equal(analysis.benchmarkContext.nextBand, null);
  assert.equal(analysis.benchmarkContext.goalBenchmarkGroup, null);
  assert.equal(total.benchmarkGroupUsed, SUB_60_BAND_KEY);
  assert.equal(total.benchmarkMedianSeconds, 3420);
  assert.equal(total.timeGapToMedianSeconds, 80);
  assert.equal(run1.benchmarkGroupUsed, SUB_60_BAND_KEY);
  assert.equal(run1.benchmarkMedianSeconds, 270);
});

test("analyse email shows directional caveat when achieved band is below sample floor", () => {
  const metrics = [];
  for (const [metricKey, median] of Object.entries(BASE_MEDIANS)) {
    metrics.push(metric(GROUP_KEY, metricKey, median, 500));
    metrics.push(metric(SUB_75_BAND_KEY, metricKey, metricKey === "total_time" ? 4440 : median, 40));
  }
  setBenchmarkData({
    groups: [
      { groupKey: GROUP_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", ageGroup: "30-34", sampleSize: 500 },
      { groupKey: SUB_75_BAND_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", performanceBand: "sub_75", sampleSize: 40 },
    ],
    metrics,
  });

  const analysis = analyseSubmission({
    ...readFixture("balanced_athlete.json"),
    calculatorMode: "analyse",
  });
  const email = buildEmailReport({ sections: [] }, analysis, {}, null, "analyse");

  assert.equal(analysis.benchmarkContext.achievedBand, "sub_75");
  assert.equal(analysis.benchmarkContext.confidenceLabel, "insufficient");
  assert.equal(analysis.benchmarkContext.primaryBenchmarkGroup.key, GROUP_KEY);
  assert.match(email.htmlBody, /treat scores as directional/i);
  assert.match(email.htmlBody, /sub-75 - Open Male 30-34 \(directional\)/i);
});

test("analyse email omits directional caveat when achieved band has enough samples", () => {
  const analysis = analyseSubmission({
    ...readFixture("balanced_athlete.json"),
    calculatorMode: "analyse",
  });
  const email = buildEmailReport({ sections: [] }, analysis, {}, null, "analyse");

  assert.equal(analysis.benchmarkContext.achievedBand, "sub_75");
  assert.equal(analysis.benchmarkContext.confidenceLabel, "strong");
  assert.equal(analysis.benchmarkContext.primaryBenchmarkGroup.key, SUB_75_BAND_KEY);
  assert.doesNotMatch(email.htmlBody, /treat scores as directional/i);
  assert.doesNotMatch(email.htmlBody, /sub-75 - Open Male \(directional\)/i);
});

test("analyse mode switches frame gaps to next band when athlete beats achieved band median", () => {
  const fixture = readFixture("elite_small_gaps.json");
  const analysis = analyseSubmission({
    ...fixture,
    race: { ...fixture.race, finishTimeSeconds: 4047 },
    calculatorMode: "analyse",
  });
  const total = analysis.segments.find((segment) => segment.segmentKey === "total_time");
  const wallBalls = analysis.segments.find((segment) => segment.segmentKey === "wall_balls");

  assert.equal(analysis.benchmarkContext.achievedBand, "sub_70");
  assert.equal(analysis.benchmarkContext.analysisFrame.frame, "next_band");
  assert.equal(analysis.benchmarkContext.analysisFrame.comparisonBand, "sub_65");
  assert.equal(total.benchmarkGroupUsed, GOAL_BAND_KEY);
  assert.equal(total.timeGapToMedianSeconds, -93);
  assert.equal(total.nextBandMedianSeconds, 3900);
  assert.equal(total.frameGapSeconds, 147);
  assert.equal(wallBalls.nextBandMedianSeconds, 240);
  assert.equal(wallBalls.frameGapSeconds, 10);
});

test("analyse mode uses penalty-adjusted band as escalation basis when material penalties cross a bracket", () => {
  const fixture = readFixture("elite_small_gaps.json");
  const analysis = analyseSubmission({
    ...fixture,
    race: { ...fixture.race, finishTimeSeconds: 77 * 60 + 7 },
    penalties: [{ station: "farmers_carry", penaltySeconds: 300 }],
    calculatorMode: "analyse",
  });
  const total = analysis.segments.find((segment) => segment.segmentKey === "total_time");

  assert.equal(analysis.benchmarkContext.achievedBand, "sub_80");
  assert.equal(analysis.benchmarkContext.primaryBenchmarkGroup.key, SUB_80_BAND_KEY);
  assert.equal(analysis.benchmarkContext.escalationBasisBand, "sub_75");
  assert.equal(analysis.benchmarkContext.escalationBasisBandGroup.key, SUB_75_BAND_KEY);
  assert.equal(analysis.benchmarkContext.nextBand, "sub_70");
  assert.equal(analysis.benchmarkContext.nextBandGroup.key, GOAL_BAND_KEY);
  assert.equal(analysis.benchmarkContext.analysisFrame.comparisonBand, "sub_70");
  assert.equal(analysis.benchmarkContext.analysisFrame.gapToBandMedianSeconds, -113);
  assert.equal(total.benchmarkGroupUsed, SUB_80_BAND_KEY);
  assert.equal(total.nextBandMedianSeconds, 4140);
});

test("penalty-adjusted reclassification-only frames attach escalation-basis segment stats", () => {
  const fixture = readFixture("elite_small_gaps.json");
  const analysis = analyseSubmission({
    ...fixture,
    race: { ...fixture.race, finishTimeSeconds: 75 * 60 + 7 },
    penalties: [{ station: "farmers_carry", penaltySeconds: 60 }],
    calculatorMode: "analyse",
  });
  const total = analysis.segments.find((segment) => segment.segmentKey === "total_time");
  const run1 = analysis.segments.find((segment) => segment.segmentKey === "run_1");

  assert.equal(analysis.benchmarkContext.achievedBand, "sub_80");
  assert.equal(analysis.benchmarkContext.primaryBenchmarkGroup.key, SUB_80_BAND_KEY);
  assert.equal(analysis.benchmarkContext.escalationBasisBand, "sub_75");
  assert.equal(analysis.benchmarkContext.escalationBasisBandGroup.key, SUB_75_BAND_KEY);
  assert.equal(analysis.benchmarkContext.analysisFrame.frame, "competitive");
  assert.equal(analysis.benchmarkContext.analysisFrame.comparisonBand, "sub_75");
  assert.equal(total.benchmarkMedianSeconds, 4680);
  assert.equal(total.nextBandMedianSeconds, 4440);
  assert.equal(total.frameGapSeconds, 67);
  assert.equal(run1.benchmarkMedianSeconds, 320);
  assert.equal(run1.nextBandMedianSeconds, 300);
  assert.equal(run1.frameGapSeconds, -50);
});

test("comparison-band frame gaps remain penalty-aware for station breakdown and limiters", () => {
  const fixture = readFixture("elite_small_gaps.json");
  const splits = fixture.splits.map((split) => split.segmentKey === "farmers_carry"
    ? { ...split, timeSeconds: 240 }
    : split);
  const analysis = analyseSubmission({
    ...fixture,
    splits,
    race: { ...fixture.race, finishTimeSeconds: 75 * 60 + 7 },
    penalties: [{ station: "farmers_carry", penaltySeconds: 180 }],
    calculatorMode: "analyse",
  });
  const farmers = analysis.segments.find((segment) => segment.segmentKey === "farmers_carry");
  const farmersBreakdown = analysis.stationBreakdown.find((station) => station.segmentKey === "farmers_carry");
  const weakStations = analysis.stationBreakdown.filter((station) => station.timeGapSeconds > 0).map((station) => station.segmentKey);

  assert.equal(analysis.benchmarkContext.achievedBand, "sub_80");
  assert.equal(analysis.benchmarkContext.escalationBasisBand, "sub_75");
  assert.equal(analysis.benchmarkContext.analysisFrame.comparisonBand, "sub_70");
  assert.equal(farmers.nextBandMedianSeconds, 120);
  assert.equal(farmers.timeGapToNextBandMedianSeconds, 120);
  assert.equal(farmers.timeGapToNextBandMedianSecondsNetOfPenalty, -60);
  assert.equal(farmers.frameGapSeconds, 120);
  assert.equal(farmers.frameGapNetOfPenaltySeconds, -60);
  assert.equal(farmersBreakdown.timeGapSeconds, -60);
  assert.equal(weakStations.includes("farmers_carry"), false);
  assert.notEqual(analysis.headline.biggestLimiter?.segmentKey, "farmers_carry");
  assert.equal(analysis.headline.biggestStrength?.segmentKey, "farmers_carry");
});

test("material penalties do not change escalation basis when adjusted time stays in the raw band", () => {
  const fixture = readFixture("elite_small_gaps.json");
  const analysis = analyseSubmission({
    ...fixture,
    race: { ...fixture.race, finishTimeSeconds: 77 * 60 + 7 },
    penalties: [{ station: "farmers_carry", penaltySeconds: 60 }],
    calculatorMode: "analyse",
  });

  assert.equal(analysis.benchmarkContext.achievedBand, "sub_80");
  assert.equal(analysis.benchmarkContext.escalationBasisBand, "sub_80");
  assert.equal(analysis.benchmarkContext.nextBand, "sub_75");
  assert.equal(analysis.benchmarkContext.analysisFrame.comparisonBand, "sub_75");
  assert.equal(analysis.segments.find((segment) => segment.segmentKey === "run_1").nextBandMedianSeconds, 300);
});

test("non-material penalties do not change escalation basis", () => {
  const fixture = readFixture("elite_small_gaps.json");
  const analysis = analyseSubmission({
    ...fixture,
    race: { ...fixture.race, finishTimeSeconds: 78 * 60 + 30 },
    penalties: [{ station: "farmers_carry", penaltySeconds: 20 }],
    calculatorMode: "analyse",
  });

  assert.equal(analysis.benchmarkContext.achievedBand, "sub_80");
  assert.equal(analysis.benchmarkContext.escalationBasisBand, "sub_80");
  assert.equal(analysis.benchmarkContext.nextBand, "sub_75");
  assert.equal(analysis.benchmarkContext.analysisFrame.comparisonBand, "sub_80");
  assert.equal(analysis.segments.find((segment) => segment.segmentKey === "run_1").nextBandMedianSeconds, undefined);
});

test("suppressed penalty-adjusted escalation basis falls back to raw-band behavior", () => {
  const metrics = [];
  for (const [metricKey, median] of Object.entries(BASE_MEDIANS)) {
    metrics.push(metric(GROUP_KEY, metricKey, median, 500));
    metrics.push(metric(FALLBACK_KEY, metricKey, median, 600));
    metrics.push(metric(SUB_80_BAND_KEY, metricKey, metricKey === "total_time" ? 4680 : median + 20, 500));
  }
  setBenchmarkData({
    groups: [
      { groupKey: GROUP_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", ageGroup: "30-34", sampleSize: 500 },
      { groupKey: FALLBACK_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", ageGroup: null, fallbackLevel: 1, sampleSize: 600 },
      { groupKey: SUB_80_BAND_KEY, datasetVersion: "historical_hyrox_2026_06_v1", division: "open", gender: "male", performanceBand: "sub_80", sampleSize: 500 },
    ],
    metrics,
  });

  const fixture = readFixture("elite_small_gaps.json");
  const analysis = analyseSubmission({
    ...fixture,
    race: { ...fixture.race, finishTimeSeconds: 77 * 60 + 7 },
    penalties: [{ station: "farmers_carry", penaltySeconds: 300 }],
    calculatorMode: "analyse",
  });

  assert.equal(analysis.benchmarkContext.achievedBand, "sub_80");
  assert.equal(analysis.benchmarkContext.escalationBasisBand, "sub_80");
  assert.equal(analysis.benchmarkContext.escalationBasisBandGroup.key, SUB_80_BAND_KEY);
  assert.equal(analysis.benchmarkContext.nextBand, "sub_75");
  assert.equal(analysis.benchmarkContext.nextBandGroup, null);
});

test("missing age group uses fallback benchmark", () => {
  const analysis = analyseSubmission(readFixture("missing_age_group.json"));
  assert.equal(analysis.benchmarkContext.primaryBenchmarkGroup.key, FALLBACK_KEY);
  assert.ok(analysis.benchmarkContext.fallbacksUsed.length > 0);
});

test("partial splits exclude missing stations from score", () => {
  const analysis = analyseSubmission(readFixture("partial_splits.json"));
  assert.equal(analysis.segments.some((segment) => segment.segmentKey === "wall_balls"), false);
  assert.equal(analysis.analysisScope, "partial");
});

test("archetype classifier can fire balanced_transition_limited directly", () => {
  const archetype = classifyArchetype({ engineScore: 50, strengthScore: 52, executionScore: 30 }, { athleteContext: {} }, { available: false }, null, null, []);
  assert.equal(archetype.key, "balanced_transition_limited");
});

test("limiter ranks by largest seconds gap when percentiles disagree", () => {
  const limiter = findBiggestLimiter([
    { segmentKey: "sled_push", label: "Sled Push", type: "station", timeGapToMedianSeconds: 60, percentile: 40, confidence: "high" },
    { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapToMedianSeconds: 55, percentile: 20, confidence: "high" },
  ]);
  assert.equal(limiter.segmentKey, "sled_push");
});

test("balanced_athlete fixture produces stable AnalysisJSON snapshot", (t) => {
  const analysis = analyseSubmission(readFixture("balanced_athlete.json"));
  assert.equal(analysis.analysisVersion, "hyrox_engine_v1.0.0");
  assert.equal(analysis.analysisScope, "full");
  assert.equal(analysis.segments.length, 28);
  assert.deepEqual({
    scores: analysis.scores,
    archetype: analysis.athleteArchetype.key,
    limiter: analysis.headline.biggestLimiter,
    strength: analysis.headline.biggestStrength,
    roxzoneMode: analysis.roxzoneAnalysis.mode,
    focusCount: analysis.recommendedFocusAreas.length,
  }, {
    scores: {
      overallPerformanceScore: 50,
      engineScore: 50,
      strengthScore: 50,
      bodyweightGritScore: 50,
      executionScore: 60,
      hybridBalanceScore: 100,
      raceEfficiencyScore: 57,
    },
    archetype: "balanced_hybrid",
    limiter: null,
    strength: null,
    roxzoneMode: "explicit_splits",
    focusCount: 0,
  });
});

test("segment map still provides all core split keys", () => {
  const keys = new Set(SEGMENT_MAP.map((segment) => segment.segmentKey));
  for (const key of [...RUN_KEYS, ...STATION_KEYS, ...ROXZONE_KEYS]) {
    assert.equal(keys.has(key), true);
  }
});

// ── fixture 5: high_roxzone ───────────────────────────────────────────────────

test("high_roxzone fixture has low roxzone percentile and first_timer or balanced_transition archetype", () => {
  const analysis = analyseSubmission(readFixture("high_roxzone.json"));
  assert.ok(
    (analysis.roxzoneAnalysis.percentile ?? 100) < 40,
    `expected roxzone percentile < 40, got ${analysis.roxzoneAnalysis.percentile}`,
  );
  const validArchetypes = ["first_timer_execution_leak", "balanced_transition_limited"];
  assert.ok(
    validArchetypes.includes(analysis.athleteArchetype.key),
    `expected archetype in ${JSON.stringify(validArchetypes)}, got ${analysis.athleteArchetype.key}`,
  );
});

// ── archetype for wall_ball_gap ───────────────────────────────────────────────

test("wall_ball_gap fixture classifies as wall_ball_bottleneck", () => {
  const analysis = analyseSubmission(readFixture("wall_ball_gap.json"));
  assert.equal(analysis.athleteArchetype.key, "wall_ball_bottleneck");
});

// ── synthetic archetype unit tests (one per key not otherwise covered) ───────

test("archetype classifier fires late_fade_athlete on fade materially above benchmark", () => {
  const archetype = classifyArchetype(
    { engineScore: 50, strengthScore: 50, executionScore: 50 },
    { athleteContext: {} },
    { available: true, runFadePct: 15, interpretation: "materially_above_benchmark" },
    null,
    null,
    [],
  );
  assert.equal(archetype.key, "late_fade_athlete");
});

test("archetype classifier fires wall_ball_bottleneck when wall_balls limiter gap exceeds threshold", () => {
  const archetype = classifyArchetype(
    { engineScore: 50, strengthScore: 50, executionScore: 50 },
    { athleteContext: {} },
    { available: false },
    null,
    { segmentKey: "wall_balls", timeGapSeconds: 90 },
    [],
  );
  assert.equal(archetype.key, "wall_ball_bottleneck");
});

test("archetype classifier uses configured wall-ball limiter threshold", () => {
  const threshold = BENCHMARK_THRESHOLDS.wallBallBottleneckGapSeconds;
  const baseScores = { engineScore: 50, strengthScore: 50, executionScore: 50 };
  const below = classifyArchetype(
    baseScores,
    { athleteContext: {} },
    { available: false },
    null,
    { segmentKey: "wall_balls", timeGapSeconds: threshold - 1 },
    [],
  );
  const above = classifyArchetype(
    baseScores,
    { athleteContext: {} },
    { available: false },
    null,
    { segmentKey: "wall_balls", timeGapSeconds: threshold + 1 },
    [],
  );

  assert.notEqual(below.key, "wall_ball_bottleneck");
  assert.equal(above.key, "wall_ball_bottleneck");
});

test("archetype classifier uses configured wall-ball segment-gap threshold", () => {
  const threshold = BENCHMARK_THRESHOLDS.wallBallBottleneckGapSeconds;
  const baseScores = { engineScore: 56, strengthScore: 72, executionScore: 50 };
  const below = classifyArchetype(
    baseScores,
    { athleteContext: {} },
    { available: false },
    null,
    null,
    [{ segmentKey: "wall_balls", type: "station", timeGapToMedianSeconds: threshold - 1 }],
  );
  const above = classifyArchetype(
    baseScores,
    { athleteContext: {} },
    { available: false },
    null,
    null,
    [{ segmentKey: "wall_balls", type: "station", timeGapToMedianSeconds: threshold + 1 }],
  );

  assert.notEqual(below.key, "wall_ball_bottleneck");
  assert.equal(above.key, "wall_ball_bottleneck");
});

test("archetype classifier uses net-of-penalty wall-ball gaps", () => {
  const threshold = BENCHMARK_THRESHOLDS.wallBallBottleneckGapSeconds;
  const archetype = classifyArchetype(
    { engineScore: 56, strengthScore: 72, executionScore: 50 },
    { athleteContext: {} },
    { available: false },
    null,
    null,
    [{
      segmentKey: "wall_balls",
      type: "station",
      timeGapToMedianSeconds: threshold + 100,
      timeGapToMedianSecondsNetOfPenalty: threshold - 1,
    }],
  );

  assert.notEqual(archetype.key, "wall_ball_bottleneck");
});

test("archetype classifier uses configured elite marginal-gains thresholds", () => {
  const scoreThreshold = BENCHMARK_THRESHOLDS.eliteOverallPercentile;
  const stationGapThreshold = BENCHMARK_THRESHOLDS.eliteMaxStationGapSeconds;
  const stationGapsBelowThreshold = [
    { segmentKey: "ski_erg", type: "station", timeGapToMedianSeconds: stationGapThreshold - 1 },
    { segmentKey: "wall_balls", type: "station", timeGapToMedianSeconds: stationGapThreshold - 1 },
  ];

  const belowScore = classifyArchetype(
    { overallPerformanceScore: scoreThreshold, engineScore: 56, strengthScore: 72, executionScore: 50 },
    { athleteContext: {} },
    { available: false },
    null,
    null,
    stationGapsBelowThreshold,
  );
  const gapAtThreshold = classifyArchetype(
    { overallPerformanceScore: scoreThreshold + 1, engineScore: 56, strengthScore: 72, executionScore: 50 },
    { athleteContext: {} },
    { available: false },
    null,
    null,
    [{ segmentKey: "ski_erg", type: "station", timeGapToMedianSeconds: stationGapThreshold }],
  );
  const aboveScoreWithGapsBelowThreshold = classifyArchetype(
    { overallPerformanceScore: scoreThreshold + 1, engineScore: 56, strengthScore: 72, executionScore: 50 },
    { athleteContext: {} },
    { available: false },
    null,
    null,
    stationGapsBelowThreshold,
  );

  assert.notEqual(belowScore.key, "elite_marginal_gains");
  assert.notEqual(gapAtThreshold.key, "elite_marginal_gains");
  assert.equal(aboveScoreWithGapsBelowThreshold.key, "elite_marginal_gains");
});

test("archetype classifier uses net-of-penalty station gaps for elite checks", () => {
  const stationGapThreshold = BENCHMARK_THRESHOLDS.eliteMaxStationGapSeconds;
  const archetype = classifyArchetype(
    { overallPerformanceScore: BENCHMARK_THRESHOLDS.eliteOverallPercentile + 1, engineScore: 56, strengthScore: 72, executionScore: 50 },
    { athleteContext: {} },
    { available: false },
    null,
    null,
    [{
      segmentKey: "ski_erg",
      type: "station",
      timeGapToMedianSeconds: stationGapThreshold + 100,
      timeGapToMedianSecondsNetOfPenalty: stationGapThreshold - 1,
    }],
  );

  assert.equal(archetype.key, "elite_marginal_gains");
});

test("archetype classifier fires first_timer_execution_leak for zero races and poor roxzone", () => {
  const archetype = classifyArchetype(
    { engineScore: 50, strengthScore: 50, executionScore: 50 },
    { athleteContext: { previousHyroxRaces: 0 } },
    { available: false },
    { available: true, percentile: 20 },
    null,
    [],
  );
  assert.equal(archetype.key, "first_timer_execution_leak");
});

// ── degraded mode ─────────────────────────────────────────────────────────────

test("returns analysisScope no_benchmark_data when benchmark data is unavailable", () => {
  setBenchmarkData({ groups: [], metrics: [] });
  const analysis = analyseSubmission(readFixture("balanced_athlete.json"));
  assert.equal(analysis.analysisScope, "no_benchmark_data");
  assert.equal(analysis.dataQuality.confidence, "low");
  assert.ok(analysis.dataQuality.issues.includes("no_benchmark_data"));
  assert.deepEqual(analysis.segments, []);
});
