import { formatGain, formatTime } from "./copyFormatter.js";
import { resolvedRoxzoneGapSeconds } from "../engine/gapSelectors.js";
import { isDoublesAnalysisDivision } from "../config/divisionGroups.js";

function isRoxzoneLimiter(limiter = null) {
  return limiter?.segmentKey === "roxzone_time" || String(limiter?.label ?? "").toLowerCase().includes("roxzone");
}

function isDoublesReport(analysisJson = {}, options = {}) {
  if (typeof options.isDoubles === "boolean") return options.isDoubles;
  return [
    analysisJson.athlete?.division,
    analysisJson.race?.division,
    analysisJson.division,
    analysisJson.benchmarkContext?.division,
    analysisJson.benchmarkContext?.primaryBenchmarkGroup?.division,
    analysisJson.benchmarkContext?.goalBenchmarkGroup?.division,
  ].some(isDoublesAnalysisDivision);
}

function detailLevel(analysisJson = {}) {
  const rox = analysisJson.roxzoneAnalysis ?? {};
  if (rox.entryExitAvailable || rox.mode === "explicit_splits" || rox.roxzoneNarrative?.available) return "entry_exit";
  if (rox.mode === "explicit_total") return "aggregate";
  if (rox.mode === "inferred_total") return "partial";
  return "unknown";
}

function primaryAction(analysisJson = {}, { isDoubles = false } = {}) {
  const rox = analysisJson.roxzoneAnalysis ?? {};
  const tags = rox.roxzoneNarrative?.scenarioTags ?? [];
  if (isDoubles) {
    if (tags.includes("entry_led")) return "Agree the station-entry order before each run: arrive together, one partner sets up, the other starts the first reps.";
    if (tags.includes("exit_led")) return "Practise clean station hand-offs and leaving together immediately under fatigue.";
    if (rox.entryTrend === "rising" || tags.includes("late_race_drift")) {
      return "Rehearse late-race hand-offs so both partners leave stations together without a walk break.";
    }
    if (detailLevel(analysisJson) === "partial") {
      return "Rehearse shared run-to-station routes and partner hand-offs; treat this as directional until split detail is available.";
    }
    return "Rehearse team station entry, hand-off, and exit routes: arrive together, set up once, and leave immediately.";
  }
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

export function roxzoneActionability(analysisJson = {}, limiter = null, options = {}) {
  if (!isRoxzoneLimiter(limiter)) return null;

  const isDoubles = isDoublesReport(analysisJson, options);
  const level = detailLevel(analysisJson);
  const gap = resolvedRoxzoneGapSeconds(analysisJson);
  const rox = analysisJson.roxzoneAnalysis ?? {};
  const gapText = Number.isFinite(gap) && gap > 0 ? formatGain(gap) : null;
  const totalText = Number.isFinite(rox.totalSeconds) ? formatTime(rox.totalSeconds) : null;
  const actionEvidenceLevel =
    level === "entry_exit" ? "race_replay_detail"
      : level === "aggregate" ? "aggregate_only"
        : level === "partial" ? "estimated_only"
          : "unavailable";
  const confidenceText =
    isDoubles
      ? actionEvidenceLevel === "race_replay_detail"
        ? "Race Replay detail is available, but official data is still a combined team time, not individual partner attribution."
        : actionEvidenceLevel === "aggregate_only"
          ? "Only the aggregate RoxZone team total is available, so treat this as partner-flow work rather than a single-person diagnosis."
          : "RoxZone detail is partial, so treat this as a directional team-transition signal rather than partner-level attribution."
      : actionEvidenceLevel === "race_replay_detail"
        ? "Race Replay detail is available, so focus on the specific entry/exit flow."
        : actionEvidenceLevel === "aggregate_only"
          ? "Only the aggregate RoxZone total is available, so treat this as transition-flow work rather than a single-station diagnosis."
          : "RoxZone detail is partial, so treat this as a directional transition signal rather than a precise station ranking.";
  const headline = gapText
    ? `RoxZone is costing the team about ${gapText}; this is partner transition execution, not station capacity.`
    : "RoxZone is the selected team opportunity; this is partner transition execution, not station capacity.";
  const singlesHeadline = gapText
    ? `RoxZone is costing about ${gapText}; this is transition execution, not station capacity.`
    : "RoxZone is the selected opportunity; this is transition execution, not station capacity.";
  const actionText = primaryAction(analysisJson, { isDoubles });
  const carouselAction = isDoubles
    ? actionEvidenceLevel === "estimated_only" ? "ROXZONE DETAIL PARTIAL - REHEARSE TEAM ROUTES" : "TIGHTEN TEAM HAND-OFFS"
    : actionEvidenceLevel === "estimated_only" ? "ROXZONE DETAIL PARTIAL - REHEARSE ROUTES" : "TIGHTEN ENTRY/EXIT FLOW";
  const raceCardCta = isDoubles
    ? actionEvidenceLevel === "estimated_only" ? "ROXZONE DETAIL IS PARTIAL. REHEARSE TEAM ROUTES." : "TIGHTEN TEAM HAND-OFFS."
    : actionEvidenceLevel === "estimated_only" ? "ROXZONE DETAIL IS PARTIAL. REHEARSE ROUTES." : "TIGHTEN ENTRY AND EXIT FLOW.";

  return {
    label: "RoxZone",
    gapSeconds: gap,
    gapText,
    totalText,
    actionEvidenceLevel,
    confidence: level,
    confidenceText,
    actionText,
    emailLead: `${isDoubles ? headline : singlesHeadline} ${confidenceText} ${actionText}`,
    carouselAction,
    raceCardCta,
    isDoubles,
  };
}
