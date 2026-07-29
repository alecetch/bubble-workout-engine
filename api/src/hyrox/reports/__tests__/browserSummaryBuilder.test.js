import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBrowserSummary } from "../browserSummaryBuilder.js";
import { screen4Boxes } from "../../../routes/adminHyroxTestHarness.js";

const RUN_KEYS = ["run_1", "run_2", "run_3", "run_4", "run_5", "run_6", "run_7", "run_8"];
const STATION_KEYS = ["ski_erg", "sled_push", "sled_pull", "burpee_broad_jump", "row", "farmers_carry", "sandbag_lunges", "wall_balls"];

function coreSegments() {
  return [
    ...RUN_KEYS.map((segmentKey) => ({ segmentKey, type: "run" })),
    ...STATION_KEYS.map((segmentKey) => ({ segmentKey, type: "station" })),
    { segmentKey: "total_time", type: "aggregate", percentile: 50 },
  ];
}

function analysisWithLimiter() {
  return {
    segments: coreSegments(),
    headline: {
      biggestLimiter: { segmentKey: "run_1", label: "Run 1", type: "run", timeGapSeconds: 68 },
    },
    limiters: [{ segmentKey: "run_1", label: "Run 1", type: "run", timeGapSeconds: 68 }],
    timePotential: { headlineGainSeconds: 122 },
  };
}

function penaltyDominantAnalysis() {
  return {
    race: { finishTimeSeconds: 5600 },
    segments: [
      ...coreSegments().filter((row) => row.segmentKey !== "total_time"),
      { segmentKey: "total_time", type: "aggregate", percentile: 50, userSeconds: 5600, frameGapSeconds: 600 },
      { segmentKey: "run_8", type: "run", label: "Run 8", timeGapSeconds: 106, frameGapSeconds: 106 },
    ],
    headline: {
      biggestLimiter: { segmentKey: "run_8", label: "Run 8", type: "run", timeGapSeconds: 106 },
    },
    limiters: [{ segmentKey: "run_8", label: "Run 8", type: "run", timeGapSeconds: 106 }],
    penalties: [{ segmentKey: "farmers_carry", station: "farmers_carry", penaltySeconds: 180 }],
    timePotential: { headlineGainSeconds: 106 },
  };
}

function roxzoneLimiterAnalysis(overrides = {}) {
  return {
    segments: [
      ...coreSegments(),
      { segmentKey: "roxzone_time", type: "aggregate", label: "RoxZone", userSeconds: 420, frameGapSeconds: 80, timeGapToMedianSeconds: 80 },
    ],
    headline: {
      biggestLimiter: { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", timeGapSeconds: 80 },
    },
    limiters: [{ segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", timeGapSeconds: 80 }],
    timePotential: { headlineGainSeconds: 80 },
    roxzoneAnalysis: {
      available: true,
      mode: "inferred_total",
      totalSeconds: 420,
      percentile: 28,
      timeGapToMedianSeconds: 80,
    },
    ...overrides,
  };
}

describe("buildBrowserSummary hero insight metric", () => {
  it("does not let a strength insight with no gain metric override the narrative primary", () => {
    const summary = buildBrowserSummary(analysisWithLimiter(), [
      {
        id: "BIGGEST_STRENGTH_EXISTS",
        title: "Run 8 is a relative strength",
        evidence: { segmentKey: "run_8", label: "Run 8", timeGapSeconds: -17 },
      },
    ]);

    assert.equal(summary.heroInsight.title, "Run 1 is your biggest opportunity");
    assert.equal(summary.heroInsight.heroMetric, "2:02");
  });

  it("uses bottom percentile wording for low overall standings", () => {
    const summary = buildBrowserSummary({
      ...analysisWithLimiter(),
      segments: [
        ...coreSegments().filter((segment) => segment.segmentKey !== "total_time"),
        { segmentKey: "total_time", type: "aggregate", percentile: 2 },
      ],
    }, []);

    assert.equal(summary.overallPercentileLabel, "Bottom 2%");
    assert.doesNotMatch(summary.overallPercentileLabel, /Top 98/i);
  });

  it("suppresses percentile summary fields when benchmark data is unavailable", () => {
    const summary = buildBrowserSummary({
      ...analysisWithLimiter(),
      analysisScope: "no_benchmark_data",
      benchmarkContext: {
        available: false,
        comparisonOptions: [{ percentile: 99, topPercent: 1 }],
      },
      segments: [
        ...coreSegments().filter((segment) => segment.segmentKey !== "total_time"),
        { segmentKey: "total_time", type: "aggregate", percentile: 99, fieldPercentile: 99 },
      ],
    }, [], { overallPercentile: 99 });

    assert.equal(summary.overallPercentile, null);
    assert.equal(summary.overallPercentileLabel, null);
    assert.equal(summary.benchmarkGroupLabel, "Benchmark data unavailable");
    assert.equal(summary.comparisonOptions, null);
  });

  it("uses the top insight's own potential gain when one is present", () => {
    const summary = buildBrowserSummary(analysisWithLimiter(), [
      {
        id: "TIME_POTENTIAL_EXISTS",
        title: "You could gain time from cleaner transitions",
        evidence: { potentialGainSeconds: 45 },
      },
    ]);

    assert.equal(summary.heroInsight.title, "You could gain time from cleaner transitions");
    assert.equal(summary.heroInsight.heroMetric, "0:45");
  });

  it("does not let a secondary RoxZone insight override a station primary hero", () => {
    const summary = buildBrowserSummary({
      segments: [
        ...coreSegments(),
        { segmentKey: "wall_balls", type: "station", label: "Wall Balls", frameGapSeconds: 34, timeGapToMedianSeconds: 34 },
        { segmentKey: "roxzone_time", type: "aggregate", label: "Total Roxzone Time", frameGapSeconds: 64, timeGapToMedianSeconds: 64 },
      ],
      headline: {
        biggestLimiter: { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 34 },
      },
      limiters: [{ segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapSeconds: 34 }],
      timePotential: { headlineGainSeconds: 34 },
    }, [
      {
        id: "INSIGHT_009",
        title: "RoxZone time is costing you",
        evidence: { segmentKey: "roxzone_time", coreClaim: "roxzone_efficiency", potentialGainSeconds: 64 },
      },
    ]);

    assert.equal(summary.heroInsight.title, "The Wall Balls station is your biggest opportunity");
    assert.equal(summary.heroInsight.heroMetric, "0:34");
  });

  it("keeps a RoxZone insight when RoxZone is the primary opportunity", () => {
    const summary = buildBrowserSummary(roxzoneLimiterAnalysis(), [
      {
        id: "INSIGHT_009",
        title: "RoxZone time is costing you",
        evidence: { segmentKey: "roxzone_time", coreClaim: "roxzone_efficiency", potentialGainSeconds: 80 },
      },
    ]);

    assert.equal(summary.heroInsight.title, "RoxZone time is costing you");
    assert.equal(summary.heroInsight.heroMetric, "1:20");
  });

  it("keeps limiter fallback behavior when there are no scored insights", () => {
    const summary = buildBrowserSummary(analysisWithLimiter(), []);

    assert.equal(summary.heroInsight.title, "Run 1 is your biggest opportunity");
    assert.equal(summary.heroInsight.heroMetric, "2:02");
  });
});

describe("buildBrowserSummary penalty opportunity framing", () => {
  it("exposes penalties as the fastest controllable win while preserving the largest fitness limiter", () => {
    const summary = buildBrowserSummary(penaltyDominantAnalysis(), []);

    assert.deepEqual(summary.fastestControllableWin, {
      label: "Penalties",
      timeGapFormatted: "3:00",
      caption: "Fastest controllable win",
    });
    assert.deepEqual(summary.largestFitnessLimiter, {
      label: "Run 8",
      timeGapFormatted: "1:46",
    });
    assert.deepEqual(summary.biggestLimiter, {
      label: "Run 8",
      timeGapFormatted: "1:46",
    });
    assert.equal(summary.heroInsight.title, "Penalties are your fastest controllable win");
    assert.equal(summary.heroInsight.heroMetric, "3:00");
  });

  it("renders penalty-heavy harness boxes with distinct fastest-win and fitness-limiter labels", () => {
    const summary = buildBrowserSummary(penaltyDominantAnalysis(), []);
    const boxes = screen4Boxes(summary, "target");

    assert.match(boxes, /\| Fastest Controllable Win \| Penalties .*3:00 \|/);
    assert.match(boxes, /\| Largest Fitness Limiter \| Run 8 .*1:46 \|/);
    assert.doesNotMatch(boxes, /\| Biggest Limiter \| Run 8/);
  });

  it("leaves non-penalty limiter output unchanged", () => {
    const summary = buildBrowserSummary(analysisWithLimiter(), []);

    assert.equal(summary.fastestControllableWin, null);
    assert.deepEqual(summary.largestFitnessLimiter, {
      label: "Run 1",
      timeGapFormatted: "1:08",
    });
    assert.deepEqual(summary.biggestLimiter, {
      label: "Run 1",
      timeGapFormatted: "1:08",
    });
  });
});

describe("buildBrowserSummary data quality note", () => {
  it("adds actionable RoxZone context when RoxZone is the selected limiter", () => {
    const summary = buildBrowserSummary(roxzoneLimiterAnalysis(), []);

    assert.equal(summary.roxzoneAction.label, "RoxZone");
    assert.equal(summary.roxzoneAction.confidence, "partial");
    assert.match(summary.roxzoneAction.emailLead, /transition execution, not station capacity/i);
    assert.match(summary.roxzoneAction.actionText, /direct run-to-station routes/i);
  });

  it("does not add RoxZone action context for non-RoxZone limiters", () => {
    const summary = buildBrowserSummary(analysisWithLimiter(), []);

    assert.equal(summary.roxzoneAction, null);
  });

  it("does not warn about estimated or missing RoxZone when Race Replay detail is available", () => {
    const summary = buildBrowserSummary({
      segments: coreSegments(),
      roxzoneAnalysis: {
        mode: "inferred_total",
        entryExitAvailable: true,
        roxzoneNarrative: { available: true, measurableStationCount: 8 },
      },
      dataQuality: {
        warnings: ["roxzone_inferred_from_unallocated_time", "partial_split_data"],
        inputCompleteness: 0.67,
      },
    });

    assert.equal(summary.dataQualityNote, null);
  });

  it("keeps a limited-summary warning when run or station splits are missing", () => {
    const summary = buildBrowserSummary({
      segments: coreSegments().filter((row) => row.segmentKey !== "run_8"),
      roxzoneAnalysis: {
        mode: "inferred_total",
        entryExitAvailable: true,
      },
      dataQuality: {
        warnings: ["partial_split_data"],
        inputCompleteness: 0.95,
      },
    });

    assert.equal(summary.dataQualityNote, "Some run or station split data is missing, so this summary is directional.");
  });

  it("keeps an estimated-total note when no Race Replay RoxZone detail exists", () => {
    const summary = buildBrowserSummary({
      segments: coreSegments(),
      roxzoneAnalysis: {
        mode: "inferred_total",
        entryExitAvailable: false,
      },
      dataQuality: {
        warnings: ["roxzone_inferred_from_unallocated_time"],
        inputCompleteness: 1,
      },
    });

    assert.equal(summary.dataQualityNote, "RoxZone total is estimated from unallocated race time.");
  });
});

describe("buildBrowserSummary strength copy", () => {
  it("uses unambiguous strongest-station wording instead of raw percentile ordinals", () => {
    const summary = buildBrowserSummary({
      segments: [
        ...coreSegments().filter((row) => row.segmentKey !== "farmers_carry"),
        { segmentKey: "farmers_carry", type: "station", label: "Farmers Carry", userSeconds: 240, timeGapToMedianSeconds: -60, percentile: 1 },
      ],
      headline: {
        biggestStrength: { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", percentile: 1 },
      },
      strengths: [{ segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", timeAdvantageSeconds: 60, percentile: 1 }],
    });
    const rows = screen4Boxes(summary, "analyse");

    assert.equal(summary.biggestStrength.summaryText, "Ahead by 1:00");
    assert.match(rows, /Farmers Carry \(Ahead by 1:00\)/);
    assert.doesNotMatch(rows, /1th percentile|undefined percentile/);
  });

  it("suppresses a headline-only strength when the matching segment row is missing", () => {
    const summary = buildBrowserSummary({
      segments: coreSegments(),
      headline: {
        biggestStrength: { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", percentile: 1 },
      },
    });
    const rows = screen4Boxes(summary, "analyse");

    assert.equal(summary.biggestStrength, null);
    assert.doesNotMatch(rows, /Farmers Carry/);
    assert.doesNotMatch(rows, /1th percentile|undefined percentile/);
  });
});
