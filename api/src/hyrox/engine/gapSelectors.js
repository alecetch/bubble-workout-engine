export function resolvedUserSeconds(segment) {
  if (Number.isFinite(segment?.userSecondsNetOfPenalty)) return segment.userSecondsNetOfPenalty;
  return Number.isFinite(segment?.userSeconds) ? segment.userSeconds : null;
}

export function resolvedStatGapSeconds(row) {
  return row?.timeGapToMedianSecondsNetOfPenalty ?? row?.timeGapToMedianSeconds ?? null;
}

export function resolvedFrameGapSeconds(segment) {
  return segment?.frameGapNetOfPenaltySeconds
    ?? segment?.frameGapSeconds
    ?? segment?.timeGapToExactTargetSeconds
    ?? segment?.timeGapToMedianSeconds
    ?? null;
}

function segmentByKey(analysisJson = {}, key) {
  return (analysisJson.segments ?? []).find((row) => row?.segmentKey === key) ?? null;
}

export function resolvedRoxzoneGapSeconds(analysisJson = {}) {
  const row = segmentByKey(analysisJson, "roxzone_time");
  const rox = analysisJson.roxzoneAnalysis ?? {};
  const values = [
    row?.frameGapNetOfPenaltySeconds,
    row?.frameGapSeconds,
    row?.timeGapToExactTargetSeconds,
    row?.timeGapToMedianSeconds,
    rox.timeGapToMedianSeconds,
  ];
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}
