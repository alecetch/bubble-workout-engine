import assert from "node:assert/strict";
import test from "node:test";
import { findBiggestLimiter } from "../limiterService.js";

test("findBiggestLimiter prefers named stations over aggregate station time", () => {
  const limiter = findBiggestLimiter([
    { segmentKey: "work_time", label: "Total Station Time", type: "aggregate", timeGapToMedianSeconds: 500, percentile: 10, confidence: "high" },
    { segmentKey: "sled_pull", label: "Sled Pull", type: "station", timeGapToMedianSeconds: 200, percentile: 15, confidence: "high" },
    { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapToMedianSeconds: 150, percentile: 20, confidence: "high" },
    { segmentKey: "row", label: "Row", type: "station", timeGapToMedianSeconds: 100, percentile: 25, confidence: "high" },
  ]);

  assert.notEqual(limiter.type, "aggregate");
  assert.equal(limiter.timeGapSeconds, 200);
});
