import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateRunPace,
  runPredictionEngine,
} from "../hyroxPredictorEngine.js";

function minimal(overrides = {}) {
  return {
    athlete: { email: "test@example.com", sex: "male", division: "open", ...(overrides.athlete ?? {}) },
    benchmarks: { run5kSeconds: 1200, backSquat3RM: 120, deadlift3RM: 150, ...(overrides.benchmarks ?? {}) },
    context: { ...(overrides.context ?? {}) },
    race: { ...(overrides.race ?? {}) },
    marketingConsent: false,
  };
}

test("confidence score base case labels moderate", () => {
  const result = runPredictionEngine(minimal());
  assert.equal(result.confidenceScore, 0.63);
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

test("run pace uses endurance background and 30-45 km/week", () => {
  const pace = estimateRunPace({ run5kSeconds: 1200 }, { primaryBackground: "endurance", weeklyRunningKm: "30-45" });
  assert.equal(Math.round(pace), 282);
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
