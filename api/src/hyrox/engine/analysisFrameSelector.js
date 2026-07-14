import { nextPerformanceBand } from "./benchmarkSelector.js";

export const ANALYSIS_FRAMES = Object.freeze({
  CATCH_UP: "catch_up",
  COMPETITIVE: "competitive",
  NEXT_BAND: "next_band",
  NEXT_BAND_STRETCH: "next_band_stretch",
  SUB60_INTERNAL: "sub60_internal",
  NO_BAND: "no_band",
});

const CATCH_UP_THRESHOLD_S = 60;
const COMPETITIVE_BAND_S = 60;
const NEXT_BAND_THRESHOLD_S = 300;

export function selectAnalysisFrame({ achievedBand, nextBand, gapToBandMedianSeconds }) {
  const hasDistinctNextBand = Boolean(nextBand && nextBand !== achievedBand);

  if (!achievedBand) {
    return { frame: ANALYSIS_FRAMES.NO_BAND, comparisonBand: null, stretchBand: null, gapToBandMedianSeconds };
  }

  if (achievedBand === "sub_60") {
    return {
      frame: ANALYSIS_FRAMES.SUB60_INTERNAL,
      comparisonBand: "sub_60",
      stretchBand: null,
      gapToBandMedianSeconds,
    };
  }

  if (!Number.isFinite(gapToBandMedianSeconds)) {
    return {
      frame: ANALYSIS_FRAMES.CATCH_UP,
      comparisonBand: achievedBand,
      stretchBand: null,
      gapToBandMedianSeconds,
    };
  }

  if (gapToBandMedianSeconds > CATCH_UP_THRESHOLD_S) {
    return {
      frame: ANALYSIS_FRAMES.CATCH_UP,
      comparisonBand: achievedBand,
      stretchBand: null,
      gapToBandMedianSeconds,
    };
  }

  if (gapToBandMedianSeconds >= -COMPETITIVE_BAND_S) {
    // When the athlete has already beaten the achieved band median and a next band exists,
    // compare against the next band so gap data matches the "move to next band" narrative.
    const aheadOfMedian = gapToBandMedianSeconds < 0 && hasDistinctNextBand;
    return {
      frame: ANALYSIS_FRAMES.COMPETITIVE,
      comparisonBand: aheadOfMedian ? nextBand : achievedBand,
      stretchBand: nextBand,
      gapToBandMedianSeconds,
      useNextBandGaps: aheadOfMedian,
    };
  }

  if (gapToBandMedianSeconds >= -NEXT_BAND_THRESHOLD_S) {
    if (!hasDistinctNextBand) {
      return {
        frame: ANALYSIS_FRAMES.COMPETITIVE,
        comparisonBand: achievedBand,
        stretchBand: null,
        gapToBandMedianSeconds,
      };
    }
    return {
      frame: ANALYSIS_FRAMES.NEXT_BAND,
      comparisonBand: nextBand,
      stretchBand: null,
      gapToBandMedianSeconds,
    };
  }

  if (!hasDistinctNextBand) {
    return {
      frame: ANALYSIS_FRAMES.COMPETITIVE,
      comparisonBand: achievedBand,
      stretchBand: null,
      gapToBandMedianSeconds,
    };
  }

  const stretchBand = nextPerformanceBand(nextBand);
  return {
    frame: ANALYSIS_FRAMES.NEXT_BAND_STRETCH,
    comparisonBand: nextBand,
    stretchBand,
    gapToBandMedianSeconds,
  };
}
