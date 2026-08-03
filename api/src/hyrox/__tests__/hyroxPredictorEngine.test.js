import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateConfidenceScore,
  computeStrengthProfile,
  estimateRunPace,
  estimateOneRepMax,
  estimateThreeRepMax,
  runPredictionEngine,
} from "../hyroxPredictorEngine.js";

function minimal(overrides = {}) {
  return {
    athlete: { email: "test@example.com", sex: "male", division: "open", ...(overrides.athlete ?? {}) },
    benchmarks: { run5kSeconds: 1200, backSquat3RM: 120, deadlift3RM: 150, bodyweightKg: 85, ...(overrides.benchmarks ?? {}) },
    context: { ...(overrides.context ?? {}) },
    race: { ...(overrides.race ?? {}) },
    marketingConsent: false,
  };
}

test("confidence score caps at 0.64 without race history, even with bodyweight", () => {
  const result = runPredictionEngine(minimal());
  assert.equal(result.confidenceScore, 0.64);
  assert.equal(result.confidenceLabel, "moderate");
});

test("confidence score caps at 0.90", () => {
  const result = runPredictionEngine(minimal({
    benchmarks: {
      run10kSeconds: 2520,
      rowErg2kSeconds: 430,
      skiErg1kSeconds: 250,
      wallBallRepsIn2Min: 55,
      farmerCarryTimeSeconds: 140,
      previousHyroxSeconds: 5400,
    },
    context: {
      trainingFrequency: "6+",
      primaryBackground: "endurance",
      weeklyRunningKm: "45+",
    },
  }));
  assert.equal(result.confidenceScore, 0.9);
  assert.equal(result.confidenceLabel, "high");
});

test("a well-instrumented first-timer caps below good/high without race history", () => {
  const result = runPredictionEngine(minimal({
    benchmarks: {
      run10kSeconds: 2520,
      rowErg2kSeconds: 430,
      skiErg1kSeconds: 250,
      wallBallRepsIn2Min: 55,
      farmerCarryTimeSeconds: 140,
    },
    context: {
      trainingFrequency: "6+",
      primaryBackground: "endurance",
      weeklyRunningKm: "45+",
    },
  }));

  assert.equal(result.confidenceScore, 0.64);
  assert.equal(result.confidenceLabel, "moderate");
  assert.equal(result.predictionMode, "better");
});

test("race history can exceed the first-timer confidence ceiling", () => {
  assert.ok(calculateConfidenceScore({
    previousHyroxSeconds: 5400,
    run5kSeconds: 1200,
    backSquat3RM: 120,
    deadlift3RM: 150,
  }) > 0.64);
});

test("run pace uses endurance background and 30-45 km/week", () => {
  const pace = estimateRunPace({ run5kSeconds: 1200 }, { primaryBackground: "endurance", weeklyRunningKm: "30-45" });
  assert.equal(Math.round(pace), 282);
});

test("strength profile falls back to absolute tier without bodyweight", () => {
  const profile = computeStrengthProfile({ backSquat3RM: 120, deadlift3RM: 150 }, "male");

  assert.equal(profile.absoluteTier, 3);
  assert.equal(profile.relativeTier, 3);
  assert.equal(profile.blendedTier, 3);
  assert.equal(profile.hasBodyweight, false);
});

test("bodyweight shifts the relative strength tier", () => {
  const lighter = computeStrengthProfile({ backSquat3RM: 120, deadlift3RM: 150 }, "male", 70);
  const heavier = computeStrengthProfile({ backSquat3RM: 120, deadlift3RM: 150 }, "male", 110);

  assert.notEqual(lighter.relativeTier, heavier.relativeTier);
  assert.ok(lighter.blendedTier >= heavier.blendedTier);
});

test("estimateThreeRepMax is an identity when reps is 3 or omitted", () => {
  assert.equal(estimateThreeRepMax(120, 3), 120);
  assert.equal(estimateThreeRepMax(120, undefined), 120);
});

test("estimateOneRepMax treats a 1RM as itself and converts higher reps upward", () => {
  assert.equal(estimateOneRepMax(120, 1), 120);
  assert.ok(estimateOneRepMax(100, 8) > 100);
});

test("estimateThreeRepMax converts a lower-rep max down to a lighter 3RM-equivalent", () => {
  // A true 1RM is heavier than what you could lift for 3, so the estimated 3RM should be
  // less than the raw entered 1RM weight.
  const estimated = estimateThreeRepMax(140, 1);
  assert.ok(estimated < 140);
  assert.ok(estimated > 120);
});

test("estimateThreeRepMax converts a higher-rep max up to a heavier 3RM-equivalent", () => {
  // A true 8RM is lighter than what you could lift for 3, so the estimated 3RM should be
  // more than the raw entered 8RM weight.
  const estimated = estimateThreeRepMax(100, 8);
  assert.ok(estimated > 100);
});

test("estimateThreeRepMax ignores an out-of-range or non-integer rep count", () => {
  assert.equal(estimateThreeRepMax(120, 11), 120);
  assert.equal(estimateThreeRepMax(120, 0), 120);
  assert.equal(estimateThreeRepMax(120, 2.5), 120);
});

test("a 1RM-labeled squat produces a higher strength tier than treating the same weight as a raw 3RM", () => {
  const treatedAsOneRepMax = computeStrengthProfile({ backSquat3RM: 140, backSquatReps: 1, deadlift3RM: 150 }, "male");
  const treatedAsThreeRepMax = computeStrengthProfile({ backSquat3RM: 140, deadlift3RM: 150 }, "male");

  assert.ok(treatedAsOneRepMax.absoluteTier <= treatedAsThreeRepMax.absoluteTier);
});

test("sled push favors absolute strength", () => {
  const strongerHeavy = runPredictionEngine(minimal({ benchmarks: { backSquat3RM: 170, deadlift3RM: 210, bodyweightKg: 115 } }));
  const weakerLight = runPredictionEngine(minimal({ benchmarks: { backSquat3RM: 120, deadlift3RM: 150, bodyweightKg: 70 } }));
  const strongSled = strongerHeavy.segments.find((segment) => segment.segmentKey === "sled_push");
  const lightSled = weakerLight.segments.find((segment) => segment.segmentKey === "sled_push");

  assert.ok(strongSled.predictedSeconds <= lightSled.predictedSeconds);
});

test("wall balls favor relative strength", () => {
  const lighter = runPredictionEngine(minimal({ benchmarks: { backSquat3RM: 120, deadlift3RM: 150, bodyweightKg: 70 } }));
  const heavier = runPredictionEngine(minimal({ benchmarks: { backSquat3RM: 120, deadlift3RM: 150, bodyweightKg: 110 } }));
  const lightWallBalls = lighter.segments.find((segment) => segment.segmentKey === "wall_balls");
  const heavyWallBalls = heavier.segments.find((segment) => segment.segmentKey === "wall_balls");

  assert.ok(lightWallBalls.predictedSeconds <= heavyWallBalls.predictedSeconds);
});

test("height has zero effect on prediction output", () => {
  const shorter = runPredictionEngine(minimal({ benchmarks: { heightCm: 165 } }));
  const taller = runPredictionEngine(minimal({ benchmarks: { heightCm: 195 } }));

  assert.deepEqual(shorter, { ...taller, predictionId: shorter.predictionId });
});

test("confidence score bumps exactly 0.05 with bodyweight", () => {
  const benchmarks = { run5kSeconds: 1200, backSquat3RM: 120, deadlift3RM: 150, previousHyroxSeconds: 5400 };
  const delta = calculateConfidenceScore({ ...benchmarks, bodyweightKg: 80 }) - calculateConfidenceScore(benchmarks);
  assert.equal(Number(delta.toFixed(2)), 0.05);
});

test("SkiErg direct benchmark overrides estimate", () => {
  const result = runPredictionEngine(minimal({ benchmarks: { skiErg1kSeconds: 250 } }));
  const skierg = result.segments.find((segment) => segment.segmentKey === "skierg");
  assert.equal(skierg.predictedSeconds, 250);
});

test("wall ball benchmark formula is applied", () => {
  const result = runPredictionEngine(minimal({ benchmarks: { wallBallRepsIn2Min: 50 } }));
  const wallBalls = result.segments.find((segment) => segment.segmentKey === "wall_balls");
  assert.equal(wallBalls.predictedSeconds, 252);
});

test("full prediction lands in a plausible finish range", () => {
  const result = runPredictionEngine(minimal({
    context: { primaryBackground: "endurance", weeklyRunningKm: "30-45" },
  }));
  assert.ok(result.predictedFinishSeconds >= 4500);
  assert.ok(result.predictedFinishSeconds <= 9000);
  assert.equal(result.segments.length, 16);
});

test("weak wall balls are the top limiter", () => {
  const result = runPredictionEngine(minimal({
    benchmarks: { backSquat3RM: 65, deadlift3RM: 75 },
    context: { primaryBackground: "endurance", weeklyRunningKm: "45+" },
  }));
  assert.equal(result.topLimiters[0].segmentKey, "wall_balls");
});

test("key assumptions include only missing benchmark estimates", () => {
  const noSki = runPredictionEngine(minimal());
  assert.ok(noSki.keyAssumptions.some((assumption) => assumption.includes("SkiErg time estimated from running pace")));

  const withSki = runPredictionEngine(minimal({ benchmarks: { skiErg1kSeconds: 250 } }));
  assert.equal(withSki.keyAssumptions.some((assumption) => assumption.includes("SkiErg time estimated from running pace")), false);
});

test("higher confidence narrows the predicted range", () => {
  const low = runPredictionEngine(minimal());
  const high = runPredictionEngine(minimal({
    benchmarks: {
      run10kSeconds: 2520,
      rowErg2kSeconds: 430,
      skiErg1kSeconds: 250,
      wallBallRepsIn2Min: 55,
      farmerCarryTimeSeconds: 140,
      previousHyroxSeconds: 5400,
    },
    context: {
      trainingFrequency: "6+",
      primaryBackground: "endurance",
      weeklyRunningKm: "45+",
    },
  }));

  assert.ok((high.rangeHighSeconds - high.rangeLowSeconds) < (low.rangeHighSeconds - low.rangeLowSeconds));
});
