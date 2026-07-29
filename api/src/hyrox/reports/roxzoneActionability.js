import { formatGain, formatTime } from "./copyFormatter.js";

function segment(analysisJson = {}, key) {
  return (analysisJson.segments ?? []).find((row) => row.segmentKey === key) ?? null;
}

function isRoxzoneLimiter(limiter = null) {
  return limiter?.segmentKey === "roxzone_time" || String(limiter?.label ?? "").toLowerCase().includes("roxzone");
}

function roxzoneGapSeconds(analysisJson = {}) {
  const row = segment(analysisJson, "roxzone_time");
  const rox = analysisJson.roxzoneAnalysis ?? {};
  const values = [
    row?.frameGapNetOfPenaltySeconds,
    row?.frameGapSeconds,
    row?.timeGapToExactTargetSeconds,
    row?.timeGapToMedianSeconds,
    rox.timeGapToMedianSeconds,
  ];
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function detailLevel(analysisJson = {}) {
  const rox = analysisJson.roxzoneAnalysis ?? {};
  if (rox.entryExitAvailable || rox.mode === "explicit_splits" || rox.roxzoneNarrative?.available) return "entry_exit";
  if (rox.mode === "explicit_total") return "aggregate";
  if (rox.mode === "inferred_total") return "partial";
  return "unknown";
}

function primaryAction(analysisJson = {}) {
  const rox = analysisJson.roxzoneAnalysis ?? {};
  const tags = rox.roxzoneNarrative?.scenarioTags ?? [];
  if (tags.includes("entry_led")) return "Use a fixed station-entry script: enter, locate, hands on, first rep.";
  if (tags.includes("exit_led")) return "Practise finishing stations and jogging out immediately under high breathing load.";
  if (rox.entryTrend === "rising" || tags.includes("late_race_drift")) {
    return "Practise no-walk exits late in sessions so station flow holds under fatigue.";
  }
  if (detailLevel(analysisJson) === "partial") {
    return "Rehearse direct run-to-station routes and treat this as directional until split detail is available.";
  }
  return "Rehearse station entry and exit routes: move in, set up once, and leave immediately.";
}

export function roxzoneActionability(analysisJson = {}, limiter = null) {
  if (!isRoxzoneLimiter(limiter)) return null;

  const level = detailLevel(analysisJson);
  const gap = roxzoneGapSeconds(analysisJson);
  const rox = analysisJson.roxzoneAnalysis ?? {};
  const gapText = Number.isFinite(gap) && gap > 0 ? formatGain(gap) : null;
  const totalText = Number.isFinite(rox.totalSeconds) ? formatTime(rox.totalSeconds) : null;
  const actionEvidenceLevel =
    level === "entry_exit" ? "race_replay_detail"
      : level === "aggregate" ? "aggregate_only"
        : level === "partial" ? "estimated_only"
          : "unavailable";
  const confidenceText =
    actionEvidenceLevel === "race_replay_detail"
      ? "Race Replay detail is available, so focus on the specific entry/exit flow."
      : actionEvidenceLevel === "aggregate_only"
        ? "Only the aggregate RoxZone total is available, so treat this as transition-flow work rather than a single-station diagnosis."
        : "RoxZone detail is partial, so treat this as a directional transition signal rather than a precise station ranking.";
  const headline = gapText
    ? `RoxZone is costing about ${gapText}; this is transition execution, not station capacity.`
    : "RoxZone is the selected opportunity; this is transition execution, not station capacity.";

  return {
    label: "RoxZone",
    gapSeconds: gap,
    gapText,
    totalText,
    actionEvidenceLevel,
    confidence: level,
    confidenceText,
    actionText: primaryAction(analysisJson),
    emailLead: `${headline} ${confidenceText} ${primaryAction(analysisJson)}`,
    carouselAction: actionEvidenceLevel === "estimated_only" ? "ROXZONE DETAIL PARTIAL - REHEARSE ROUTES" : "TIGHTEN ENTRY/EXIT FLOW",
    raceCardCta: actionEvidenceLevel === "estimated_only" ? "ROXZONE DETAIL IS PARTIAL. REHEARSE ROUTES." : "TIGHTEN ENTRY AND EXIT FLOW.",
  };
}
