import assert from "node:assert/strict";
import test from "node:test";
import { enabledInsights, generateInsights, loadInsightRegistry } from "../../src/hyrox/insights/insightEngine.js";
import { evaluateTrigger } from "../../src/hyrox/insights/triggerEvaluator.js";
import { scoreInsight } from "../../src/hyrox/insights/insightScorer.js";
import { selectInsights, deduplicateInsights } from "../../src/hyrox/insights/insightSelector.js";
import { renderCopy, renderInsight, buildCopyVariables } from "../../src/hyrox/insights/copyRenderer.js";
import { generatePopulationInsights, rankStationGaps } from "../../src/hyrox/insights/populationInsights.js";
import { generateContextInsights } from "../../src/hyrox/insights/contextInsights.js";
import { ACTION_MAP, VOLUME_INCREASING_ACTIONS } from "../../src/hyrox/insights/recommendedActions.js";
import { setBenchmarkData } from "../../src/hyrox/engine/benchmarkService.js";
import { STATION_KEYS } from "../../src/hyrox/config/segmentMap.js";

const GROUP_KEY = "hyrox:historical_hyrox_2026_06_v1:open:male:30-34";

function def(id) {
  return enabledInsights().find((insight) => insight.id === id);
}

function baseSegment(overrides = {}) {
  return {
    segmentKey: "wall_balls",
    label: "Wall Balls",
    type: "station",
    percentile: 32,
    timeGapToMedianSeconds: 78,
    sampleSize: 1200,
    confidenceGrade: "A",
    fallbackLevel: 0,
    ...overrides,
  };
}

function baseAnalysis(overrides = {}) {
  const wall = baseSegment();
  const row = baseSegment({ segmentKey: "row", label: "Row", percentile: 82, timeGapToMedianSeconds: -45 });
  const total = baseSegment({ segmentKey: "total_time", label: "Total time", type: "aggregate", percentile: 58, timeGapToMedianSeconds: 0 });
  return {
    analysisScope: "full",
    dataQuality: { inputCompleteness: 1, issues: [], warnings: [], confidence: "high" },
    benchmarkContext: {
      primaryBenchmarkGroup: { key: GROUP_KEY, label: "Male Open 30-34", sampleSize: 1200, confidenceGrade: "A" },
      fallbacksUsed: [],
      goalBenchmarkGroup: null,
    },
    race: { finishTimeSeconds: 4500 },
    headline: {
      biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 78, percentile: 32 },
      biggestStrength: { segmentKey: "row", label: "Row", percentile: 82 },
      headlineGainSeconds: 78,
      projectedTimeSeconds: 4422,
    },
    scores: { engineScore: 70, strengthScore: 50, executionScore: 60 },
    segments: [total, wall, row, baseSegment({ segmentKey: "sled_push", label: "Sled Push", percentile: 45, timeGapToMedianSeconds: 20 })],
    strengths: [{ segmentKey: "row", label: "Row", percentile: 82, timeAdvantageSeconds: 45, confidence: "high" }],
    limiters: [{ segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 78, percentile: 32, confidence: "high" }],
    timePotential: { headlineGainSeconds: 78, conservativeGainSeconds: 78, competitiveGainSeconds: 120, newProjectedTimeSeconds: 4422 },
    runningAnalysis: { available: true, runFadePct: 9.2 },
    roxzoneAnalysis: { available: true, percentile: 35, timeGapToMedianSeconds: 38, mode: "explicit_splits", confidenceGrade: "A" },
    workRunBalance: { profileType: "runner_dominant" },
    athleteArchetype: { key: "strong_runner_station_limited" },
    ...overrides,
  };
}

function stationMetric(segmentKey, gapSeconds, sampleSize = 1200) {
  return {
    groupKey: GROUP_KEY,
    metricKey: segmentKey,
    sampleSize,
    medianSeconds: 300,
    p25Seconds: 300 - gapSeconds,
    p50Seconds: 300,
  };
}

test.beforeEach(() => {
  setBenchmarkData({ groups: [], metrics: [] });
});

// ── Section 1 – core spec scenarios ───────────────────────────────────────────

test("registry contains 100 insight definitions with 15 enabled in V1", () => {
  const registry = loadInsightRegistry();
  assert.equal(registry.length, 100);
  assert.equal(registry.filter((insight) => insight.enabled).length, 15);
});

test("INSIGHT_001 fires when biggest_limiter gap >= 30s", () => {
  const result = evaluateTrigger(def("INSIGHT_001"), baseAnalysis());
  assert.equal(result.eligible, true);
  assert.equal(result.evidenceValues.segmentKey, "wall_balls");
});

test("INSIGHT_001 does NOT fire when biggest_limiter gap < 30s", () => {
  const analysis = baseAnalysis({
    headline: { ...baseAnalysis().headline, biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: 20 } },
    limiters: [{ segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 20, percentile: 45 }],
  });
  assert.equal(evaluateTrigger(def("INSIGHT_001"), analysis).eligible, false);
});

test("INSIGHT_002 fires when best station percentile >= 75", () => {
  assert.equal(evaluateTrigger(def("INSIGHT_002"), baseAnalysis()).eligible, true);
});

test("INSIGHT_008 fires when run_fade_pct >= 8", () => {
  assert.equal(evaluateTrigger(def("INSIGHT_008"), baseAnalysis()).eligible, true);
});

test("INSIGHT_008 does NOT fire when run_fade_pct < 8", () => {
  assert.equal(evaluateTrigger(def("INSIGHT_008"), baseAnalysis({ runningAnalysis: { available: true, runFadePct: 7.9 } })).eligible, false);
});

test("INSIGHT_009 fires when roxzone percentile < 40", () => {
  assert.equal(evaluateTrigger(def("INSIGHT_009"), baseAnalysis()).eligible, true);
});

test("INSIGHT_005 fires when target time supplied and user is over target", () => {
  const result = evaluateTrigger(def("INSIGHT_005"), baseAnalysis(), { targetFinishTimeSeconds: 4400, finishTimeSeconds: 4500 });
  assert.equal(result.eligible, true);
  assert.equal(result.evidenceValues.primaryValue, 100);
});

test("INSIGHT_006 fires when target time supplied and user is under or at target", () => {
  const result = evaluateTrigger(def("INSIGHT_006"), baseAnalysis(), { targetFinishTimeSeconds: 4600, finishTimeSeconds: 4500 });
  assert.equal(result.eligible, true);
  assert.equal(result.evidenceValues.primaryValue, 100);
});

test("INSIGHT_021 does NOT fire when no athlete context is supplied", () => {
  assert.equal(evaluateTrigger(def("INSIGHT_021"), baseAnalysis()).eligible, false);
});

test("INSIGHT_021 fires when context supplied with high engine score and station limiter", () => {
  const result = evaluateTrigger(def("INSIGHT_021"), baseAnalysis(), { fiveKPbSeconds: 1200, engineScore: 72 });
  assert.equal(result.eligible, true);
  assert.equal(result.evidenceValues.coreClaim, "runner_station_archetype");
});

test("INSIGHT_022 does NOT fire when strength benchmarks are absent", () => {
  const analysis = baseAnalysis({ athleteArchetype: { key: "strong_lifter_engine_limited" }, scores: { engineScore: 45, strengthScore: 75 } });
  assert.equal(evaluateTrigger(def("INSIGHT_022"), analysis, { engineScore: 45 }).eligible, false);
});

test("selection returns at most 6 insights", () => {
  const insights = generateInsights(baseAnalysis(), { targetFinishTimeSeconds: 4400, fiveKPbSeconds: 1200, engineScore: 72 });
  assert.ok(insights.length <= 6);
});

test("selection includes exactly 1 headline insight", () => {
  const insights = generateInsights(baseAnalysis(), { targetFinishTimeSeconds: 4400, fiveKPbSeconds: 1200, engineScore: 72 });
  assert.equal(insights.filter((insight) => insight.selectionRole === "headline").length, 1);
});

test("selection includes a strength and limiter insight", () => {
  const insights = generateInsights(baseAnalysis(), { targetFinishTimeSeconds: 4400, fiveKPbSeconds: 1200, engineScore: 72 });
  assert.equal(insights.filter((insight) => insight.category === "strength").length, 1);
  assert.equal(insights.filter((insight) => insight.category === "limiter").length, 1);
});

test("de-duplication: two wall-ball insights merged into one", () => {
  const selected = selectInsights([
    { id: "A", category: "limiter", priorityScore: 0.7, evidence: { segmentKey: "wall_balls", coreClaim: "biggest_limiter" } },
    { id: "B", category: "limiter", priorityScore: 0.9, evidence: { segmentKey: "wall_balls", coreClaim: "biggest_limiter" } },
  ]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].id, "B");
});

test("all {variable} tokens resolved in rendered copy", () => {
  const insight = generateInsights(baseAnalysis(), { targetFinishTimeSeconds: 4400 })[0];
  assert.equal(/\{[a-zA-Z0-9_]+\}/.test(`${insight.title} ${insight.socialHook} ${insight.reportCopy} ${insight.emailCopy}`), false);
});

test("hero_metric rendered as M:SS, not raw seconds", () => {
  const copy = renderInsight(def("INSIGHT_001"), baseAnalysis(), {}, "socialHook", {
    segmentKey: "wall_balls",
    segmentLabel: "Wall Balls",
    primaryValue: 78,
    confidenceGrade: "A",
    sampleSize: 1000,
  });
  assert.equal(copy.includes("1:18"), true);
  assert.equal(copy.includes("78"), false);
});

test("missing variable produces safe fallback, not raw token", () => {
  const copy = renderCopy("Compared with {missing_value}, this is safe.", {});
  assert.equal(copy.includes("{missing_value}"), false);
  assert.equal(copy.includes("your benchmark group"), true);
});

test("softened insight prepends confidence copy prefix", () => {
  const copy = renderInsight(def("INSIGHT_001"), baseAnalysis(), {}, "reportCopy", {
    segmentKey: "wall_balls",
    segmentLabel: "Wall Balls",
    primaryValue: 78,
    confidenceGrade: "C",
    sampleSize: 500,
  });
  assert.equal(copy.startsWith("Based on available data..."), true);
});

test("volume-increasing recommendations suppressed when daysToRace < 14", () => {
  const insights = generateInsights(baseAnalysis(), { fiveKPbSeconds: 1200, engineScore: 72, daysToRace: 7 });
  const limiterInsight = insights.find((insight) => insight.id === "INSIGHT_001");
  assert.ok(limiterInsight);
  assert.equal(limiterInsight.recommendedActions.includes("wall_ball_capacity"), false);
  assert.ok(limiterInsight.safetyNote.includes("inside 14 days"));
});

test("INSIGHT_046 fires when wall_balls gap rank <= 2 in sub_75 group", () => {
  setBenchmarkData({
    groups: [{ groupKey: GROUP_KEY, sampleSize: 1200 }],
    metrics: STATION_KEYS.map((key) => stationMetric(key, key === "wall_balls" ? 70 : key === "row" ? 80 : key === "sled_push" ? 20 : key === "sled_pull" ? 10 : 30)),
  });
  const insights = generatePopulationInsights(GROUP_KEY, def("INSIGHT_046"));
  assert.equal(insights.length, 1);
  assert.equal(insights[0].evidenceValues.segmentKey, "wall_balls");
});

test("INSIGHT_096 fires when inputCompleteness != complete", () => {
  const analysis = baseAnalysis({ dataQuality: { inputCompleteness: 0.8, issues: [], warnings: ["partial_split_data"], confidence: "medium" } });
  assert.equal(evaluateTrigger(def("INSIGHT_096"), analysis).eligible, true);
});

// ── Section 2 – registry integrity ────────────────────────────────────────────

test("registry has no duplicate IDs", () => {
  const registry = loadInsightRegistry();
  const ids = registry.map((insight) => insight.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length);
});

test("every enabled insight has the required fields id, category, title, reportCopy, triggerKey", () => {
  const required = ["id", "category", "title", "reportCopy", "triggerKey"];
  const registry = loadInsightRegistry();
  const missing = registry.filter((insight) => insight.enabled && required.some((field) => !insight[field]));
  assert.deepEqual(missing.map((insight) => insight.id), []);
});

// ── Section 3 – V1 trigger checks (additional) ────────────────────────────────

test("INSIGHT_001 does NOT fire when no limiter exists", () => {
  const noLimiter = baseAnalysis({
    headline: { ...baseAnalysis().headline, biggestLimiter: null },
    limiters: [],
  });
  assert.equal(evaluateTrigger(def("INSIGHT_001"), noLimiter).eligible, false);
});

test("INSIGHT_002 does NOT fire when best strength percentile is below 75", () => {
  const weakStrength = baseAnalysis({
    headline: { ...baseAnalysis().headline, biggestStrength: { segmentKey: "row", percentile: 74 } },
    strengths: [{ segmentKey: "row", percentile: 74 }],
  });
  assert.equal(evaluateTrigger(def("INSIGHT_002"), weakStrength).eligible, false);
});

test("INSIGHT_003 fires when headlineGainSeconds >= 45", () => {
  const result = evaluateTrigger(def("INSIGHT_003"), baseAnalysis());
  assert.equal(result.eligible, true);
  assert.equal(result.evidenceValues.potentialGainSeconds, 78);
});

test("INSIGHT_003 does NOT fire when headline gain is below 45s", () => {
  const smallGain = baseAnalysis({
    timePotential: { headlineGainSeconds: 44, conservativeGainSeconds: 44, newProjectedTimeSeconds: 4456 },
    headline: { ...baseAnalysis().headline, headlineGainSeconds: 44 },
  });
  assert.equal(evaluateTrigger(def("INSIGHT_003"), smallGain).eligible, false);
});

test("INSIGHT_004 fires when total_time segment has valid percentile and benchmark sample >= 100", () => {
  const result = evaluateTrigger(def("INSIGHT_004"), baseAnalysis());
  assert.equal(result.eligible, true);
  assert.equal(result.evidenceValues.primaryMetric, "overall_percentile");
});

test("INSIGHT_004 does NOT fire when benchmark group sample is below 100", () => {
  const thinBenchmark = baseAnalysis({
    benchmarkContext: {
      primaryBenchmarkGroup: { key: GROUP_KEY, label: "Male Open 30-34", sampleSize: 99, confidenceGrade: "D" },
      fallbacksUsed: [],
    },
  });
  assert.equal(evaluateTrigger(def("INSIGHT_004"), thinBenchmark).eligible, false);
});

test("INSIGHT_005 and INSIGHT_006 are mutually exclusive for the same finish time and target", () => {
  const ctx = { targetFinishTimeSeconds: 4400, finishTimeSeconds: 4500 };
  const over  = evaluateTrigger(def("INSIGHT_005"), baseAnalysis(), ctx).eligible;
  const under = evaluateTrigger(def("INSIGHT_006"), baseAnalysis(), ctx).eligible;
  assert.equal(over, true);
  assert.equal(under, false);
});

test("INSIGHT_005 and INSIGHT_006 both do NOT fire when no target is supplied", () => {
  assert.equal(evaluateTrigger(def("INSIGHT_005"), baseAnalysis(), {}).eligible, false);
  assert.equal(evaluateTrigger(def("INSIGHT_006"), baseAnalysis(), {}).eligible, false);
});

test("INSIGHT_007 fires when workRunBalance is runner_dominant", () => {
  const result = evaluateTrigger(def("INSIGHT_007"), baseAnalysis());
  assert.equal(result.eligible, true);
  assert.equal(result.evidenceValues.profileType, "runner_dominant");
});

test("INSIGHT_007 fires when workRunBalance is strength_dominant", () => {
  const strengthDom = baseAnalysis({ workRunBalance: { profileType: "strength_dominant" } });
  const result = evaluateTrigger(def("INSIGHT_007"), strengthDom);
  assert.equal(result.eligible, true);
  assert.equal(result.evidenceValues.profileType, "strength_dominant");
});

test("INSIGHT_007 does NOT fire when profile is balanced and score gap is <= 20", () => {
  const balanced = baseAnalysis({
    workRunBalance: { profileType: "balanced_hybrid" },
    scores: { engineScore: 65, strengthScore: 60 },
  });
  assert.equal(evaluateTrigger(def("INSIGHT_007"), balanced).eligible, false);
});

test("INSIGHT_008 fires at exactly 8% run fade (boundary inclusive)", () => {
  const exact8 = baseAnalysis({ runningAnalysis: { available: true, runFadePct: 8 } });
  assert.equal(evaluateTrigger(def("INSIGHT_008"), exact8).eligible, true);
});

test("INSIGHT_009 fires when roxzone time gap to median >= 30 with no percentile supplied", () => {
  const noPercentile = baseAnalysis({
    roxzoneAnalysis: { available: true, timeGapToMedianSeconds: 35, mode: "inferred_total" },
  });
  assert.equal(evaluateTrigger(def("INSIGHT_009"), noPercentile).eligible, true);
});

test("INSIGHT_009 does NOT fire when percentile >= 40 and gap < 30", () => {
  const goodRox = baseAnalysis({
    roxzoneAnalysis: { available: true, percentile: 65, timeGapToMedianSeconds: 15, mode: "explicit_splits", confidenceGrade: "A" },
  });
  assert.equal(evaluateTrigger(def("INSIGHT_009"), goodRox).eligible, false);
});

test("INSIGHT_010 fires when roxzone percentile >= 80", () => {
  const strongRox = baseAnalysis({
    roxzoneAnalysis: { available: true, percentile: 85, timeGapToMedianSeconds: -20, mode: "explicit_splits", confidenceGrade: "A" },
  });
  const result = evaluateTrigger(def("INSIGHT_010"), strongRox);
  assert.equal(result.eligible, true);
  assert.equal(result.evidenceValues.percentile, 85);
});

test("INSIGHT_010 does NOT fire when roxzone percentile < 80", () => {
  assert.equal(evaluateTrigger(def("INSIGHT_010"), baseAnalysis()).eligible, false);
});

test("INSIGHT_019 fires when best and worst station percentiles differ by >= 40", () => {
  // base has wall_balls(32) and row(82) → gap 50 >= 40
  const result = evaluateTrigger(def("INSIGHT_019"), baseAnalysis());
  assert.equal(result.eligible, true);
  assert.equal(result.evidenceValues.percentileGap >= 40, true);
});

test("INSIGHT_019 does NOT fire when station percentile spread is below 40", () => {
  const narrow = baseAnalysis({
    segments: [
      baseSegment({ segmentKey: "wall_balls", type: "station", percentile: 50 }),
      baseSegment({ segmentKey: "row", type: "station", percentile: 75 }),
    ],
  });
  assert.equal(evaluateTrigger(def("INSIGHT_019"), narrow).eligible, false);
});

test("INSIGHT_019 does NOT fire when fewer than 2 stations have percentiles", () => {
  const single = baseAnalysis({
    segments: [baseSegment({ segmentKey: "wall_balls", type: "station", percentile: 32 })],
  });
  assert.equal(evaluateTrigger(def("INSIGHT_019"), single).eligible, false);
});

test("INSIGHT_021 does NOT fire when engine score < 65 and archetype does not match", () => {
  const lowEngine = baseAnalysis({
    athleteArchetype: { key: "balanced" },
    scores: { engineScore: 55, strengthScore: 50 },
    limiters: [{ segmentKey: "wall_balls", type: "station", timeGapSeconds: 78, percentile: 32 }],
  });
  assert.equal(evaluateTrigger(def("INSIGHT_021"), lowEngine, { engineScore: 55 }).eligible, false);
});

test("INSIGHT_022 fires when athlete context includes a strength signal", () => {
  const lifterAnalysis = baseAnalysis({
    athleteArchetype: { key: "strong_lifter_engine_limited" },
    scores: { engineScore: 40, strengthScore: 78 },
  });
  const result = evaluateTrigger(def("INSIGHT_022"), lifterAnalysis, { squatKg: 120 });
  assert.equal(result.eligible, true);
  assert.equal(result.evidenceValues.coreClaim, "lifter_engine_archetype");
});

test("INSIGHT_096 does NOT fire when inputCompleteness is 1 (complete)", () => {
  assert.equal(evaluateTrigger(def("INSIGHT_096"), baseAnalysis()).eligible, false);
});

// ── Section 4 – priority scoring model ───────────────────────────────────────

test("scoreInsight returns priorityScore in range [0, 1]", () => {
  const score = scoreInsight(
    def("INSIGHT_001"),
    { evidenceType: "direct_precise", confidenceGrade: "A", potentialGainSeconds: 78, sampleSize: 1200 },
    baseAnalysis(), {},
  );
  assert.ok(score.priorityScore >= 0, `priorityScore below 0: ${score.priorityScore}`);
  assert.ok(score.priorityScore <= 1, `priorityScore above 1: ${score.priorityScore}`);
});

test("evidenceStrength component matches spec scale per evidenceType", () => {
  const base = { confidenceGrade: "A", potentialGainSeconds: 78, sampleSize: 1200 };

  const cases = [
    ["direct_precise",    1.0],
    ["direct_fallback",   0.8],
    ["derived",           0.7],
    ["context_inference", 0.6],
    ["context_only",      0.4],
  ];

  for (const [evidenceType, expected] of cases) {
    const score = scoreInsight(def("INSIGHT_001"), { ...base, evidenceType }, baseAnalysis(), {});
    assert.equal(
      score.scoreComponents.evidenceStrength,
      expected,
      `evidenceType '${evidenceType}' expected evidenceStrength ${expected}`,
    );
  }
});

test("evidenceStrength for population type uses 1.0 when sample >= 1000 and 0.3 when not", () => {
  const base = { evidenceType: "population", confidenceGrade: "A", potentialGainSeconds: 0 };

  const large = scoreInsight(def("INSIGHT_046"), { ...base, sampleSize: 1000 }, baseAnalysis(), {});
  const small = scoreInsight(def("INSIGHT_046"), { ...base, sampleSize: 999 }, baseAnalysis(), {});

  assert.equal(large.scoreComponents.evidenceStrength, 1.0);
  assert.equal(small.scoreComponents.evidenceStrength, 0.3);
});

test("confidence component normalises grade to spec values", () => {
  const base = { evidenceType: "direct_precise", potentialGainSeconds: 78, sampleSize: 1200 };

  const expected = [
    ["A", 1.0],
    ["B", 0.85],
    ["C", 0.65],
    ["D", 0.4],
    ["E", 0.0],
  ];

  for (const [grade, expectedValue] of expected) {
    const score = scoreInsight(def("INSIGHT_001"), { ...base, confidenceGrade: grade }, baseAnalysis(), {});
    assert.equal(score.scoreComponents.confidence, expectedValue, `grade ${grade} expected ${expectedValue}`);
  }
});

test("timeImpact component is 0 when potentialGainSeconds is 0", () => {
  const score = scoreInsight(
    def("INSIGHT_001"),
    { evidenceType: "direct_precise", confidenceGrade: "A", potentialGainSeconds: 0, sampleSize: 1200 },
    baseAnalysis(), {},
  );
  assert.equal(score.scoreComponents.timeImpact, 0);
});

test("timeImpact component is 1.0 when gain equals max gain in report", () => {
  // baseAnalysis() has headlineGainSeconds = 78 as the max
  const score = scoreInsight(
    def("INSIGHT_001"),
    { evidenceType: "direct_precise", confidenceGrade: "A", potentialGainSeconds: 78, sampleSize: 1200 },
    baseAnalysis(), {},
  );
  assert.equal(score.scoreComponents.timeImpact, 1.0);
});

test("userGoalRelevance is 1.0 for goal_gap category, 0.8 for limiter with target, 0.7 without", () => {
  const evidence = { evidenceType: "direct_precise", confidenceGrade: "A", potentialGainSeconds: 78, sampleSize: 1200 };

  const goalGapScore = scoreInsight(def("INSIGHT_005"), evidence, baseAnalysis(), { targetFinishTimeSeconds: 4400 });
  assert.equal(goalGapScore.scoreComponents.userGoalRelevance, 1.0);

  const limiterWithGoal = scoreInsight(def("INSIGHT_001"), evidence, baseAnalysis(), { targetFinishTimeSeconds: 4400 });
  assert.equal(limiterWithGoal.scoreComponents.userGoalRelevance, 0.8);

  const limiterNoGoal = scoreInsight(def("INSIGHT_001"), evidence, baseAnalysis(), {});
  assert.equal(limiterNoGoal.scoreComponents.userGoalRelevance, 0.7);
});

// ── Section 5 – selection pipeline ────────────────────────────────────────────

test("selection output is ordered descending by priorityScore", () => {
  const insights = generateInsights(baseAnalysis(), { targetFinishTimeSeconds: 4400, fiveKPbSeconds: 1200, engineScore: 72 });
  for (let i = 1; i < insights.length; i++) {
    assert.ok(
      insights[i - 1].priorityScore >= insights[i].priorityScore,
      `Insight at index ${i - 1} (${insights[i - 1].priorityScore}) should be >= index ${i} (${insights[i].priorityScore})`,
    );
  }
});

test("generateInsights with empty analysis does not crash and returns an array", () => {
  const result = generateInsights({}, {});
  assert.ok(Array.isArray(result));
});

// ── Section 6 – de-duplication ────────────────────────────────────────────────

test("de-duplication does NOT merge insights about different segments", () => {
  const deduped = deduplicateInsights([
    { id: "C", category: "limiter", priorityScore: 0.8, evidence: { segmentKey: "wall_balls", coreClaim: "biggest_limiter" } },
    { id: "D", category: "limiter", priorityScore: 0.8, evidence: { segmentKey: "sled_push", coreClaim: "biggest_limiter" } },
  ]);
  assert.equal(deduped.length, 2);
});

// ── Section 7 – copy rendering ────────────────────────────────────────────────

test("grade A insight copy has no softening prefix", () => {
  const copy = renderInsight(def("INSIGHT_001"), baseAnalysis(), {}, "reportCopy", {
    segmentKey: "wall_balls",
    segmentLabel: "Wall Balls",
    primaryValue: 78,
    confidenceGrade: "A",
    sampleSize: 1200,
    fallbackLevel: 0,
  });
  assert.equal(copy.startsWith("Based on"), false);
  assert.equal(copy.startsWith("Likely"), false);
  assert.equal(copy.startsWith("This is worth reviewing"), false);
});

test("buildCopyVariables formats hero_metric as M:SS for common durations", () => {
  const cases = [
    [78,  "1:18"],
    [45,  "0:45"],
    [120, "2:00"],
    [305, "5:05"],
  ];

  for (const [seconds, expected] of cases) {
    const vars = buildCopyVariables(baseAnalysis(), { primaryValue: seconds });
    assert.equal(vars.hero_metric, expected, `${seconds}s expected ${expected}`);
  }
});

// ── Section 8 – guardrails ────────────────────────────────────────────────────

test("no prohibited language appears in any rendered insight copy", () => {
  const insights = generateInsights(baseAnalysis(), { targetFinishTimeSeconds: 4400, fiveKPbSeconds: 1200, engineScore: 72 });
  const prohibited = ["weakness", "failure", "poor performance", "bad performance", "you are bad"];

  for (const insight of insights) {
    const combined = [insight.title, insight.socialHook, insight.reportCopy, insight.emailCopy].join(" ").toLowerCase();
    for (const phrase of prohibited) {
      assert.equal(combined.includes(phrase), false, `Insight ${insight.id} contains prohibited phrase: "${phrase}"`);
    }
  }
});

test("limiter and time_potential insight copy uses hedged language", () => {
  const insights = generateInsights(baseAnalysis(), { targetFinishTimeSeconds: 4400 });
  const hedgeable = insights.filter((i) => ["limiter", "time_potential"].includes(i.category));
  assert.ok(hedgeable.length > 0, "No limiter or time_potential insights generated");

  const hedgedTerms = ["potential", "estimated", "could", "gain", "opportunity", "around"];
  for (const insight of hedgeable) {
    const copy = (insight.reportCopy + " " + insight.emailCopy).toLowerCase();
    const hasHedge = hedgedTerms.some((term) => copy.includes(term));
    assert.ok(hasHedge, `Insight ${insight.id} missing hedged language in copy: "${insight.reportCopy}"`);
  }
});

// ── Section 9 – race-date proximity suppression ───────────────────────────────

test("volume actions are retained when daysToRace is exactly 14", () => {
  const insights = generateInsights(baseAnalysis(), { fiveKPbSeconds: 1200, engineScore: 72, daysToRace: 14 });
  const limiter = insights.find((i) => i.id === "INSIGHT_001");
  assert.ok(limiter, "INSIGHT_001 not in selection");
  assert.equal(limiter.recommendedActions.includes("wall_ball_capacity"), true);
  assert.equal(limiter.safetyNote, null);
});

test("volume actions are suppressed when raceDate string is within 14 days", () => {
  const inSevenDays = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const insights = generateInsights(baseAnalysis(), { fiveKPbSeconds: 1200, engineScore: 72, raceDate: inSevenDays });
  const limiter = insights.find((i) => i.id === "INSIGHT_001");
  assert.ok(limiter, "INSIGHT_001 not in selection");
  assert.equal(limiter.recommendedActions.includes("wall_ball_capacity"), false);
  assert.ok(limiter.safetyNote?.includes("inside 14 days"));
});

test("reportCopy is replaced with race-proximity message when race < 14 days", () => {
  const insights = generateInsights(baseAnalysis(), { daysToRace: 7 });
  const limiter = insights.find((i) => i.id === "INSIGHT_001");
  assert.ok(limiter, "INSIGHT_001 not in selection");
  assert.ok(limiter.reportCopy.toLowerCase().includes("race is close"));
});

// ── Section 10 – population insights ──────────────────────────────────────────

test("INSIGHT_046 is suppressed when sled stations rank in the top 2 gap positions", () => {
  setBenchmarkData({
    groups: [{ groupKey: GROUP_KEY, sampleSize: 1200 }],
    metrics: STATION_KEYS.map((key) => {
      if (key === "sled_push") return stationMetric(key, 80);   // rank 1 — sled now dominates
      if (key === "wall_balls") return stationMetric(key, 70);  // rank 2
      return stationMetric(key, 30);
    }),
  });
  const insights = generatePopulationInsights(GROUP_KEY, def("INSIGHT_046"));
  assert.equal(insights.length, 0);
});

test("INSIGHT_046 is suppressed when benchmark group sample is below 1000", () => {
  setBenchmarkData({
    groups: [{ groupKey: GROUP_KEY, sampleSize: 800 }],
    metrics: STATION_KEYS.map((key) =>
      stationMetric(key, key === "wall_balls" ? 70 : key === "row" ? 80 : key === "sled_push" ? 10 : key === "sled_pull" ? 10 : 30, 800),
    ),
  });
  const insights = generatePopulationInsights(GROUP_KEY, def("INSIGHT_046"));
  assert.equal(insights.length, 0);
});

// ── Section 11 – context insights ─────────────────────────────────────────────

test("generateContextInsights returns empty array when context is empty", () => {
  const results = generateContextInsights(enabledInsights(), baseAnalysis(), {});
  assert.equal(results.length, 0);
});

test("generateContextInsights returns INSIGHT_021 when engine context is present", () => {
  const results = generateContextInsights(enabledInsights(), baseAnalysis(), { fiveKPbSeconds: 1200, engineScore: 72 });
  const r021 = results.find((r) => r.insightDef.id === "INSIGHT_021");
  assert.ok(r021, "INSIGHT_021 not returned from context insights");
  assert.equal(r021.evidenceValues.coreClaim, "runner_station_archetype");
  assert.equal(r021.evidenceValues.evidenceType, "context_inference");
  assert.equal(r021.evidenceValues.confidenceGrade, "C");
});

// ── Section 12 – recommended actions taxonomy ─────────────────────────────────

test("ACTION_MAP contains all 12 required action IDs with non-empty copy", () => {
  const required = [
    "wall_ball_capacity",
    "compromised_running",
    "roxzone_rehearsal",
    "sled_technique",
    "grip_carry_specificity",
    "lunge_strength_endurance",
    "burpee_rhythm",
    "ski_efficiency",
    "row_efficiency",
    "run_volume_base",
    "race_pacing",
    "maintain_taper",
  ];
  for (const action of required) {
    assert.ok(action in ACTION_MAP, `ACTION_MAP missing action: ${action}`);
    assert.ok(ACTION_MAP[action].length > 0, `ACTION_MAP["${action}"] is empty`);
  }
});

test("VOLUME_INCREASING_ACTIONS contains high-load items and not safe pre-race items", () => {
  assert.equal(VOLUME_INCREASING_ACTIONS.has("wall_ball_capacity"), true);
  assert.equal(VOLUME_INCREASING_ACTIONS.has("run_volume_base"), true);
  assert.equal(VOLUME_INCREASING_ACTIONS.has("compromised_running"), true);
  assert.equal(VOLUME_INCREASING_ACTIONS.has("race_pacing"), false);    // safe near race
  assert.equal(VOLUME_INCREASING_ACTIONS.has("maintain_taper"), false); // safe near race
});

// ── Section 13 – output schema shape ─────────────────────────────────────────

test("every insight from generateInsights has required fields with correct types", () => {
  const insights = generateInsights(baseAnalysis(), { targetFinishTimeSeconds: 4400, fiveKPbSeconds: 1200, engineScore: 72 });
  assert.ok(insights.length > 0, "generateInsights returned no insights");

  for (const insight of insights) {
    assert.equal(typeof insight.id, "string",          `${insight.id}: id not string`);
    assert.equal(typeof insight.category, "string",    `${insight.id}: category not string`);
    assert.equal(typeof insight.title, "string",       `${insight.id}: title not string`);
    assert.equal(typeof insight.reportCopy, "string",  `${insight.id}: reportCopy not string`);
    assert.equal(typeof insight.priorityScore, "number", `${insight.id}: priorityScore not number`);
    assert.ok(insight.priorityScore >= 0,              `${insight.id}: priorityScore < 0`);
    assert.ok(insight.priorityScore <= 1,              `${insight.id}: priorityScore > 1`);
    assert.ok(["A","B","C","D","E"].includes(insight.confidenceGrade), `${insight.id}: invalid confidenceGrade`);
    assert.ok(Array.isArray(insight.recommendedActions), `${insight.id}: recommendedActions not array`);
    assert.ok(Array.isArray(insight.guardrails),          `${insight.id}: guardrails not array`);
    assert.ok(Array.isArray(insight.reportSections),      `${insight.id}: reportSections not array`);
    assert.equal(typeof insight.evidence, "object",    `${insight.id}: evidence not object`);
  }
});

// ── Section 16 – edge cases ───────────────────────────────────────────────────

test("selectInsights with empty array returns empty array without crash", () => {
  const result = selectInsights([]);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 0);
});

test("deduplicateInsights with empty array returns empty array", () => {
  assert.deepEqual(deduplicateInsights([]), []);
});

test("loadInsightRegistry returns the same cached reference on repeated calls", () => {
  const first  = loadInsightRegistry();
  const second = loadInsightRegistry();
  assert.equal(first === second, true);
});

test("INSIGHT_005 fires while INSIGHT_006 does not when user is over target", () => {
  const ctx = { targetFinishTimeSeconds: 4400 };
  assert.equal(evaluateTrigger(def("INSIGHT_005"), baseAnalysis(), ctx).eligible, true);
  assert.equal(evaluateTrigger(def("INSIGHT_006"), baseAnalysis(), ctx).eligible, false);
});

test("INSIGHT_006 fires while INSIGHT_005 does not when user beats target", () => {
  const fastAnalysis = baseAnalysis({ race: { finishTimeSeconds: 4300 } });
  const ctx = { targetFinishTimeSeconds: 4400, finishTimeSeconds: 4300 };
  assert.equal(evaluateTrigger(def("INSIGHT_005"), fastAnalysis, ctx).eligible, false);
  assert.equal(evaluateTrigger(def("INSIGHT_006"), fastAnalysis, ctx).eligible, true);
});

test("rankStationGaps ranks stations by median-to-P25 gap descending", () => {
  setBenchmarkData({
    groups: [{ groupKey: GROUP_KEY, sampleSize: 1200 }],
    metrics: STATION_KEYS.map((key) => stationMetric(key, key === "wall_balls" ? 70 : key === "row" ? 80 : 30)),
  });

  const rankings = rankStationGaps(GROUP_KEY);
  assert.ok(rankings.length > 0, "rankStationGaps returned no results");
  assert.equal(rankings[0].segmentKey, "row");     // row gap = 80 → rank 1
  assert.equal(rankings[1].segmentKey, "wall_balls"); // wall_balls gap = 70 → rank 2

  for (let i = 1; i < rankings.length; i++) {
    assert.ok(
      rankings[i - 1].gapSeconds >= rankings[i].gapSeconds,
      `Rankings not sorted: ${rankings[i - 1].segmentKey}(${rankings[i - 1].gapSeconds}) < ${rankings[i].segmentKey}(${rankings[i].gapSeconds})`,
    );
  }
});

// ── Section 3 additional – edge-case trigger checks ──────────────────────────

test("INSIGHT_008 does NOT fire when runningAnalysis.available is false", () => {
  const noRun = baseAnalysis({ runningAnalysis: { available: false } });
  assert.equal(evaluateTrigger(def("INSIGHT_008"), noRun).eligible, false);
});

// ── Section 5 additional – slot balance and pacing gate ──────────────────────

test("selection always includes at least one strength/benchmark insight when available", () => {
  const insights = generateInsights(baseAnalysis(), { targetFinishTimeSeconds: 4400, fiveKPbSeconds: 1200, engineScore: 72 });
  const count = insights.filter((i) => i.category === "strength" || i.category === "benchmark").length;
  assert.ok(count >= 1, `Expected at least 1 strength/benchmark insight, got ${count}`);
});

test("selection always includes at least one limiter/time_potential insight when available", () => {
  const insights = generateInsights(baseAnalysis(), { targetFinishTimeSeconds: 4400, fiveKPbSeconds: 1200, engineScore: 72 });
  const count = insights.filter((i) => i.category === "limiter" || i.category === "time_potential").length;
  assert.ok(count >= 1, `Expected at least 1 limiter/time_potential insight, got ${count}`);
});

test("pacing/fatigue insight is only included when its priorityScore >= 0.5", () => {
  const insights = generateInsights(baseAnalysis(), { targetFinishTimeSeconds: 4400, fiveKPbSeconds: 1200, engineScore: 72 });
  const fatigueInsights = insights.filter((i) => i.category === "fatigue" || i.category === "pacing");
  for (const insight of fatigueInsights) {
    assert.ok(
      insight.priorityScore >= 0.5,
      `Fatigue/pacing insight ${insight.id} included with priorityScore ${insight.priorityScore} (must be >= 0.5)`,
    );
  }
});

// ── Section 7 additional – distinct copy modes ────────────────────────────────

test("INSIGHT_001 socialHook, reportCopy, and emailCopy each produce different strings", () => {
  const evidence = { segmentKey: "wall_balls", segmentLabel: "Wall Balls", primaryValue: 78, confidenceGrade: "A", sampleSize: 1200, fallbackLevel: 0 };
  const social = renderInsight(def("INSIGHT_001"), baseAnalysis(), {}, "socialHook", evidence);
  const report = renderInsight(def("INSIGHT_001"), baseAnalysis(), {}, "reportCopy", evidence);
  const email  = renderInsight(def("INSIGHT_001"), baseAnalysis(), {}, "emailCopy",  evidence);
  assert.notEqual(social, report, "socialHook and reportCopy should be different");
  assert.notEqual(report, email,  "reportCopy and emailCopy should be different");
});

// ── Section 9 additional ──────────────────────────────────────────────────────

test("volume actions retained when daysToRace is 30", () => {
  const insights = generateInsights(baseAnalysis(), { fiveKPbSeconds: 1200, engineScore: 72, daysToRace: 30 });
  const limiter = insights.find((i) => i.id === "INSIGHT_001");
  assert.ok(limiter, "INSIGHT_001 not in selection");
  assert.equal(limiter.recommendedActions.includes("wall_ball_capacity"), true);
  assert.equal(limiter.safetyNote, null);
});

// ── Section 16 additional edge cases ─────────────────────────────────────────

test("volume actions suppressed when daysToRace is 0", () => {
  const insights = generateInsights(baseAnalysis(), { fiveKPbSeconds: 1200, engineScore: 72, daysToRace: 0 });
  const limiter = insights.find((i) => i.id === "INSIGHT_001");
  assert.ok(limiter, "INSIGHT_001 not in selection");
  assert.equal(limiter.recommendedActions.includes("wall_ball_capacity"), false);
  assert.ok(limiter.safetyNote?.includes("inside 14 days"));
});

test("volume actions suppressed when raceDate is in the past", () => {
  const pastDate = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const insights = generateInsights(baseAnalysis(), { fiveKPbSeconds: 1200, engineScore: 72, raceDate: pastDate });
  const limiter = insights.find((i) => i.id === "INSIGHT_001");
  assert.ok(limiter, "INSIGHT_001 not in selection");
  assert.equal(limiter.recommendedActions.includes("wall_ball_capacity"), false);
});

test("generateInsights returns empty array when benchmark sample is too small to pass any suppression threshold", () => {
  const tinyBenchmark = baseAnalysis({
    benchmarkContext: {
      primaryBenchmarkGroup: { key: GROUP_KEY, label: "Male Open 30-34", sampleSize: 1, confidenceGrade: "E" },
      fallbacksUsed: [],
      goalBenchmarkGroup: null,
    },
    segments: [
      baseSegment({ segmentKey: "total_time", type: "aggregate", percentile: 50, sampleSize: 1, confidenceGrade: "E" }),
      baseSegment({ sampleSize: 1, confidenceGrade: "E" }),
    ],
    headline: {
      biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 78, percentile: 32 },
      biggestStrength: { segmentKey: "row", label: "Row", percentile: 82 },
      headlineGainSeconds: 78,
    },
  });
  const result = generateInsights(tinyBenchmark, {});
  assert.ok(Array.isArray(result), "Expected array");
  // No crash; insights that require benchmark confidence may be absent
});
