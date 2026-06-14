export function buildFocusAreas({ limiter, scores, runFadeAnalysis, roxzoneAnalysis, contextAnalysis, timePotential }) {
  const areas = [];
  const timeframeGuidance = contextAnalysis?.timeToRaceRisk?.guidance ?? "Build this into the next training block.";

  if (limiter) {
    areas.push({
      priority: 1,
      area: limiter.label,
      reason: `Largest benchmark gap (${limiter.timeGapSeconds}s).`,
      timePotentialSeconds: timePotential?.headlineGainSeconds ?? limiter.timeGapSeconds,
      timeframeGuidance,
      safetyNote: "Progress volume and intensity conservatively.",
    });
  }

  if (Number.isFinite(scores.engineScore) && Number.isFinite(scores.strengthScore) && Math.abs(scores.engineScore - scores.strengthScore) >= 15) {
    const area = scores.engineScore < scores.strengthScore ? "Running durability" : "Station strength endurance";
    areas.push({
      priority: areas.length + 1,
      area,
      reason: `Engine/strength score gap is ${Math.abs(scores.engineScore - scores.strengthScore)} points.`,
      timePotentialSeconds: 0,
      timeframeGuidance,
      safetyNote: "Keep the stronger system maintained while raising the limiter.",
    });
  }

  if (runFadeAnalysis?.available && runFadeAnalysis.runFadePct > 8) {
    areas.push({
      priority: areas.length + 1,
      area: "Late-run pacing",
      reason: `Run fade is ${runFadeAnalysis.runFadePct}%.`,
      timePotentialSeconds: 0,
      timeframeGuidance,
      safetyNote: "Avoid turning every run into a maximal effort.",
    });
  } else if (roxzoneAnalysis?.available && (roxzoneAnalysis.percentile ?? 100) < 45) {
    areas.push({
      priority: areas.length + 1,
      area: "Roxzone execution",
      reason: "Transition time is below benchmark.",
      timePotentialSeconds: Math.max(0, Math.round(roxzoneAnalysis.timeGapToMedianSeconds ?? 0)),
      timeframeGuidance,
      safetyNote: "Practise clean transitions before adding more fatigue.",
    });
  }

  return areas.slice(0, 3).map((area, index) => ({ ...area, priority: index + 1 }));
}
