import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBrowserSummary } from "../browserSummaryBuilder.js";

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

describe("buildBrowserSummary hero insight metric", () => {
  it("does not show the limiter gap when the top insight has no gain metric", () => {
    const summary = buildBrowserSummary(analysisWithLimiter(), [
      {
        id: "BIGGEST_STRENGTH_EXISTS",
        title: "Run 8 is a relative strength",
        evidence: { segmentKey: "run_8", label: "Run 8", timeGapSeconds: -17 },
      },
    ]);

    assert.equal(summary.heroInsight.title, "Run 8 is a relative strength");
    assert.equal(summary.heroInsight.heroMetric, null);
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

  it("keeps limiter fallback behavior when there are no scored insights", () => {
    const summary = buildBrowserSummary(analysisWithLimiter(), []);

    assert.equal(summary.heroInsight.title, "Run 1 is your biggest opportunity");
    assert.equal(summary.heroInsight.heroMetric, "2:02");
  });
});

describe("buildBrowserSummary data quality note", () => {
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

    assert.equal(summary.dataQualityNote, "Some run or station split data is missing, so the summary is limited.");
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
