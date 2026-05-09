import test from "node:test";
import assert from "node:assert/strict";
import {
  computeEmphasisWeights,
  computePhysiqueScore,
  evaluateMilestones,
  normaliseRegionScores,
} from "../physiqueScanService.js";

test("computePhysiqueScore returns the expected composite", () => {
  const score = computePhysiqueScore(
    {
      chest: { score: 8, descriptor: null, confidence: "high" },
      shoulders: { score: 6, descriptor: null, confidence: "high" },
      upper_back: { score: null, descriptor: null, confidence: "not_visible" },
    },
    {
      leanness_rating: 7,
      muscle_fullness_rating: 8,
      symmetry_rating: 9,
      dominant_strength: "balanced",
      development_stage: "intermediate",
    },
  );

  assert.equal(score, 73.5);
});

test("computeEmphasisWeights prioritises lower-scoring visible regions", () => {
  const weights = computeEmphasisWeights({
    chest: { score: 8, descriptor: null, confidence: "high" },
    shoulders: { score: 5, descriptor: null, confidence: "high" },
    calves: { score: null, descriptor: null, confidence: "not_visible" },
  });

  assert.equal(weights.shoulders, 0.2);
  assert.equal(weights.chest, undefined);
  assert.equal(weights.calves, undefined);
});

test("evaluateMilestones fires first scan and score threshold achievements", () => {
  const milestones = evaluateMilestones({
    scanCountBefore: 0,
    currentScore: 72.4,
    comparison: null,
    newStreak: 1,
    currentRegionScores: {},
    priorMilestoneSlugs: [],
    priorMaxScoreDelta: null,
    priorMaxRegionScores: {},
  });

  assert.deepEqual(milestones.sort(), ["first_scan", "score_70"].sort());
});

test("normaliseRegionScores clamps values and clears not-visible regions", () => {
  const result = normaliseRegionScores({
    shoulders: { score: 12.4, descriptor: "round delts", confidence: "high" },
    glutes: { score: 5, descriptor: "hidden", confidence: "not_visible" },
  });

  assert.equal(result.shoulders.score, 10);
  assert.equal(result.shoulders.confidence, "high");
  assert.equal(result.glutes.score, null);
  assert.equal(result.glutes.descriptor, null);
  assert.equal(result.glutes.confidence, "not_visible");
});
