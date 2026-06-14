import { ROXZONE_KEYS } from "../config/segmentMap.js";
import { calculateSegmentStats } from "./percentileCalculator.js";

export function analyseRoxzone(normalisedSubmission, benchmarkContext) {
  if (normalisedSubmission.roxzoneMode === "none" || !Number.isFinite(normalisedSubmission.roxzoneTimeSeconds)) {
    return { available: false };
  }

  const aggregate = calculateSegmentStats(normalisedSubmission, benchmarkContext)
    .find((segment) => segment.segmentKey === "roxzone_time");
  const percentOfTotalTime = normalisedSubmission.race?.finishTimeSeconds
    ? normalisedSubmission.roxzoneTimeSeconds / normalisedSubmission.race.finishTimeSeconds
    : null;

  if (normalisedSubmission.roxzoneMode === "inferred_total") {
    return {
      available: true,
      mode: "inferred_total",
      totalSeconds: normalisedSubmission.roxzoneTimeSeconds,
      percentOfTotalTime,
      percentile: aggregate?.percentile ?? null,
      timeGapToMedianSeconds: aggregate?.timeGapToMedianSeconds ?? null,
      segmentAnalysisAvailable: false,
      segmentBreakdown: null,
      worstTransition: null,
    };
  }

  const breakdown = calculateSegmentStats(normalisedSubmission, benchmarkContext)
    .filter((segment) => ROXZONE_KEYS.includes(segment.segmentKey));
  const worstTransition = [...breakdown]
    .filter((segment) => Number.isFinite(segment.timeGapToMedianSeconds))
    .sort((a, b) => b.timeGapToMedianSeconds - a.timeGapToMedianSeconds)[0] ?? null;

  return {
    available: true,
    mode: "explicit_splits",
    totalSeconds: normalisedSubmission.roxzoneTimeSeconds,
    percentOfTotalTime,
    percentile: aggregate?.percentile ?? null,
    timeGapToMedianSeconds: aggregate?.timeGapToMedianSeconds ?? null,
    segmentAnalysisAvailable: true,
    segmentBreakdown: breakdown,
    worstTransition,
  };
}
