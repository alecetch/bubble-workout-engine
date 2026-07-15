import assert from "node:assert/strict";
import test from "node:test";
import { RUN_KEYS, STATION_KEYS } from "../../src/hyrox/config/segmentMap.js";
import { setBenchmarkData } from "../../src/hyrox/engine/benchmarkService.js";
import { analyseSubmission } from "../../src/hyrox/engine/hyroxAnalysisEngine.js";
import { assembleReport } from "../../src/hyrox/reports/reportAssembler.js";

const DATASET_VERSION = "historical_hyrox_2026_06_v1";
const GROUP_KEY = `hyrox:${DATASET_VERSION}:open:male:30-34`;
const ALL_GROUP_KEY = `hyrox:${DATASET_VERSION}:open:male:all`;

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

const BAND_TOTAL_MEDIANS = Object.freeze({
  sub_120: 7200,
  sub_105: 6300,
  sub_70: 4080,
  sub_65: 3840,
  sub_60: 3480,
});

const BAND_SAMPLE_SIZES = Object.freeze({
  sub_120: 12120,
  sub_105: 10105,
  sub_70: 7070,
  sub_65: 6565,
  sub_60: 6060,
});

function bandKey(band) {
  return `hyrox:${DATASET_VERSION}:band:${band}:open:male`;
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
  const groups = [
    {
      groupKey: GROUP_KEY,
      datasetVersion: DATASET_VERSION,
      division: "open",
      gender: "male",
      ageGroup: "30-34",
      sampleSize: 500,
    },
    {
      groupKey: ALL_GROUP_KEY,
      datasetVersion: DATASET_VERSION,
      division: "open",
      gender: "male",
      ageGroup: "all",
      fallbackLevel: 1,
      sampleSize: 750,
    },
  ];
  const metrics = [];

  for (const [metricKey, median] of Object.entries(BASE_MEDIANS)) {
    metrics.push(metric(GROUP_KEY, metricKey, median, 500));
    metrics.push(metric(ALL_GROUP_KEY, metricKey, median, 750));
  }
  metrics.push(metric(GROUP_KEY, "run_fade_pct", 5, 500));
  metrics.push(metric(ALL_GROUP_KEY, "run_fade_pct", 5, 750));

  for (const [band, totalMedian] of Object.entries(BAND_TOTAL_MEDIANS)) {
    const sampleSize = BAND_SAMPLE_SIZES[band];
    const groupKey = bandKey(band);
    groups.push({
      groupKey,
      datasetVersion: DATASET_VERSION,
      division: "open",
      gender: "male",
      performanceBand: band,
      sampleSize,
    });
    for (const [metricKey, median] of Object.entries(BASE_MEDIANS)) {
      metrics.push(metric(groupKey, metricKey, metricKey === "total_time" ? totalMedian : median, sampleSize));
    }
    metrics.push(metric(groupKey, "run_fade_pct", 5, sampleSize));
  }

  setBenchmarkData({ groups, metrics });
}

function submission(finishTimeSeconds) {
  const stationTimes = {
    ski_erg: 300,
    sled_push: 120,
    sled_pull: 120,
    burpee_broad_jump: 300,
    row: 300,
    farmers_carry: 120,
    sandbag_lunges: 240,
    wall_balls: 300,
  };

  return {
    calculatorMode: "analyse",
    athlete: {
      name: "Benchmark Band Test",
      email: "benchmark-band@example.com",
      sex: "male",
      gender: "male",
      ageOnRaceDay: 34,
      ageGroup: "30-34",
      division: "open",
    },
    race: {
      raceName: "HYROX Benchmark Band Fixture",
      raceDate: "2026-01-01",
      division: "open",
      finishTimeSeconds,
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
    athleteContext: { displayName: "Benchmark Band Test" },
  };
}

function benchmarkLensSection(html) {
  const start = String(html).indexOf('data-section="benchmark-lens"');
  assert.notEqual(start, -1, "Benchmark Lens section should render");
  const nextRow = String(html).indexOf("\n  <tr", start + 1);
  return nextRow > start ? String(html).slice(start, nextRow) : String(html).slice(start);
}

function comparisonGroupRow(html) {
  const start = String(html).indexOf("Comparison group");
  assert.notEqual(start, -1, "Comparison group row should render");
  const end = String(html).indexOf("</table>", start);
  return end > start ? String(html).slice(start, end) : String(html).slice(start);
}

function rangeAssertionsForBand(band) {
  const ranges = {
    sub_120: ["Under 120:00"],
    sub_105: ["Under 105:00"],
    sub_70: ["Under 70:00"],
    sub_65: ["Under 65:00"],
  };
  return ranges[band];
}

test.beforeEach(() => {
  seedBenchmarks();
});

const scenarios = [
  { name: "catch_up", finishTimeSeconds: 4190, expectedFrame: "catch_up" },
  { name: "competitive at median edge", finishTimeSeconds: 4140, expectedFrame: "competitive" },
  { name: "competitive ahead of median", finishTimeSeconds: 4050, expectedFrame: "competitive" },
  { name: "next_band", finishTimeSeconds: 3960, expectedFrame: "next_band" },
  { name: "next_band_stretch", finishTimeSeconds: 6600, expectedFrame: "next_band_stretch" },
];

for (const scenario of scenarios) {
  test(`analyse email comparison group matches frame gap band for ${scenario.name}`, () => {
    const input = submission(scenario.finishTimeSeconds);
    const analysis = analyseSubmission(input);
    const report = assembleReport({
      raceResult: input.race,
      analysisJson: analysis,
      insights: [],
      athleteContext: input.athleteContext,
      outputType: "email_report",
      calculatorMode: "analyse",
    });
    const total = analysis.segments.find((segment) => segment.segmentKey === "total_time");
    const escalated =
      Number.isFinite(total?.nextBandMedianSeconds) &&
      total.frameGapSeconds === total.timeGapToNextBandMedianSeconds &&
      total.timeGapToNextBandMedianSeconds !== total.timeGapToMedianSeconds;
    const analysisFrame = analysis.benchmarkContext.analysisFrame;
    const expectedBand = escalated ? analysisFrame.comparisonBand : analysis.benchmarkContext.achievedBand;
    const unexpectedBand = escalated ? analysis.benchmarkContext.achievedBand : analysisFrame.comparisonBand;
    const expectedLabels = rangeAssertionsForBand(expectedBand);
    const unexpectedRange = rangeAssertionsForBand(unexpectedBand);
    const lens = benchmarkLensSection(report.emailHtml);
    const comparisonRow = comparisonGroupRow(lens);

    assert.equal(analysisFrame.frame, scenario.expectedFrame);
    assert.equal(Boolean(analysisFrame.useNextBandGaps), scenario.name === "competitive ahead of median");
    assert.ok(expectedLabels.every((label) => comparisonRow.includes(label)), "Benchmark Lens comparison group should describe the band that supplied frame gaps");
    assert.ok(report.emailHtml.includes(`Compared against ${BAND_SAMPLE_SIZES[expectedBand].toLocaleString()} `));

    if (unexpectedRange && unexpectedBand !== expectedBand) {
      for (const label of unexpectedRange) {
        assert.equal(comparisonRow.includes(label), false, "Benchmark Lens comparison group should not use the other band's label");
      }
      assert.equal(
        report.emailHtml.includes(`Compared against ${BAND_SAMPLE_SIZES[unexpectedBand].toLocaleString()} `),
        false,
        "hero comparison line should not use the other band's sample size",
      );
    }

    assert.equal(
      lens.includes("that's the next benchmark worth chasing"),
      escalated,
      "escalation explanation should appear exactly when the frame gaps came from the next band",
    );
  });
}
