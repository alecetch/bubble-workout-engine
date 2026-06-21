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
