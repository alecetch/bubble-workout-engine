import { ensureHyroxReportContract } from "../reports/reportContractBuilder.js";

export function buildCaption({ slide0 = {}, athleteContext = {}, analysisJson = {}, contract = null } = {}) {
  const narrative = ensureHyroxReportContract({ analysisJson, athleteContext, contract });
  const lines = ["I ran my HYROX result through Forma.", ""];

  lines.push(`Finish time: ${slide0.overall_time ?? "-"}`);

  const targetSec = athleteContext.targetFinishTimeSeconds;
  if (targetSec) lines.push(`Target: ${formatMss(targetSec)}`);

  const penaltySec = totalPenaltySeconds(analysisJson);
  if (penaltySec >= 60) lines.push(`Penalties: ${formatMss(penaltySec)} to clean up`);

  if (narrative.primaryClaim?.label) {
    const label = narrative.headlineMode === "penalty_first" ? "Fastest controllable win" : narrative.primaryClaim.longLabel ?? "Biggest opportunity";
    lines.push(`${label}: ${narrative.primaryClaim.label.toUpperCase()}`);
  } else if (slide0.biggest_limiter) {
    lines.push(`Biggest opportunity: ${slide0.biggest_limiter}`);
  }
  if (
    slide0.fastest_controllable_win
    && slide0.fastest_controllable_win.station
    && slide0.fastest_controllable_win.station !== slide0.biggest_limiter
  ) {
    lines.push(`Fastest controllable win: ${slide0.fastest_controllable_win.station}`);
  }
  if (slide0.largest_fitness_limiter && slide0.biggest_limiter === "PENALTIES") {
    lines.push(`Largest fitness limiter: ${slide0.largest_fitness_limiter.station}`);
  }
  const strengthStatus = narrative.strengthPolicy?.status;
  const strengthLabel = narrative.strengthPolicy?.displayLabel
    ? String(narrative.strengthPolicy.displayLabel).toUpperCase()
    : slide0.best_station;
  if (strengthLabel && !/^NO RELIABLE/i.test(String(strengthLabel))) {
    if (strengthStatus === "reliable_strength") {
      lines.push(`Biggest strength: ${strengthLabel}`);
    } else if (strengthStatus === "fastest_ahead_split_only") {
      lines.push(`Best relative split: ${strengthLabel}`);
    }
  }

  lines.push("", "Now I know exactly what to work on next.", "");
  lines.push("#HYROX #HYROXTraining #HybridAthlete #HybridTraining #Forma");

  return lines.join("\n");
}

function totalPenaltySeconds(analysisJson = {}) {
  if (Number.isFinite(analysisJson.penalties?.totalPenaltySeconds)) {
    return analysisJson.penalties.totalPenaltySeconds;
  }
  if (Array.isArray(analysisJson.penalties)) {
    return analysisJson.penalties.reduce((sum, penalty) => sum + (Number(penalty?.penaltySeconds) || 0), 0);
  }
  return 0;
}

function formatMss(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}
