import assert from "node:assert/strict";
import test from "node:test";
import { ANALYSIS_FRAMES, selectAnalysisFrame } from "../analysisFrameSelector.js";

test("sub_60 achievedBand uses sub60_internal frame", () => {
  const result = selectAnalysisFrame({ achievedBand: "sub_60", nextBand: null, gapToBandMedianSeconds: -120 });
  assert.equal(result.frame, ANALYSIS_FRAMES.SUB60_INTERNAL);
  assert.equal(result.comparisonBand, "sub_60");
});

test("no achievedBand uses no_band frame", () => {
  const result = selectAnalysisFrame({ achievedBand: null, nextBand: null, gapToBandMedianSeconds: 0 });
  assert.equal(result.frame, ANALYSIS_FRAMES.NO_BAND);
});

test("+120s slower than median uses catch_up frame", () => {
  const result = selectAnalysisFrame({ achievedBand: "sub_70", nextBand: "sub_65", gapToBandMedianSeconds: 120 });
  assert.equal(result.frame, ANALYSIS_FRAMES.CATCH_UP);
  assert.equal(result.comparisonBand, "sub_70");
});

test("+30s within band (behind median) uses competitive frame comparing vs achieved band", () => {
  const result = selectAnalysisFrame({ achievedBand: "sub_70", nextBand: "sub_65", gapToBandMedianSeconds: 30 });
  assert.equal(result.frame, ANALYSIS_FRAMES.COMPETITIVE);
  assert.equal(result.comparisonBand, "sub_70", "comparison band stays on achieved band when behind median");
  assert.equal(result.stretchBand, "sub_65");
  assert.equal(result.useNextBandGaps, false, "useNextBandGaps not set when behind median");
});

test("-30s within band (ahead of median) uses competitive frame with next-band comparisons", () => {
  const result = selectAnalysisFrame({ achievedBand: "sub_70", nextBand: "sub_65", gapToBandMedianSeconds: -30 });
  assert.equal(result.frame, ANALYSIS_FRAMES.COMPETITIVE);
  assert.equal(result.comparisonBand, "sub_65", "comparison band should be next band when ahead of median");
  assert.equal(result.stretchBand, "sub_65", "stretch band preserved for subject line");
  assert.equal(result.useNextBandGaps, true, "useNextBandGaps flag set");
});

test("-63s faster than median uses next_band frame", () => {
  const result = selectAnalysisFrame({ achievedBand: "sub_70", nextBand: "sub_65", gapToBandMedianSeconds: -63 });
  assert.equal(result.frame, ANALYSIS_FRAMES.NEXT_BAND);
  assert.equal(result.comparisonBand, "sub_65");
  assert.equal(result.stretchBand, null);
});

test("-63s faster than median without a distinct next band stays within-band competitive", () => {
  const result = selectAnalysisFrame({ achievedBand: "sub_70", nextBand: null, gapToBandMedianSeconds: -63 });
  assert.equal(result.frame, ANALYSIS_FRAMES.COMPETITIVE);
  assert.equal(result.comparisonBand, "sub_70");
  assert.equal(result.stretchBand, null);
});

test("-63s faster than median with same next band stays within-band competitive", () => {
  const result = selectAnalysisFrame({ achievedBand: "sub_90", nextBand: "sub_90", gapToBandMedianSeconds: -63 });
  assert.equal(result.frame, ANALYSIS_FRAMES.COMPETITIVE);
  assert.equal(result.comparisonBand, "sub_90");
  assert.equal(result.stretchBand, null);
});

test("-350s faster than median uses next_band_stretch frame", () => {
  const result = selectAnalysisFrame({ achievedBand: "sub_70", nextBand: "sub_65", gapToBandMedianSeconds: -350 });
  assert.equal(result.frame, ANALYSIS_FRAMES.NEXT_BAND_STRETCH);
  assert.equal(result.comparisonBand, "sub_65");
  assert.equal(result.stretchBand, "sub_60");
});

test("-350s faster than median without a distinct next band stays within-band competitive", () => {
  const result = selectAnalysisFrame({ achievedBand: "sub_90", nextBand: null, gapToBandMedianSeconds: -350 });
  assert.equal(result.frame, ANALYSIS_FRAMES.COMPETITIVE);
  assert.equal(result.comparisonBand, "sub_90");
  assert.equal(result.stretchBand, null);
});

test("null gapToBandMedianSeconds uses catch_up frame", () => {
  const result = selectAnalysisFrame({ achievedBand: "sub_75", nextBand: "sub_70", gapToBandMedianSeconds: null });
  assert.equal(result.frame, ANALYSIS_FRAMES.CATCH_UP);
});
