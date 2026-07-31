import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHyroxReportNarrative, normalizeNarrativeLabel } from "../reportNarrativeModel.js";

function baseAnalysis(overrides = {}) {
  return {
    calculatorMode: "target",
    race: { finishTimeSeconds: 4360, targetTimeSeconds: 3900 },
    benchmarkContext: {
      primaryBenchmarkGroup: { label: "Open Male" },
      goalBenchmarkGroup: { label: "sub-65", targetFinishSeconds: 3900 },
      comparisonOptions: [{ label: "Worldwide Open Male", percentile: 82, topPercent: 18 }],
    },
    headline: {
      biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 95 },
    },
    limiters: [{ segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 95 }],
    timePotential: { headlineGainSeconds: 95 },
    segments: [
      { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4360, frameGapSeconds: 460, percentile: 63 },
      { segmentKey: "work_time", type: "aggregate", label: "Stations", userSeconds: 1900, frameGapSeconds: 170 },
      { segmentKey: "run_time", type: "aggregate", label: "Running", userSeconds: 2200, frameGapSeconds: 150 },
      { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 395, frameGapSeconds: 95, timeGapToExactTargetSeconds: 95 },
    ],
    penalties: [],
    ...overrides,
  };
}

describe("buildHyroxReportNarrative", () => {
  it("normalizes athlete-facing primary labels", () => {
    assert.equal(normalizeNarrativeLabel("Total Roxzone Time"), "RoxZone");
    assert.equal(normalizeNarrativeLabel("skierg"), "SkiErg");
  });

  it("builds a single-track station opportunity contract", () => {
    const narrative = buildHyroxReportNarrative({ analysisJson: baseAnalysis() });

    assert.equal(narrative.headlineMode, "single_track");
    assert.equal(narrative.primaryOpportunity.normalizedLabel, "Wall Balls");
    assert.equal(narrative.rankDisplays.allowed, true);
    assert.equal(narrative.benchmark.available, true);
  });

  it("uses team-aware hero and main insight wording for doubles", () => {
    const narrative = buildHyroxReportNarrative({
      analysisJson: baseAnalysis({
        athlete: { division: "doubles_male" },
        race: { finishTimeSeconds: 4360, targetTimeSeconds: 3900, division: "doubles_male" },
      }),
    });

    assert.equal(narrative.teamContext.isDoubles, true);
    assert.equal(narrative.hero.title, "The Wall Balls station is your team's biggest opportunity");
    assert.match(narrative.mainInsight.opener, /your team's biggest opportunity/i);
    assert.match(narrative.mainInsight.opener, /combined team time/i);
  });

  it("makes dominant penalties the primary opportunity", () => {
    const narrative = buildHyroxReportNarrative({
      analysisJson: baseAnalysis({
        segments: [
          { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4360, frameGapSeconds: 600, percentile: 63 },
          { segmentKey: "run_2", type: "run", label: "Run 2", userSeconds: 330, frameGapSeconds: 120 },
        ],
        headline: { biggestLimiter: { segmentKey: "run_2", label: "Run 2", type: "run", timeGapSeconds: 120 } },
        penalties: [{ segmentKey: "wall_balls", penaltySeconds: 240 }],
      }),
    });

    assert.equal(narrative.headlineMode, "penalty_first");
    assert.equal(narrative.primaryOpportunity.normalizedLabel, "Penalties");
    assert.equal(narrative.largestFitnessLimiter.normalizedLabel, "Run 2");
  });

  it("keeps material secondary penalties out of the primary fitness headline", () => {
    const narrative = buildHyroxReportNarrative({
      analysisJson: baseAnalysis({
        segments: [
          { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4360, frameGapSeconds: 700, percentile: 63 },
          { segmentKey: "run_2", type: "run", label: "Run 2", userSeconds: 330, frameGapSeconds: 190 },
        ],
        headline: { biggestLimiter: { segmentKey: "run_2", label: "Run 2", type: "run", timeGapSeconds: 190 } },
        penalties: [{ segmentKey: "wall_balls", penaltySeconds: 90 }],
      }),
    });

    assert.equal(narrative.headlineMode, "fitness_first_with_penalty_win");
    assert.equal(narrative.primaryOpportunity.normalizedLabel, "Run 2");
    assert.equal(narrative.fastestControllableWin.normalizedLabel, "Penalties");
  });

  it("suppresses rank displays for no-benchmark reports", () => {
    const narrative = buildHyroxReportNarrative({
      analysisJson: baseAnalysis({
        analysisScope: "no_benchmark_data",
        benchmarkContext: { available: false },
        segments: [{ segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4360, percentile: 99 }],
      }),
      athleteContext: { overallPercentile: 99 },
    });

    assert.equal(narrative.headlineMode, "no_benchmark_directional");
    assert.equal(narrative.benchmark.available, false);
    assert.equal(narrative.rankDisplays.allowed, false);
    assert.equal(narrative.rankDisplays.primary, null);
  });

  it("marks anomalous data as directional", () => {
    const narrative = buildHyroxReportNarrative({
      analysisJson: baseAnalysis({
        dataQuality: { warnings: ["unreconciled_total_anomaly"], inputCompleteness: 0.9 },
      }),
    });

    assert.equal(narrative.headlineMode, "data_anomaly_directional");
    assert.equal(narrative.dataQuality.firmClaimsAllowed, false);
    assert.equal(narrative.dataQuality.artifactLabelPolicy.primaryLabel, "Directional opportunity");
  });

  it("requires a category bridge when aggregate and segment leaders differ", () => {
    const narrative = buildHyroxReportNarrative({
      analysisJson: baseAnalysis({
        segments: [
          { segmentKey: "total_time", type: "aggregate", label: "Total Time", userSeconds: 4360, frameGapSeconds: 460, percentile: 63 },
          { segmentKey: "run_time", type: "aggregate", label: "Running", userSeconds: 2200, frameGapSeconds: 250 },
          { segmentKey: "wall_balls", type: "station", label: "Wall Balls", userSeconds: 395, frameGapSeconds: 95, timeGapToExactTargetSeconds: 95 },
        ],
      }),
    });

    assert.equal(narrative.categorySegmentBridge.required, true);
    assert.match(narrative.categorySegmentBridge.sentence, /Running is the larger category gap/i);
  });
});

