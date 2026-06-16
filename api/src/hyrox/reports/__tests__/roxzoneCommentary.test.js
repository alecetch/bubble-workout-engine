import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRoxzoneSection } from "../roxzoneCommentary.js";

function asArray(result) {
  return Array.isArray(result) ? result : [result];
}

describe("buildRoxzoneSection", () => {
  it("returns unavailable message when no data", () => {
    const result = buildRoxzoneSection({ roxzoneAnalysis: { available: false } });
    assert.match(asArray(result).join(" "), /no transition time data/i);
  });

  it("inferred_total, slow: includes percentile, gap, and tips", () => {
    const analysis = { roxzoneAnalysis: { available: true, mode: "inferred_total", totalSeconds: 225, percentOfTotalTime: 0.04, percentile: 30, timeGapToMedianSeconds: 55 } };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /3:45|4:00|225/);
    assert.match(lines, /30th|29th|31st/i);
    assert.match(lines, /55|0:55/);
    assert.match(lines, /Ways to cut transition time/i);
  });

  it("inferred_total, efficient: positive framing, no tips", () => {
    const analysis = { roxzoneAnalysis: { available: true, mode: "inferred_total", totalSeconds: 150, percentOfTotalTime: 0.03, percentile: 62, timeGapToMedianSeconds: -15 } };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /efficient/i);
    assert.equal(lines.includes("Ways to cut transition time"), false);
  });

  it("inferred_total, no percentile: shows fallback text and caveat", () => {
    const analysis = { roxzoneAnalysis: { available: true, mode: "inferred_total", totalSeconds: 200, percentOfTotalTime: 0.035, percentile: null, timeGapToMedianSeconds: null } };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /percentile comparison is not available/i);
    assert.match(lines, /estimated from unallocated/i);
  });

  it("explicit_splits, slow with worst transition >= 20s: calls out worst transition", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 280,
        percentOfTotalTime: 0.05,
        percentile: 25,
        timeGapToMedianSeconds: 80,
        worstTransition: { segmentKey: "roxzone_3", label: "Roxzone 3", timeGapToMedianSeconds: 22 },
      },
    };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /25th|24th|26th/i);
    assert.match(lines, /Roxzone 3/);
    assert.match(lines, /Ways to cut transition time/i);
  });

  it("explicit_splits, efficient: positive framing, no tips", () => {
    const analysis = { roxzoneAnalysis: { available: true, mode: "explicit_splits", totalSeconds: 140, percentOfTotalTime: 0.025, percentile: 72, timeGapToMedianSeconds: -20, worstTransition: null } };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /efficient/i);
    assert.equal(lines.includes("Ways to cut transition time"), false);
  });

  it("explicit_splits, worst transition < 20s: tips shown but worst transition not called out", () => {
    const analysis = {
      roxzoneAnalysis: {
        available: true,
        mode: "explicit_splits",
        totalSeconds: 240,
        percentOfTotalTime: 0.04,
        percentile: 35,
        timeGapToMedianSeconds: 50,
        worstTransition: { segmentKey: "roxzone_5", label: "Roxzone 5", timeGapToMedianSeconds: 12 },
      },
    };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /Ways to cut transition time/i);
    assert.equal(lines.includes("Roxzone 5"), false);
  });

  it("returns array (not string) when tips are appended", () => {
    const analysis = { roxzoneAnalysis: { available: true, mode: "inferred_total", totalSeconds: 240, percentOfTotalTime: 0.04, percentile: 28, timeGapToMedianSeconds: 60 } };
    const result = buildRoxzoneSection(analysis);
    assert.ok(Array.isArray(result), "Expected array when tips are appended");
  });

  it("percentOfTotalTime is shown as integer percent", () => {
    const analysis = { roxzoneAnalysis: { available: true, mode: "explicit_splits", totalSeconds: 180, percentOfTotalTime: 0.05, percentile: 65, timeGapToMedianSeconds: -10, worstTransition: null } };
    const lines = asArray(buildRoxzoneSection(analysis)).join("\n");
    assert.match(lines, /5%/);
  });
});
