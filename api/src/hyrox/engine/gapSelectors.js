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
