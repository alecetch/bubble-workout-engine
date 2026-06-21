export function buildCaption({ slide0 = {}, athleteContext = {}, analysisJson = {} } = {}) {
  const lines = ["I ran my HYROX result through Forma.", ""];

  lines.push(`Finish time: ${slide0.overall_time ?? "-"}`);

  const targetSec = athleteContext.targetFinishTimeSeconds;
  if (targetSec) lines.push(`Target: ${formatMss(targetSec)}`);

  const penaltySec = totalPenaltySeconds(analysisJson);
  if (penaltySec >= 60) lines.push(`Penalties: ${formatMss(penaltySec)} to clean up`);

  if (slide0.biggest_limiter) lines.push(`Biggest opportunity: ${slide0.biggest_limiter}`);
  if (slide0.best_station) lines.push(`Biggest strength: ${slide0.best_station}`);

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
