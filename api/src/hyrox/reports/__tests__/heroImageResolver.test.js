import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveHeroImage } from "../heroImageResolver.js";

function station(segmentKey, overrides = {}) {
  return {
    segmentKey,
    type: "station",
    userSeconds: 300,
    timeGapToMedianSeconds: 0,
    percentile: 50,
    ...overrides,
  };
}

describe("resolveHeroImage", () => {
  it("uses the canonical headline limiter before raw median station gaps", () => {
    const image = resolveHeroImage({
      headline: {
        biggestLimiter: { segmentKey: "sled_push", label: "Sled Push", type: "station", timeGapSeconds: 90, percentile: 35 },
      },
      limiters: [
        { segmentKey: "sled_push", label: "Sled Push", type: "station", timeGapSeconds: 90, percentile: 35 },
      ],
      stationBreakdown: [
        { segmentKey: "sled_push", label: "Sled Push", timeGapSeconds: 90, percentile: 35, confidence: "high" },
        { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: 80, percentile: 25, confidence: "high" },
      ],
      segments: [
        station("sled_push", { timeGapToMedianSeconds: 40, frameGapSeconds: 90, percentile: 35 }),
        station("wall_balls", { timeGapToMedianSeconds: 160, frameGapSeconds: 80, percentile: 25 }),
      ],
    }, { sex: "female", calculatorMode: "target" });

    assert.match(image, /hyrox-sled-push-female\.png$/);
    assert.doesNotMatch(image, /hyrox-wall-balls-female\.png$/);
  });

  it("uses the canonical strength before independently ranking station percentiles", () => {
    const image = resolveHeroImage({
      headline: {
        biggestLimiter: null,
        biggestStrength: { segmentKey: "sled_push", label: "Sled Push", percentile: 82 },
      },
      strengths: [
        { segmentKey: "sled_push", label: "Sled Push", percentile: 82 },
      ],
      stationBreakdown: [
        { segmentKey: "sled_push", label: "Sled Push", timeGapSeconds: -80, percentile: 82, confidence: "high" },
        { segmentKey: "wall_balls", label: "Wall Balls", timeGapSeconds: -120, percentile: 97, confidence: "high" },
      ],
      segments: [
        { segmentKey: "total_time", type: "aggregate", userSeconds: 3600, timeGapToMedianSeconds: -45, percentile: 92 },
        { segmentKey: "run_1", type: "run", userSeconds: 300, timeGapToMedianSeconds: -20, percentile: 90 },
        station("sled_push", { timeGapToMedianSeconds: -80, percentile: 82 }),
        station("wall_balls", { timeGapToMedianSeconds: -120, percentile: 97 }),
      ],
    }, { sex: "male", calculatorMode: "analyse" });

    assert.match(image, /hyrox-sled-push-male\.png$/);
    assert.doesNotMatch(image, /hyrox-wall-balls-male\.png$/);
  });
});
