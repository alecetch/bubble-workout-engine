import assert from "node:assert/strict";
import test from "node:test";
import { buildStrengthSignalCopy } from "../strengthSignalAdvisor.js";

function targetAnalysis(targetFinishSeconds = 5000, overrides = {}) {
  return {
    benchmarkContext: { goalBenchmarkGroup: { targetFinishSeconds } },
    athlete: { sex: "male" },
    ...overrides,
  };
}

function context(overrides = {}) {
  return {
    targetFinishTimeSeconds: 5000,
    bodyweightKg: 80,
    backSquatKg: 100,
    backSquatReps: 3,
    deadliftKg: 130,
    deadliftReps: 3,
    ...overrides,
  };
}

function assertNoBannedLanguage(copy) {
  assert.doesNotMatch(copy, /\b(should|need to|recommend|improve)\b/i);
}

test("returns null in analyse mode", () => {
  assert.equal(buildStrengthSignalCopy(targetAnalysis(), context(), "analyse"), null);
});

test("returns null with no target finish time in target mode", () => {
  assert.equal(buildStrengthSignalCopy({ benchmarkContext: {} }, context({ targetFinishTimeSeconds: null }), "target"), null);
});

test("returns null with no bodyweight", () => {
  assert.equal(buildStrengthSignalCopy(targetAnalysis(), context({ bodyweightKg: null }), "target"), null);
});

test("returns null when neither squat nor deadlift is present", () => {
  assert.equal(buildStrengthSignalCopy(targetAnalysis(), context({ backSquatKg: null, deadliftKg: null }), "target"), null);
});

test("squat-only copy starts with the squat sentence and omits deadlift", () => {
  const copy = buildStrengthSignalCopy(targetAnalysis(), context({ deadliftKg: null }), "target");
  assert.match(copy, /^Your estimated back squat 1RM/);
  assert.match(copy, /back squat/);
  assert.doesNotMatch(copy, /deadlift/);
  assertNoBannedLanguage(copy);
});

test("below-range verdict for a light squat against a sub-60 target", () => {
  const copy = buildStrengthSignalCopy(targetAnalysis(), context({ targetFinishTimeSeconds: 3500, backSquatKg: 70, deadliftKg: null }), "target");
  assert.match(copy, /sub-60 minute HYROX target/);
  assert.match(copy, /below that range/);
  assertNoBannedLanguage(copy);
});

test("within-range verdict for values inside the target tier range", () => {
  const copy = buildStrengthSignalCopy(targetAnalysis(), context({ backSquatKg: 90, deadliftKg: null }), "target");
  assert.match(copy, /75-90 minute HYROX target/);
  assert.match(copy, /within that range/);
  assertNoBannedLanguage(copy);
});

test("above-range verdict for values above the target tier range", () => {
  const copy = buildStrengthSignalCopy(targetAnalysis(), context({ targetFinishTimeSeconds: 6000, backSquatKg: 110, deadliftKg: null }), "target");
  assert.match(copy, /90-120 minute HYROX target/);
  assert.match(copy, /above that range/);
  assertNoBannedLanguage(copy);
});

test("tier resolves from target finish time rather than achieved race time", () => {
  const copy = buildStrengthSignalCopy(
    targetAnalysis(null, {
      race: { finishTimeSeconds: 8000 },
      benchmarkContext: { goalBenchmarkGroup: { targetFinishSeconds: 4400 } },
    }),
    context({ targetFinishTimeSeconds: null, backSquatKg: 100, deadliftKg: null }),
    "target",
  );
  assert.match(copy, /60-75 minute HYROX target/);
  assert.match(copy, /typical range is 115-150% of bodyweight/);
  assertNoBannedLanguage(copy);
});

test("female scale factor changes the verdict versus male for identical numbers", () => {
  const athleteContext = context({ bodyweightKg: 100, backSquatKg: 85, deadliftKg: null });
  const maleCopy = buildStrengthSignalCopy(targetAnalysis(5000, { athlete: { sex: "male" } }), athleteContext, "target");
  const femaleCopy = buildStrengthSignalCopy(targetAnalysis(5000, { athlete: { sex: "female" } }), athleteContext, "target");
  assert.match(maleCopy, /below that range/);
  assert.match(femaleCopy, /within that range/);
  assertNoBannedLanguage(maleCopy);
  assertNoBannedLanguage(femaleCopy);
});

test("1RM math is rep-aware", () => {
  const oneRepCopy = buildStrengthSignalCopy(targetAnalysis(), context({ bodyweightKg: 100, backSquatKg: 100, backSquatReps: 1, deadliftKg: null }), "target");
  const eightRepCopy = buildStrengthSignalCopy(targetAnalysis(), context({ bodyweightKg: 100, backSquatKg: 100, backSquatReps: 8, deadliftKg: null }), "target");
  assert.match(oneRepCopy, /100% of bodyweight/);
  assert.match(eightRepCopy, /127% of bodyweight/);
  assert.notEqual(oneRepCopy, eightRepCopy);
  assertNoBannedLanguage(oneRepCopy);
  assertNoBannedLanguage(eightRepCopy);
});

test("lb unit displays pounds instead of kilograms", () => {
  const copy = buildStrengthSignalCopy(targetAnalysis(), context({ weightUnit: "lb", backSquatKg: 100, deadliftKg: null }), "target");
  assert.match(copy, /~243 lb/);
  assert.doesNotMatch(copy, /~110 kg/);
  assertNoBannedLanguage(copy);
});
