import { SEGMENT_MAP } from "../config/segmentMap.js";
import { hasGoalGroup } from "./comparisonBasis.js";

export const RACE_SPLIT_SEGMENTS = SEGMENT_MAP.filter((segment) => segment.type === "run" || segment.type === "station");

export function formatSplitSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatSplitDelta(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const abs = Math.abs(Math.round(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const formatted = `${m}:${String(s).padStart(2, "0")}`;
  return seconds >= 0 ? `+${formatted}` : `-${formatted}`;
}

function segment(analysisJson, key) {
  return analysisJson.segments?.find((row) => row.segmentKey === key) ?? null;
}

function comparisonSeconds(row, goalAvailable) {
  if (Number.isFinite(row?.exactTargetSeconds)) return row.exactTargetSeconds;
  if (goalAvailable && Number.isFinite(row?.goalBenchmarkSeconds)) return row.goalBenchmarkSeconds;
  return Number.isFinite(row?.benchmarkMedianSeconds) ? row.benchmarkMedianSeconds : null;
}

function adjustedGapSeconds(row, goalAvailable) {
  if (Number.isFinite(row?.timeGapToExactTargetSecondsNetOfPenalty)) return row.timeGapToExactTargetSecondsNetOfPenalty;
  if (Number.isFinite(row?.timeGapToExactTargetSeconds)) return row.timeGapToExactTargetSeconds;
  if (Number.isFinite(row?.frameGapNetOfPenaltySeconds)) return row.frameGapNetOfPenaltySeconds;
  if (Number.isFinite(row?.frameGapSeconds)) return row.frameGapSeconds;
  if (goalAvailable && Number.isFinite(row?.goalBenchmarkSeconds) && Number.isFinite(row?.userSeconds)) {
    return row.userSeconds - row.goalBenchmarkSeconds;
  }
  if (Number.isFinite(row?.timeGapToMedianSecondsNetOfPenalty)) return row.timeGapToMedianSecondsNetOfPenalty;
  if (Number.isFinite(row?.timeGapToMedianSeconds)) return row.timeGapToMedianSeconds;
  return null;
}

function rawGapSeconds(row, comparisonTimeSeconds, goalAvailable) {
  if (Number.isFinite(row?.timeGapToExactTargetSeconds)) return row.timeGapToExactTargetSeconds;
  if (Number.isFinite(row?.frameGapSeconds)) return row.frameGapSeconds;
  if (goalAvailable && Number.isFinite(row?.goalBenchmarkSeconds) && Number.isFinite(row?.userSeconds)) {
    return row.userSeconds - row.goalBenchmarkSeconds;
  }
  if (Number.isFinite(row?.timeGapToMedianSeconds)) return row.timeGapToMedianSeconds;
  if (Number.isFinite(comparisonTimeSeconds) && Number.isFinite(row?.userSeconds)) {
    return row.userSeconds - comparisonTimeSeconds;
  }
  return null;
}

function displayTone(seconds) {
  if (!Number.isFinite(seconds)) return "neutral";
  if (seconds < 0) return "positive";
  if (seconds > 0) return "negative";
  return "neutral";
}

export function buildSplitDisplayRows(analysisJson = {}) {
  const goalAvailable = hasGoalGroup(analysisJson);
  return RACE_SPLIT_SEGMENTS.flatMap((mapRow) => {
    const row = segment(analysisJson, mapRow.segmentKey);
    if (!row || !Number.isFinite(row.userSeconds)) return [];

    const comparisonTimeSeconds = comparisonSeconds(row, goalAvailable);
    const rawGap = rawGapSeconds(row, comparisonTimeSeconds, goalAvailable);
    const adjustedGap = adjustedGapSeconds(row, goalAvailable);
    const displayGap = Number.isFinite(adjustedGap) ? Math.round(adjustedGap) : 0;
    const rawRoundedGap = Number.isFinite(rawGap) ? Math.round(rawGap) : null;
    const penaltyAdjustmentSeconds = Number.isFinite(rawRoundedGap)
      ? Math.max(0, rawRoundedGap - displayGap)
      : Number.isFinite(row.penaltySeconds) ? Math.max(0, Number(row.penaltySeconds)) : 0;
    const isPenaltyAdjusted = penaltyAdjustmentSeconds >= 1
      || (Number.isFinite(row.userSecondsNetOfPenalty) && Math.round(row.userSecondsNetOfPenalty) !== Math.round(row.userSeconds));
    const displayTimeSeconds = isPenaltyAdjusted && Number.isFinite(comparisonTimeSeconds)
      ? Math.max(0, Math.round(comparisonTimeSeconds + displayGap))
      : Math.round(row.userSeconds);
    const rawTimeSeconds = Math.round(row.userSeconds);

    return [{
      key: mapRow.segmentKey,
      label: mapRow.displayName,
      type: mapRow.type,
      raceOrder: mapRow.raceOrder,
      rawTimeSeconds,
      rawTimeFormatted: formatSplitSeconds(rawTimeSeconds) ?? "-",
      displayTimeSeconds,
      displayTimeFormatted: formatSplitSeconds(displayTimeSeconds) ?? "-",
      comparisonTimeSeconds: Number.isFinite(comparisonTimeSeconds) ? Math.round(comparisonTimeSeconds) : null,
      comparisonTimeFormatted: formatSplitSeconds(comparisonTimeSeconds),
      rawGapSeconds: rawRoundedGap,
      rawGapFormatted: Number.isFinite(rawRoundedGap) ? formatSplitDelta(rawRoundedGap) : null,
      adjustedGapSeconds: displayGap,
      adjustedGapFormatted: formatSplitDelta(displayGap) ?? "0",
      displayGapSeconds: displayGap,
      displayGapFormatted: displayGap === 0 ? "0:00" : formatSplitDelta(displayGap),
      displayGapTone: displayTone(displayGap),
      penaltyAdjustmentSeconds: isPenaltyAdjusted ? penaltyAdjustmentSeconds : 0,
      penaltyAdjustmentFormatted: isPenaltyAdjusted ? formatSplitSeconds(penaltyAdjustmentSeconds) : null,
      isPenaltyAdjusted,
      penaltyAdjustmentLabel: isPenaltyAdjusted && Number.isFinite(rawRoundedGap)
        ? `raw ${formatSplitSeconds(rawTimeSeconds)} incl. penalty`
        : null,
      userTime: formatSplitSeconds(displayTimeSeconds) ?? "-",
      rawUserTime: formatSplitSeconds(rawTimeSeconds) ?? "-",
      delta: displayGap === 0 ? "0:00" : formatSplitDelta(displayGap),
      rawDelta: Number.isFinite(rawRoundedGap) ? (rawRoundedGap === 0 ? "0:00" : formatSplitDelta(rawRoundedGap)) : null,
      tone: displayTone(displayGap),
    }];
  });
}
