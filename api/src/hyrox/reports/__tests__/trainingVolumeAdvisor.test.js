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

test("running copy is identical regardless of engine score", () => {
  const lowScore = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 6000, engineScore: 30 }), { weeklyRunningVolume: "11_20_km" });
  const highScore = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 6000, engineScore: 90 }), { weeklyRunningVolume: "11_20_km" });
  assert.equal(lowScore.runningAdvice.copy, highScore.runningAdvice.copy);
  assert.equal("scoreModulation" in lowScore.runningAdvice, false);
});

test("running copy reports actual volume and typical range", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), { weeklyRunningVolume: "21_40_km" });
  assert.match(advice.runningAdvice.copy, /approximately 30 km\/week/);
  assert.match(advice.runningAdvice.copy, /38-52 km\/week/);
  assert.match(advice.runningAdvice.copy, /75-90 minute HYROX athlete/);
});

test("running copy does not diagnose whether aerobic capacity is a limiter", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000, engineScore: 30 }), { weeklyRunningVolume: "0_10_km" });
  assert.doesNotMatch(advice.runningAdvice.copy, /limiter|rate-limiter|aerobic capacity|engine score|most impactful|recommend|protect your base/i);
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

test("strength copy is identical regardless of strength score", () => {
  const lowScore = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000, strengthScore: 30 }), { weeklyStrengthSessions: "2_3" });
  const highScore = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000, strengthScore: 90 }), { weeklyStrengthSessions: "2_3" });
  assert.equal(lowScore.strengthAdvice.copy, highScore.strengthAdvice.copy);
  assert.equal("scoreModulation" in lowScore.strengthAdvice, false);
});

test("strength copy reports actual sessions and typical range", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), { weeklyStrengthSessions: "4_5" });
  assert.match(advice.strengthAdvice.copy, /4-5 strength sessions per week/);
  assert.match(advice.strengthAdvice.copy, /2-3 sessions per week/);
  assert.deepEqual(advice.strengthAdvice.typicalRange, { low: 2, high: 3 });
});

test("strength copy does not diagnose or prescribe station limiter work", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000, limiterLabel: "Sled Pull" }), { weeklyStrengthSessions: "2_3" });
  assert.doesNotMatch(advice.strengthAdvice.copy, /Sled Pull|limiter|station performance|targets that movement|Aim for|recommend|likely limiting/i);
});

test("no volume context returns null", () => {
  assert.equal(buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), {}), null);
});

test("only strength context returns strength advice without running advice", () => {
  const advice = buildTrainingVolumeAdvice(mockAnalysis({ finishSeconds: 5000 }), { weeklyStrengthSessions: "2_3" });
  assert.equal(advice.runningAdvice, null);
  assert.ok(advice.strengthAdvice);
});
