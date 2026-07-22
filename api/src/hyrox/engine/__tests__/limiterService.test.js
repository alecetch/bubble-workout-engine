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

test("findBiggestLimiter skips a low-confidence (e.g. repaired/estimated) segment even when it has the largest gap", () => {
  const limiter = findBiggestLimiter([
    { segmentKey: "row", label: "Row", type: "station", timeGapToMedianSeconds: 131, percentile: null, confidence: "low", estimated: true },
    { segmentKey: "burpee_broad_jump", label: "Burpee Broad Jump", type: "station", timeGapToMedianSeconds: 91, percentile: 12, confidence: "high" },
  ]);

  assert.equal(limiter.segmentKey, "burpee_broad_jump");
  assert.equal(limiter.timeGapSeconds, 91);
});

test("findBiggestLimiter returns null when the only candidate with a positive gap is low-confidence", () => {
  const limiter = findBiggestLimiter([
    { segmentKey: "row", label: "Row", type: "station", timeGapToMedianSeconds: 131, percentile: null, confidence: "low", estimated: true },
    { segmentKey: "run_1", label: "Run 1", type: "run", timeGapToMedianSeconds: -20, percentile: 60, confidence: "high" },
  ]);

  assert.equal(limiter, null);
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

test("findBiggestLimiter prefers an individual split over a larger aggregate run gap", () => {
  const limiter = findBiggestLimiter([
    {
      segmentKey: "run_time",
      label: "Total Run Time",
      type: "aggregate",
      frameGapSeconds: 121,
      percentile: 25,
      confidence: "high",
    },
    {
      segmentKey: "run_1",
      label: "Run 1",
      type: "run",
      frameGapSeconds: 72,
      percentile: 35,
      confidence: "high",
    },
    {
      segmentKey: "burpee_broad_jump",
      label: "Burpee Broad Jump",
      type: "station",
      frameGapSeconds: 54,
      percentile: 38,
      confidence: "high",
    },
  ]);

  assert.equal(limiter.segmentKey, "run_1");
  assert.equal(limiter.timeGapSeconds, 72);
});

test("findBiggestLimiter can still select an aggregate when no individual split qualifies", () => {
  const limiter = findBiggestLimiter([
    {
      segmentKey: "run_time",
      label: "Total Run Time",
      type: "aggregate",
      frameGapSeconds: 121,
      percentile: 25,
      confidence: "high",
    },
    {
      segmentKey: "run_1",
      label: "Run 1",
      type: "run",
      frameGapSeconds: -12,
      percentile: 70,
      confidence: "high",
    },
  ]);

  assert.equal(limiter.segmentKey, "run_time");
  assert.equal(limiter.timeGapSeconds, 121);
});

test("findBiggestLimiter selects RoxZone when its gap clearly dominates the field", () => {
  const limiter = findBiggestLimiter([
    {
      segmentKey: "roxzone_time",
      label: "RoxZone",
      type: "aggregate",
      frameGapSeconds: 200,
      timeGapToMedianSeconds: 200,
      percentile: 18,
      confidence: "high",
    },
    {
      segmentKey: "sled_pull",
      label: "Sled Pull",
      type: "station",
      frameGapSeconds: 63,
      timeGapToMedianSeconds: 63,
      percentile: 35,
      confidence: "high",
    },
    {
      segmentKey: "wall_balls",
      label: "Wall Balls",
      type: "station",
      frameGapSeconds: 52,
      timeGapToMedianSeconds: 52,
      percentile: 42,
      confidence: "high",
    },
  ]);

  assert.equal(limiter.segmentKey, "roxzone_time");
  assert.equal(limiter.label, "RoxZone");
  assert.equal(limiter.type, "aggregate");
  assert.equal(limiter.timeGapSeconds, 200);
});

test("findBiggestLimiter ignores RoxZone when it is not a dominant gap", () => {
  const limiter = findBiggestLimiter([
    {
      segmentKey: "roxzone_time",
      label: "RoxZone",
      type: "aggregate",
      frameGapSeconds: 100,
      timeGapToMedianSeconds: 100,
      percentile: 30,
      confidence: "high",
    },
    {
      segmentKey: "sled_pull",
      label: "Sled Pull",
      type: "station",
      frameGapSeconds: 55,
      timeGapToMedianSeconds: 55,
      percentile: 35,
      confidence: "high",
    },
  ]);

  assert.equal(limiter.segmentKey, "sled_pull");
  assert.equal(limiter.timeGapSeconds, 55);
});

test("findBiggestLimiter selects a dominant RoxZone gap under 90s for a tight elite race", () => {
  // Mirrors a real sub-60 profile: every station/run gap is small, but RoxZone is
  // clearly the standout weakness by the 2.5x dominance ratio even though its
  // absolute gap (50s) is well under what a larger-margin race would show.
  const limiter = findBiggestLimiter([
    { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", frameGapSeconds: 50, percentile: 20, confidence: "high" },
    { segmentKey: "wall_balls", label: "Wall Balls", type: "station", frameGapSeconds: 19, percentile: 60, confidence: "high" },
    { segmentKey: "burpee_broad_jump", label: "Burpee Broad Jump", type: "station", frameGapSeconds: 16, percentile: 65, confidence: "high" },
  ]);

  assert.equal(limiter.segmentKey, "roxzone_time");
  assert.equal(limiter.label, "RoxZone");
  assert.equal(limiter.timeGapSeconds, 50);
});

test("findBiggestStrength prefers an individual split over a larger aggregate run advantage", () => {
  const strength = findBiggestStrength([
    {
      segmentKey: "run_time",
      label: "Total Run Time",
      type: "aggregate",
      frameGapSeconds: -184,
      percentile: 95,
      confidence: "high",
    },
    {
      segmentKey: "run_8",
      label: "Run 8",
      type: "run",
      frameGapSeconds: -64,
      percentile: 88,
      confidence: "high",
    },
    {
      segmentKey: "sled_pull",
      label: "Sled Pull",
      type: "station",
      frameGapSeconds: -58,
      percentile: 86,
      confidence: "high",
    },
  ]);

  assert.equal(strength.segmentKey, "run_8");
  assert.equal(strength.timeAdvantageSeconds, 64);
});

test("findBiggestStrength prefers a doubles station split over a larger total station advantage", () => {
  const strength = findBiggestStrength([
    {
      segmentKey: "work_time",
      label: "Total Station Time",
      type: "aggregate",
      frameGapSeconds: -893,
      percentile: 95,
      confidence: "high",
    },
    {
      segmentKey: "burpee_broad_jump",
      label: "Burpee Broad Jump",
      type: "station",
      frameGapSeconds: -178,
      percentile: 84,
      confidence: "low",
    },
    {
      segmentKey: "sled_pull",
      label: "Sled Pull",
      type: "station",
      frameGapSeconds: -151,
      percentile: 82,
      confidence: "low",
    },
  ]);

  assert.equal(strength.segmentKey, "burpee_broad_jump");
  assert.equal(strength.label, "Burpee Broad Jump");
  assert.equal(strength.timeAdvantageSeconds, 178);
});

test("findBiggestStrength ranks the real doubles candidate set without non-transitive aggregate ordering", () => {
  const strength = findBiggestStrength([
    { segmentKey: "work_time", label: "Total Station Time", type: "aggregate", frameGapSeconds: -893, confidence: "high" },
    { segmentKey: "roxzone_time", label: "Total Roxzone Time", type: "aggregate", frameGapSeconds: -288, confidence: "high" },
    { segmentKey: "ski_erg", label: "SkiErg", type: "station", frameGapSeconds: -58, confidence: "high" },
    { segmentKey: "sled_push", label: "Sled Push", type: "station", frameGapSeconds: -65, confidence: "high" },
    { segmentKey: "sled_pull", label: "Sled Pull", type: "station", frameGapSeconds: -151, confidence: "high" },
    { segmentKey: "burpee_broad_jump", label: "Burpee Broad Jump", type: "station", frameGapSeconds: -178, confidence: "high" },
    { segmentKey: "row", label: "Row", type: "station", frameGapSeconds: -93, confidence: "high" },
    { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", frameGapSeconds: -11, confidence: "high" },
    { segmentKey: "sandbag_lunges", label: "Sandbag Lunges", type: "station", frameGapSeconds: -138, confidence: "high" },
    { segmentKey: "wall_balls", label: "Wall Balls", type: "station", frameGapSeconds: -142, confidence: "high" },
    { segmentKey: "run_3", label: "Run 3", type: "run", frameGapSeconds: -40, confidence: "high" },
    { segmentKey: "run_4", label: "Run 4", type: "run", frameGapSeconds: -36, confidence: "high" },
  ]);

  assert.equal(strength.segmentKey, "burpee_broad_jump");
  assert.equal(strength.label, "Burpee Broad Jump");
  assert.equal(strength.timeAdvantageSeconds, 178);
});

test("findBiggestStrength allows a genuinely dominant RoxZone strength to win", () => {
  const strength = findBiggestStrength([
    { segmentKey: "roxzone_time", label: "RoxZone", type: "aggregate", frameGapSeconds: -500, confidence: "high" },
    { segmentKey: "burpee_broad_jump", label: "Burpee Broad Jump", type: "station", frameGapSeconds: -120, confidence: "high" },
    { segmentKey: "sled_pull", label: "Sled Pull", type: "station", frameGapSeconds: -90, confidence: "high" },
    { segmentKey: "work_time", label: "Total Station Time", type: "aggregate", frameGapSeconds: -200, confidence: "high" },
  ]);

  assert.equal(strength.segmentKey, "roxzone_time");
  assert.equal(strength.label, "RoxZone");
  assert.equal(strength.timeAdvantageSeconds, 500);
});

test("findBiggestStrength can still select an aggregate when no individual split qualifies", () => {
  const strength = findBiggestStrength([
    {
      segmentKey: "work_time",
      label: "Total Station Time",
      type: "aggregate",
      frameGapSeconds: -70,
      percentile: 90,
      confidence: "high",
    },
    {
      segmentKey: "sled_pull",
      label: "Sled Pull",
      type: "station",
      frameGapSeconds: -8,
      percentile: 70,
      confidence: "high",
    },
  ]);

  assert.equal(strength.segmentKey, "work_time");
  assert.equal(strength.timeAdvantageSeconds, 70);
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
