import assert from "node:assert/strict";
import test from "node:test";
import { findBiggestLimiter, findBiggestStrength, calculateTimePotential } from "../limiterService.js";

test("calculateTimePotential returns non-zero gain when limiter is a run segment", () => {
  const segments = [
    {
      segmentKey: "run_1",
      label: "Run 1",
      type: "run",
      userSeconds: 309,
      benchmarkMedianSeconds: 272,
      benchmarkValueSeconds: 272,
      timeGapToMedianSeconds: 37,
      goalBenchmarkSeconds: 232,
      timeGapToExactTargetSeconds: null,
      exactTargetSeconds: null,
      percentile: 35,
      confidence: "high",
    },
  ];
  const limiter = { segmentKey: "run_1", type: "run", timeGapSeconds: 37 };
  const result = calculateTimePotential(segments, { race: { finishTimeSeconds: 4842 } }, {}, limiter);
  assert.ok(result.headlineGainSeconds > 0, `expected > 0, got ${result.headlineGainSeconds}`);
  assert.ok(result.conservativeGainSeconds === 37);
});

test("findBiggestLimiter uses timeGapToExactTargetSeconds when available, making station with larger target gap win over run with larger median gap", () => {
  // Run 1 has bigger median gap (37s) but Sandbag Lunges has bigger target gap (133s).
  // When a goal is set and exact targets exist, the headline should reflect target gaps.
  const limiter = findBiggestLimiter([
    {
      segmentKey: "run_1", label: "Run 1", type: "run",
      timeGapToMedianSeconds: 37, timeGapToExactTargetSeconds: 77,
      percentile: 35, confidence: "high",
    },
    {
      segmentKey: "sandbag_lunges", label: "Sandbag Lunges", type: "station",
      timeGapToMedianSeconds: -20, timeGapToExactTargetSeconds: 133,
      percentile: 32, confidence: "high",
    },
  ]);

  assert.equal(limiter.segmentKey, "sandbag_lunges");
  assert.equal(limiter.timeGapSeconds, 133);
});

test("findBiggestLimiter falls back to timeGapToMedianSeconds when no exact target set", () => {
  const limiter = findBiggestLimiter([
    { segmentKey: "run_1", label: "Run 1", type: "run", timeGapToMedianSeconds: 37, percentile: 35, confidence: "high" },
    { segmentKey: "wall_balls", label: "Wall Balls", type: "station", timeGapToMedianSeconds: 20, percentile: 40, confidence: "high" },
  ]);

  assert.equal(limiter.segmentKey, "run_1");
  assert.equal(limiter.timeGapSeconds, 37);
});

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

test("findBiggestLimiter uses frameGapSeconds when present", () => {
  const limiter = findBiggestLimiter([
    {
      segmentKey: "wall_balls",
      label: "Wall Balls",
      type: "station",
      frameGapSeconds: 200,
      timeGapToExactTargetSeconds: 50,
      timeGapToMedianSeconds: 30,
      percentile: 40,
      confidence: "high",
    },
    {
      segmentKey: "sled_push",
      label: "Sled Push",
      type: "station",
      frameGapSeconds: 150,
      timeGapToExactTargetSeconds: 80,
      timeGapToMedianSeconds: 60,
      percentile: 38,
      confidence: "high",
    },
  ]);
  assert.equal(limiter.segmentKey, "wall_balls");
  assert.equal(limiter.timeGapSeconds, 200);
});

test("findBiggestLimiter returns null when all frameGapSeconds are negative", () => {
  const limiter = findBiggestLimiter([
    {
      segmentKey: "wall_balls",
      label: "Wall Balls",
      type: "station",
      frameGapSeconds: -40,
      timeGapToExactTargetSeconds: null,
      timeGapToMedianSeconds: -40,
      percentile: 20,
      confidence: "high",
    },
    {
      segmentKey: "sled_push",
      label: "Sled Push",
      type: "station",
      frameGapSeconds: -20,
      timeGapToExactTargetSeconds: null,
      timeGapToMedianSeconds: -20,
      percentile: 25,
      confidence: "high",
    },
  ]);
  assert.equal(limiter, null);
});

test("findBiggestLimiter ranks by seconds gap only when percentiles disagree", () => {
  const limiter = findBiggestLimiter([
    {
      segmentKey: "sled_push",
      label: "Sled Push",
      type: "station",
      frameGapSeconds: 95,
      percentile: 30,
      confidence: "high",
    },
    {
      segmentKey: "wall_balls",
      label: "Wall Balls",
      type: "station",
      frameGapSeconds: 105,
      percentile: 60,
      confidence: "high",
    },
  ]);

  assert.equal(limiter.segmentKey, "wall_balls");
  assert.equal(limiter.timeGapSeconds, 105);
});

test("findBiggestStrength ranks by seconds advantage without requiring percentile", () => {
  const strength = findBiggestStrength([
    {
      segmentKey: "sled_pull",
      label: "Sled Pull",
      type: "station",
      frameGapSeconds: -35,
      confidence: "high",
    },
    {
      segmentKey: "ski_erg",
      label: "SkiErg",
      type: "station",
      frameGapSeconds: -55,
      percentile: 62,
      confidence: "high",
    },
  ]);

  assert.equal(strength.segmentKey, "ski_erg");
  assert.equal(strength.timeAdvantageSeconds, 55);
});
