import assert from "node:assert/strict";
import test from "node:test";
import { RUN_KEYS, STATION_KEYS } from "../../src/hyrox/config/segmentMap.js";
import { setBenchmarkData } from "../../src/hyrox/engine/benchmarkService.js";
import { analyseSubmission } from "../../src/hyrox/engine/hyroxAnalysisEngine.js";
import { assembleReport } from "../../src/hyrox/reports/reportAssembler.js";
import { buildPersonalReport } from "../../src/hyrox/reports/personalReportBuilder.js";
import { formatGain } from "../../src/hyrox/reports/copyFormatter.js";

const GROUP_KEY = "hyrox:historical_hyrox_2026_06_v1:open:male:30-34";

const MEDIANS = Object.freeze({
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
});

function metric(metricKey, medianSeconds) {
  return {
    groupKey: GROUP_KEY,
    metricKey,
    sampleSize: 1200,
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
  setBenchmarkData({
    groups: [
      {
        groupKey: GROUP_KEY,
        datasetVersion: "historical_hyrox_2026_06_v1",
        division: "open",
        gender: "male",
        ageGroup: "30-34",
        sampleSize: 1200,
      },
    ],
    metrics: Object.entries(MEDIANS).map(([key, median]) => metric(key, median)),
  });
}

function qualitySubmission(overrides = {}) {
  const stationTimes = {
    ski_erg: 500,
    sled_push: 270,
    sled_pull: 220,
    burpee_broad_jump: 300,
    row: 300,
    farmers_carry: 120,
    sandbag_lunges: 240,
    wall_balls: 300,
  };
  return {
    athlete: {
      name: "Quality Test",
      email: "quality@example.com",
      sex: "male",
      gender: "male",
      ageOnRaceDay: 34,
      ageGroup: "30-34",
      division: "open",
    },
    race: {
      raceName: "HYROX Quality Fixture",
      raceDate: "2020-01-01",
      division: "open",
      finishTimeSeconds: 4890,
    },
    splits: [
      ...RUN_KEYS.map((segmentKey, index) => ({
        index: index + 1,
        segmentKey,
        label: `Run ${index + 1}`,
        type: "run",
        timeSeconds: 300,
      })),
      ...STATION_KEYS.map((segmentKey, index) => ({
        index: index + 9,
        segmentKey,
        label: segmentKey,
        type: "station",
        timeSeconds: stationTimes[segmentKey],
      })),
    ],
    penalties: [{ station: "run_5", penaltySeconds: 300 }],
    athleteContext: {},
    ...overrides,
  };
}

test.beforeEach(() => {
  seedBenchmarks();
});

test("analysis quality v2 report fixes are applied together", () => {
  const analysis = analyseSubmission(qualitySubmission());
  const report = buildPersonalReport(analysis, [], {});

  assert.notEqual(analysis.headline.biggestLimiter.type, "aggregate");

  assert.ok(Array.isArray(analysis.stationBreakdown));
  assert.ok(analysis.stationBreakdown.length > 0);
  for (const entry of analysis.stationBreakdown) {
    assert.equal(typeof entry.segmentKey, "string");
    assert.equal(typeof entry.label, "string");
    assert.equal(Number.isFinite(entry.percentile), true);
    assert.equal(Number.isFinite(entry.timeGapSeconds), true);
  }

  const recommendations = report.sections.find((section) => section.sectionKey === "recommended_focus_areas");
  const recommendationContent = Array.isArray(recommendations?.content)
    ? recommendations.content.join("\n")
    : String(recommendations?.content ?? "");
  assert.equal(recommendationContent.includes("Race day is close"), false);
  assert.equal(recommendationContent.split("\n").some((line) => line.trim() === "This week: pacing, transitions, recovery"), false);

  const horizonMatches = recommendationContent.match(/Next training block/g) ?? [];
  assert.ok(horizonMatches.length <= 1);

  const snapshot = report.sections.find((section) => section.sectionKey === "race_snapshot");
  const snapshotContent = Array.isArray(snapshot?.content) ? snapshot.content : [String(snapshot?.content ?? "")];
  assert.ok(snapshotContent.some((line) => /penalty/i.test(line) && line.includes("+5:00")));

  const executiveSummary = report.sections.find((section) => section.sectionKey === "executive_summary");
  const summaryContent = Array.isArray(executiveSummary?.content)
    ? executiveSummary.content.join(" ")
    : String(executiveSummary?.content ?? "");
  assert.ok(summaryContent.includes(formatGain(analysis.timePotential.headlineGainSeconds)));

  assert.equal(report.sections.some((section) => section.sectionKey === "training_context"), false);
});

test("training volume assessment appears when volume context is present", () => {
  const analysis = analyseSubmission(qualitySubmission());
  const report = buildPersonalReport(analysis, [], {
    weeklyRunningVolume: "21_40_km",
    weeklyStrengthSessions: "2_3",
  });

  assert.equal(report.sections.some((section) => section.sectionKey === "training_volume"), true);
});

test("training volume assessment is omitted when volume context is absent", () => {
  const analysis = analyseSubmission(qualitySubmission());
  const report = buildPersonalReport(analysis, [], {});

  assert.equal(report.sections.some((section) => section.sectionKey === "training_volume"), false);
});

test("background section appears before roxzone when recognised background is present", () => {
  const analysis = analyseSubmission(qualitySubmission());
  const report = buildPersonalReport(analysis, [], {
    primaryBackground: "running",
    weeklyRunningVolume: "21_40_km",
    weeklyStrengthSessions: "2_3",
  });
  const keys = report.sections.map((section) => section.sectionKey);

  assert.ok(keys.includes("athlete_background"));
  assert.ok(keys.indexOf("training_volume") < keys.indexOf("athlete_background"));
  assert.ok(keys.indexOf("athlete_background") < keys.indexOf("roxzone_execution"));
});

test("recommended focus areas include likely contributors when multiple gaps exist", () => {
  const analysis = analyseSubmission(qualitySubmission());
  const report = buildPersonalReport(analysis, [], {});
  const recommendations = report.sections.find((section) => section.sectionKey === "recommended_focus_areas");
  const content = Array.isArray(recommendations?.content) ? recommendations.content.join("\n") : String(recommendations?.content ?? "");

  assert.match(content, /Likely contributors/);
});

test("race replay creates visible roxzone commentary in the email report", () => {
  const raceReplay = [
    { station: "ski_erg", entrySeconds: 8, exitSeconds: 29 },
    { station: "sled_push", entrySeconds: 4, exitSeconds: 36 },
    { station: "sled_pull", entrySeconds: 14, exitSeconds: 29 },
    { station: "burpee_broad_jump", entrySeconds: 34, exitSeconds: 22 },
    { station: "row", entrySeconds: 39, exitSeconds: 18 },
    { station: "farmers_carry", entrySeconds: 47, exitSeconds: 19 },
    { station: "sandbag_lunges", entrySeconds: 61, exitSeconds: 78 },
    { station: "wall_balls", entrySeconds: 12, exitSeconds: null },
  ];
  const analysis = analyseSubmission(qualitySubmission({ raceReplay }));
  const report = assembleReport({
    raceResult: analysis.race,
    analysisJson: analysis,
    insights: [],
    athleteContext: { displayName: "Quality Test" },
    outputType: "email_report",
  });

  assert.equal(analysis.roxzoneAnalysis.entryExitAvailable, true);
  assert.match(report.emailHtml, /ROXZONE AND EXECUTION PROFILE/i);
  assert.match(report.emailHtml, /combined/i);
  assert.match(report.emailHtml, /Sandbag Lunges/i);
});
