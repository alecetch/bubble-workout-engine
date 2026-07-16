function splitGapSeconds(segment, hasGoalGroup) {
  if (Number.isFinite(segment?.frameGapSeconds)) return segment.frameGapSeconds;
  if (Number.isFinite(segment?.timeGapToExactTargetSeconds)) return segment.timeGapToExactTargetSeconds;
  if (hasGoalGroup && Number.isFinite(segment?.goalBenchmarkSeconds) && Number.isFinite(segment?.userSeconds)) {
    return segment.userSeconds - segment.goalBenchmarkSeconds;
  }
  return Number.isFinite(segment?.timeGapToMedianSeconds) ? segment.timeGapToMedianSeconds : null;
}

export function penaltyContext(analysisJson = {}) {
  const penalties = Array.isArray(analysisJson.penalties) ? analysisJson.penalties : [];
  const totalPenaltySeconds = penalties.reduce((sum, penalty) => sum + (Number(penalty.penaltySeconds) || 0), 0);
  const totalTimeSeg = (analysisJson.segments ?? []).find((segment) => segment.segmentKey === "total_time");
  const totalGapSeconds = Math.max(0, splitGapSeconds(totalTimeSeg, Boolean(analysisJson.benchmarkContext?.goalBenchmarkGroup)) ?? 0);
  const penaltiesAreMaterial =
    totalPenaltySeconds >= 60 ||
    (totalGapSeconds > 0 && totalPenaltySeconds / totalGapSeconds >= 0.10);
  const usePenaltyHero =
    totalPenaltySeconds >= 180 &&
    totalGapSeconds > 0 &&
    totalPenaltySeconds / totalGapSeconds >= 0.25;
  const raceTimeSeconds = analysisJson.race?.finishTimeSeconds ?? null;
  const adjustedRaceTimeSeconds = totalPenaltySeconds > 0 && Number.isFinite(raceTimeSeconds)
    ? raceTimeSeconds - totalPenaltySeconds
    : null;
  return { penalties, totalPenaltySeconds, totalGapSeconds, penaltiesAreMaterial, usePenaltyHero, adjustedRaceTimeSeconds };
}
