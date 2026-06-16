import { ENTRY_KEYS, EXIT_KEYS, ROXZONE_KEYS, STATION_KEYS } from "../config/segmentMap.js";
import { calculateSegmentStats } from "./percentileCalculator.js";

function regressionSlope(points) {
  if (points.length < 2) return 0;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const numerator = points.reduce((sum, point) => sum + ((point.x - meanX) * (point.y - meanY)), 0);
  const denominator = points.reduce((sum, point) => sum + ((point.x - meanX) ** 2), 0);
  return denominator ? numerator / denominator : 0;
}

function buildEntryExitAnalysis(normalisedSubmission) {
  const entryBreakdown = ENTRY_KEYS
    .map((key, index) => ({ stationKey: STATION_KEYS[index], stationIndex: index + 1, seconds: normalisedSubmission.splitMap?.get(key)?.timeSeconds ?? null }))
    .filter((entry) => entry.seconds !== null);
  const exitBreakdown = EXIT_KEYS
    .map((key, index) => ({ stationKey: STATION_KEYS[index], stationIndex: index + 1, seconds: normalisedSubmission.splitMap?.get(key)?.timeSeconds ?? null }))
    .filter((exit) => exit.seconds !== null);
  if (!entryBreakdown.length && !exitBreakdown.length) return { entryExitAvailable: false };
  const slope = regressionSlope(entryBreakdown.map((entry) => ({ x: entry.stationIndex, y: entry.seconds })));
  const entryTrend = slope > 2 ? "rising" : slope < -2 ? "falling" : "stable";
  const exitByStation = new Map(exitBreakdown.map((exit) => [exit.stationKey, exit]));
  const stationOverhead = entryBreakdown
    .map((entry) => {
      const exit = exitByStation.get(entry.stationKey);
      return exit ? { stationKey: entry.stationKey, entrySeconds: entry.seconds, exitSeconds: exit.seconds, totalSeconds: entry.seconds + exit.seconds } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
  return {
    entryExitAvailable: true,
    entryBreakdown,
    exitBreakdown,
    entryTrend,
    worstEntry: [...entryBreakdown].sort((a, b) => b.seconds - a.seconds)[0] ?? null,
    worstExit: [...exitBreakdown].sort((a, b) => b.seconds - a.seconds)[0] ?? null,
    stationOverhead,
  };
}

export function analyseRoxzone(normalisedSubmission, benchmarkContext) {
  const entryExit = buildEntryExitAnalysis(normalisedSubmission);
  if (normalisedSubmission.roxzoneMode === "none" || !Number.isFinite(normalisedSubmission.roxzoneTimeSeconds)) {
    return { available: false, ...entryExit };
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
      ...entryExit,
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
    ...entryExit,
  };
}
