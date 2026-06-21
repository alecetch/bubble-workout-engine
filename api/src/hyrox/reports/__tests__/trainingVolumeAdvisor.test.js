import assert from "node:assert/strict";
import test from "node:test";
import { buildTrainingVolumeAdvice } from "../trainingVolumeAdvisor.js";

function mockAnalysis({ finishSeconds, engineScore, strengthScore, limiterLabel = null, ageGroup = null } = {}) {
  return {
    race: { finishTimeSeconds: finishSeconds },
    scores: { engineScore, strengthScore },
    headline: { biggestLimiter: limiterLabel ? { label: limiterLabel, type: "station" } : null },
    athlete: { ageGroup },
  };
}

test("T3 under-35 athlete at 21-40 km is below optimal", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), { weeklyRunningVolume: "21_40_km" });
  assert.equal(advice.runningAdvice.verdict, "below_optimal");
});

test("T3 age 45-49 athlete at 41-60 km is upper range after age modifier", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000, ageGroup: "45-49" }), { weeklyRunningVolume: "41_60_km" });
  assert.deepEqual(advice.runningAdvice.optimalRange, { low: 38, high: 47 });
  assert.equal(advice.runningAdvice.verdict, "upper_range");
});

test("T2 athlete at 60+ km is excessive", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 4200 }), { weeklyRunningVolume: "60_plus_km" });
  assert.equal(advice.runningAdvice.verdict, "excessive");
});

test("T5 athlete at 0-10 km is critically low", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 8000 }), { weeklyRunningVolume: "0_10_km" });
  assert.equal(advice.runningAdvice.verdict, "critically_low");
});

test("missing weekly running volume returns null running advice", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), { weeklyStrengthSessions: "2_3" });
  assert.equal(advice.runningAdvice, null);
});

test("missing finish time and target time returns null running advice", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: null }), { weeklyRunningVolume: "21_40_km" });
  assert.equal(advice, null);
});

test("low volume with high engine score is toned down", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 6000, engineScore: 72 }), { weeklyRunningVolume: "11_20_km" });
  assert.equal(advice.runningAdvice.scoreModulation, "toned_down");
});

test("critically low volume with low engine score is amplified", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000, engineScore: 44 }), { weeklyRunningVolume: "0_10_km" });
  assert.equal(advice.runningAdvice.scoreModulation, "amplified");
});

test("on-track volume with high engine score is affirmed", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000, engineScore: 75 }), { weeklyRunningVolume: "41_60_km" });
  assert.equal(advice.runningAdvice.verdict, "on_track");
  assert.equal(advice.runningAdvice.scoreModulation, "affirmed");
});

test("strength bucket 0-1 is below minimum", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), { weeklyStrengthSessions: "0_1" });
  assert.equal(advice.strengthAdvice.verdict, "below_minimum");
});

test("strength bucket 2-3 is optimal", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), { weeklyStrengthSessions: "2_3" });
  assert.equal(advice.strengthAdvice.verdict, "optimal");
});

test("strength bucket 4-5 is upper range", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), { weeklyStrengthSessions: "4_5" });
  assert.equal(advice.strengthAdvice.verdict, "upper_range");
});

test("strength bucket 6 plus is excessive", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), { weeklyStrengthSessions: "6_plus" });
  assert.equal(advice.strengthAdvice.verdict, "excessive");
});

test("optimal strength count with low strength score is amplified", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000, strengthScore: 40 }), { weeklyStrengthSessions: "2_3" });
  assert.equal(advice.strengthAdvice.scoreModulation, "amplified");
});

test("below-minimum strength count with high strength score is toned down", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000, strengthScore: 72 }), { weeklyStrengthSessions: "0_1" });
  assert.equal(advice.strengthAdvice.scoreModulation, "toned_down");
});

test("strength copy names the biggest limiter", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000, limiterLabel: "Sled Pull" }), { weeklyStrengthSessions: "2_3" });
  assert.match(advice.strengthAdvice.copy, /Sled Pull/);
});

test("running background appends strength-side addendum", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), { weeklyStrengthSessions: "2_3", primaryBackground: "running" });
  assert.match(advice.strengthAdvice.copy, /stronger running base/i);
});

test("strength sports background appends running-side addendum", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), { weeklyRunningVolume: "21_40_km", primaryBackground: "strength_sports" });
  assert.match(advice.runningAdvice.copy, /strength background/i);
});

test("no volume context returns null", () => {
  assert.equal(buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), {}), null);
});

test("only strength context returns strength advice without running advice", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), { weeklyStrengthSessions: "2_3" });
  assert.equal(advice.runningAdvice, null);
  assert.ok(advice.strengthAdvice);
});
