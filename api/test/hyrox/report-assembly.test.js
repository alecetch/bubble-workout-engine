import assert from "node:assert/strict";
import test from "node:test";
import { assembleReport } from "../../src/hyrox/reports/reportAssembler.js";
import { buildHyroxReportContract } from "../../src/hyrox/reports/reportContractBuilder.js";
import { buildPersonalReport } from "../../src/hyrox/reports/personalReportBuilder.js";
import { buildRecommendations } from "../../src/hyrox/reports/recommendationBuilder.js";
import { buildTemplateB } from "../../src/hyrox/reports/templateSlotMapper.js";
import { generateInsights } from "../../src/hyrox/insights/insightEngine.js";
import { setBenchmarkData } from "../../src/hyrox/engine/benchmarkService.js";
import { STATION_KEYS } from "../../src/hyrox/config/segmentMap.js";

const GROUP_KEY = "hyrox:historical_hyrox_2026_06_v1:open:male:30-34";

function station(overrides = {}) {
  return {
    segmentKey: "wall_balls",
    label: "Wall Balls",
    type: "station",
    userSeconds: 378,
    benchmarkMedianSeconds: 300,
    timeGapToMedianSeconds: 78,
    percentile: 32,
    sampleSize: 1200,
    confidenceGrade: "A",
    ...overrides,
  };
}

function analysis(overrides = {}) {
  const wall = station();
  const row = station({ segmentKey: "row", label: "Row", userSeconds: 255, benchmarkMedianSeconds: 300, timeGapToMedianSeconds: -45, percentile: 86 });
  const total = station({ segmentKey: "total_time", label: "Total time", type: "aggregate", userSeconds: 4500, benchmarkMedianSeconds: 4700, timeGapToMedianSeconds: -200, percentile: 99.2 });
  return {
    analysisVersion: "hyrox_engine_v1.0.0",
    analysisScope: "full",
    dataQuality: { inputCompleteness: 1, warnings: [], issues: [], confidence: "high" },
    race: { finishTimeSeconds: 4500, division: "open" },
    benchmarkContext: {
      primaryBenchmarkGroup: { key: GROUP_KEY, label: "Male Open 30-34", sampleSize: 1200, confidenceGrade: "A" },
      fallbacksUsed: [],
      goalBenchmarkGroup: null,
    },
    headline: {
      biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 78, percentile: 32 },
      biggestStrength: { segmentKey: "row", label: "Row", percentile: 86 },
      headlineGainSeconds: 78,
      projectedTimeSeconds: 4422,
    },
    scores: { engineScore: 72, strengthScore: 48, executionScore: 60 },
    segments: [
      total,
      station({ segmentKey: "run_1", label: "Run 1", type: "run", userSeconds: 290, benchmarkMedianSeconds: 300, timeGapToMedianSeconds: -10, percentile: 65 }),
      station({ segmentKey: "ski_erg", label: "SkiErg", userSeconds: 305, benchmarkMedianSeconds: 300, timeGapToMedianSeconds: 5, percentile: 52 }),
      station({ segmentKey: "run_2", label: "Run 2", type: "run", userSeconds: 310, benchmarkMedianSeconds: 300, timeGapToMedianSeconds: 10, percentile: 45 }),
      station({ segmentKey: "sled_push", label: "Sled Push", userSeconds: 322, benchmarkMedianSeconds: 300, timeGapToMedianSeconds: 22, percentile: 40 }),
      station({ segmentKey: "run_3", label: "Run 3", type: "run", userSeconds: 318, benchmarkMedianSeconds: 300, timeGapToMedianSeconds: 18, percentile: 42 }),
      row,
      wall,
    ],
    strengths: [{ segmentKey: "row", label: "Row", percentile: 86, timeAdvantageSeconds: 45, confidence: "high" }],
    limiters: [{ segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 78, percentile: 32, confidence: "high" }],
    timePotential: { headlineGainSeconds: 78, conservativeGainSeconds: 78, competitiveGainSeconds: 120, newProjectedTimeSeconds: 4422 },
    runningAnalysis: { available: true, runFadePct: 9.5 },
    roxzoneAnalysis: { available: true, mode: "explicit_splits", percentile: 35, timeGapToMedianSeconds: 35 },
    workRunBalance: { profileType: "runner_dominant" },
    athleteArchetype: { key: "strong_runner_station_limited" },
    ...overrides,
  };
}

function insights(analysisJson = analysis(), athleteContext = {}) {
  return generateInsights(analysisJson, athleteContext);
}

function metric(key, gap, sampleSize = 1200) {
  return { groupKey: GROUP_KEY, metricKey: key, sampleSize, medianSeconds: 300, p25Seconds: 300 - gap, p50Seconds: 300 };
}

function allStrings(value) {
  return JSON.stringify(value);
}

test.beforeEach(() => {
  setBenchmarkData({ groups: [], metrics: [] });
});

test("A1 hook uses percentile or rank language for elite result", () => {
  const a = analysis();
  const report = assembleReport({ analysisJson: a, insights: insights(a), athleteContext: { displayName: "Daniel Gallego" }, outputType: "carousel_a" });
  assert.equal(report.slides[0].slide_id, "A1_ATHLETE_HOOK");
  // No comparisonOptions on this fixture, so this correctly falls back to the demographic
  // "Top N%" label rather than a "WORLDWIDE" claim it can't back up with global data.
  assert.match(report.slides[0].percentile, /TOP|BENCHMARKED|Top \d+%/);
});

test("A4 opportunity uses Opportunity label, never weakness", () => {
  const a = analysis();
  const report = assembleReport({ analysisJson: a, insights: insights(a), outputType: "carousel_a" });
  assert.equal(report.slides[3].label, "Opportunity");
  assert.equal(/weakness/i.test(allStrings(report.slides[3])), false);
});

test("recommendations switch to execution-only when daysToRace < 14", () => {
  const recs = buildRecommendations(analysis(), [], { daysToRace: 7 });
  assert.deepEqual(recs.map((rec) => rec.actionId), ["race_pacing", "roxzone_rehearsal", "maintain_taper"]);
});

test("shoulder safety note added when injuryConstraints includes shoulder", () => {
  const recs = buildRecommendations(analysis(), [], { daysToRace: 60, injuryConstraints: "left shoulder irritation" });
  assert.ok(recs[0].safetyNote.includes("shoulder"));
});

test("run_volume_base action suppressed when daysToRace < 28", () => {
  const runAnalysis = analysis({
    headline: { ...analysis().headline, biggestLimiter: { segmentKey: "run_time", label: "Running", type: "aggregate", timeGapSeconds: 90, percentile: 30 } },
    limiters: [{ segmentKey: "run_time", label: "Running", type: "aggregate", timeGapSeconds: 90, percentile: 30 }],
  });
  const recs = buildRecommendations(runAnalysis, [], { daysToRace: 21 });
  assert.equal(recs.some((rec) => rec.actionId === "run_volume_base"), false);
});

test("section 8 context interpretation omitted when athleteContext is null", () => {
  const a = analysis();
  const report = assembleReport({ analysisJson: a, insights: insights(a), athleteContext: null, outputType: "email_report" });
  assert.equal(report.sections.some((section) => section.sectionKey === "training_context"), false);
});

test("browser summary still renders without athleteContext", () => {
  const a = analysis();
  const report = assembleReport({ analysisJson: a, insights: insights(a), outputType: "web_report" });
  assert.ok(report.browserSummary.heroInsight.title);
});

test("B1 hook is isn't the sled when wall_balls is top gap and sled is not top-2", () => {
  setBenchmarkData({
    groups: [{ groupKey: GROUP_KEY, sampleSize: 1200 }],
    metrics: STATION_KEYS.map((key) => metric(key, key === "wall_balls" ? 90 : key === "row" ? 80 : key === "sled_push" ? 20 : key === "sled_pull" ? 10 : 40)),
  });
  const carousel = buildTemplateB(GROUP_KEY, "sub-75");
  assert.equal(carousel.hook.headline, "The biggest HYROX bottleneck isn't the sled");
});

test("same segmentKey does not appear in two named slots of Template A", () => {
  const a = analysis();
  const report = assembleReport({ analysisJson: a, insights: insights(a), outputType: "carousel_a" });
  assert.notEqual(report.slides[2].station, report.slides[3].station);
});

test("no unresolved variable tokens appear in any output", () => {
  const a = analysis();
  const report = assembleReport({ analysisJson: a, insights: insights(a), outputType: "email_report" });
  assert.equal(/\{[a-zA-Z0-9_]+\}/.test(allStrings(report)), false);
});

test("all visible times in carousel output are formatted, not raw seconds", () => {
  const a = analysis();
  const report = assembleReport({ analysisJson: a, insights: insights(a), outputType: "carousel_a" });
  assert.equal(report.slides[0].hero_number, "1:18");
  assert.equal(report.slides[0].overall_time, "1:15:00");
});

test("forbidden word weakness does not appear in generated output", () => {
  const a = analysis();
  const report = assembleReport({ analysisJson: a, insights: [{ id: "X", category: "limiter", title: "weakness", evidence: {}, confidenceGrade: "A", priorityScore: 1 }], outputType: "email_report" });
  assert.equal(/weakness/i.test(allStrings(report)), false);
});

test("target-mode subject uses target time analysis fallback without a goal", () => {
  const a = analysis();
  const report = assembleReport({ analysisJson: a, insights: insights(a), outputType: "email_report" });
  assert.equal(report.emailSubject, "Your HYROX target time analysis");
});

test("email plain text body contains no HTML tags", () => {
  const a = analysis();
  const report = assembleReport({ analysisJson: a, insights: insights(a), outputType: "email_report" });
  assert.equal(/<[^>]+>/.test(report.emailText), false);
});

test("browser summary includes dataQualityNote when roxzone is inferred", () => {
  const a = analysis({ roxzoneAnalysis: { available: true, mode: "inferred_total", percentile: 35, timeGapToMedianSeconds: 35 } });
  const report = assembleReport({ analysisJson: a, insights: insights(a), outputType: "web_report" });
  assert.ok(report.browserSummary.dataQualityNote.includes("estimated"));
});

test("A5 hidden insight uses time-gap language when no position delta data available", () => {
  const a = analysis();
  const report = assembleReport({ analysisJson: a, insights: insights(a), outputType: "carousel_a", athleteContext: { displayName: "Daniel" } });
  assert.ok(report.slides[4].loss_text.includes("potential gain"));
});

test("personal report background section agrees with gap reconciliation category", () => {
  const base = analysis();
  const total = station({
    segmentKey: "total_time",
    label: "Total time",
    type: "aggregate",
    userSeconds: 4800,
    benchmarkMedianSeconds: 4500,
    frameGapSeconds: 300,
    timeGapToMedianSeconds: 300,
    percentile: 42,
  });
  const runTotal = station({
    segmentKey: "run_time",
    label: "Run Total",
    type: "aggregate",
    userSeconds: 2400,
    benchmarkMedianSeconds: 2400,
    frameGapSeconds: 0,
    timeGapToMedianSeconds: 0,
    percentile: 55,
  });
  const stationTotal = station({
    segmentKey: "work_time",
    label: "Station Total",
    type: "aggregate",
    userSeconds: 2100,
    benchmarkMedianSeconds: 1860,
    frameGapSeconds: 240,
    timeGapToMedianSeconds: 240,
    percentile: 28,
  });
  const roxzoneTotal = station({
    segmentKey: "roxzone_time",
    label: "RoxZone",
    type: "aggregate",
    userSeconds: 300,
    benchmarkMedianSeconds: 240,
    frameGapSeconds: 60,
    timeGapToMedianSeconds: 60,
    percentile: 40,
  });
  const a = {
    ...base,
    race: { ...base.race, finishTimeSeconds: 4800 },
    headline: {
      ...base.headline,
      biggestLimiter: { segmentKey: "run_6", label: "Run 6", type: "run", timeGapSeconds: 90, percentile: 30 },
      headlineGainSeconds: 90,
    },
    limiters: [{ segmentKey: "run_6", label: "Run 6", type: "run", timeGapSeconds: 90, percentile: 30, confidence: "high" }],
    timePotential: { ...base.timePotential, headlineGainSeconds: 90 },
    segments: [
      ...base.segments.filter((row) => !["total_time", "run_time", "work_time", "roxzone_time"].includes(row.segmentKey)),
      station({ segmentKey: "run_6", label: "Run 6", type: "run", userSeconds: 390, benchmarkMedianSeconds: 300, timeGapToMedianSeconds: 90, percentile: 30 }),
      total,
      runTotal,
      stationTotal,
      roxzoneTotal,
    ],
  };
  const athleteContext = { primaryBackground: "crossfit_hybrid", division: "open" };
  const contract = buildHyroxReportContract({ analysisJson: a, athleteContext, calculatorMode: "analyse", insights: [] });
  const personal = buildPersonalReport(a, [], athleteContext, null, "analyse", contract);
  const background = personal.sections.find((section) => section.sectionKey === "athlete_background");

  assert.equal(contract.gapReconciliation.largestCategory.key, "work_time");
  assert.match(contract.gapReconciliation.summarySentence, /Station performance|Stations/);
  assert.match(background.content, /sustain station output/);
  assert.equal(/gap is in the running/i.test(background.content), false);
});
