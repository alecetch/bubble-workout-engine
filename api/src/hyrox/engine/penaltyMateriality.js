export function totalPenaltySeconds(penalties = []) {
  return (Array.isArray(penalties) ? penalties : [])
    .reduce((sum, penalty) => sum + (Number(penalty?.penaltySeconds) || 0), 0);
}

export function penaltySecondsForKeys(penalties = [], keys = []) {
  const keySet = new Set(keys);
  return (Array.isArray(penalties) ? penalties : [])
    .filter((penalty) => keySet.has(penalty?.runKey))
    .reduce((sum, penalty) => sum + (Number(penalty?.penaltySeconds) || 0), 0);
}

export function penaltiesAreMaterial(totalPenaltySecondsValue, totalGapSecondsValue) {
  const penaltySeconds = Number(totalPenaltySecondsValue);
  const gapSeconds = Number(totalGapSecondsValue);
  return penaltySeconds >= 60 ||
    (gapSeconds > 0 && penaltySeconds / gapSeconds >= 0.10);
}

export function penaltyAdjustment({ penalties = [], finishTimeSeconds = null, totalGapSeconds = 0 } = {}) {
  const penaltySeconds = totalPenaltySeconds(penalties);
  const material = penaltiesAreMaterial(penaltySeconds, Math.max(0, Number(totalGapSeconds) || 0));
  const adjustedFinishTimeSeconds = material && penaltySeconds > 0 && Number.isFinite(Number(finishTimeSeconds))
    ? Math.max(0, Number(finishTimeSeconds) - penaltySeconds)
    : null;

  return {
    totalPenaltySeconds: penaltySeconds,
    penaltiesAreMaterial: material,
    adjustedFinishTimeSeconds,
  };
}
