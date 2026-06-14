import { formatGain, formatPercent, formatPercentile, formatTime, label } from "./copyFormatter.js";
import { buildRecommendations } from "./recommendationBuilder.js";

function hasContext(athleteContext) {
  return athleteContext && Object.keys(athleteContext).length > 0;
}

function section(sectionKey, title, content) {
  return { sectionKey, title, content };
}

function segment(analysisJson, key) {
  return analysisJson.segments?.find((row) => row.segmentKey === key) ?? null;
}

function contextCopy(analysisJson, athleteContext = {}) {
  const limiterKey = analysisJson.headline?.biggestLimiter?.segmentKey;
  if ((athleteContext.fiveKPbSeconds || athleteContext.engineScore >= 65) && limiterKey === "wall_balls") {
    return "Your engine is likely not the issue. The gap appears when running has to convert into station output under fatigue.";
  }
  if (athleteContext.strengthBenchmarks || athleteContext.deadliftKg || athleteContext.squatKg) {
    return "Your loaded stations may be supported by your strength background, but your race ceiling is likely limited by aerobic durability.";
  }
  if (Number(athleteContext.weeklyKm) < 20 && analysisJson.scores?.engineScore < 55) {
    return "A gradual increase in running frequency is likely to improve your ceiling, provided recovery is managed.";
  }
  if (Number(athleteContext.weeklyKm) >= 40 && analysisJson.runningAnalysis?.runFadePct >= 8) {
    return "More volume may not be the main answer; your result points toward durability and pacing under station fatigue.";
  }
  return "Your context supports the race-data story, but the strongest recommendations still come from the benchmarked splits.";
}

export function buildPersonalReport(analysisJson = {}, insights = [], athleteContext = {}) {
  const limiter = analysisJson.headline?.biggestLimiter ?? analysisJson.limiters?.[0] ?? null;
  const strength = analysisJson.headline?.biggestStrength ?? analysisJson.strengths?.[0] ?? null;
  const total = segment(analysisJson, "total_time");
  const recommendations = buildRecommendations(analysisJson, insights, athleteContext);
  const sections = [];
  const summary = [];

  if (limiter) summary.push(`${limiter.label} is the biggest estimated opportunity, with ${formatGain(analysisJson.timePotential?.headlineGainSeconds ?? limiter.timeGapSeconds)} potential gain.`);
  if (analysisJson.runningAnalysis?.runFadePct >= 8) summary.push(`Run fade was ${formatPercent(analysisJson.runningAnalysis.runFadePct)}, so fatigue resistance and pacing deserve attention.`);
  if (hasContext(athleteContext)) summary.push(contextCopy(analysisJson, athleteContext));
  sections.push(section("executive_summary", "Executive Summary", summary.slice(0, 3)));

  sections.push(section("race_snapshot", "Race Snapshot", [
    `Finish time: ${formatTime(analysisJson.race?.finishTimeSeconds ?? athleteContext.finishTimeSeconds) ?? "not supplied"}.`,
    `Division: ${athleteContext.division ?? "not supplied"}.`,
    `Overall benchmark: ${formatPercentile(total?.percentile) ?? "not available"} against ${analysisJson.benchmarkContext?.primaryBenchmarkGroup?.label ?? "your benchmark group"}.`,
  ]));

  sections.push(section("biggest_strength", "Biggest Strength", strength ? `${strength.label} is the strongest benchmarked area at ${formatPercentile(strength.percentile) ?? "a strong percentile"}.` : "No single high-confidence strength dominated this result."));
  sections.push(section("biggest_limiter", "Biggest Limiter", limiter ? `${limiter.label} is the main limiter, with an estimated gap of ${formatGain(limiter.timeGapSeconds)}.` : "No single station limiter dominated this result."));
  sections.push(section("time_potential", "Time Potential", `The current estimated opportunity is a ${formatGain(analysisJson.timePotential?.headlineGainSeconds ?? 0)} potential gain. This is an estimated opportunity, not a guarantee.`));
  sections.push(section("running_fatigue", "Running and Fatigue Profile", analysisJson.runningAnalysis?.available ? `Run fade was ${formatPercent(analysisJson.runningAnalysis.runFadePct)}.` : "Run fade could not be calculated from the supplied splits."));
  sections.push(section("roxzone_execution", "Roxzone and Execution Profile", analysisJson.roxzoneAnalysis?.mode === "inferred_total" ? "Your transition time is estimated from unallocated race time, so segment-level Roxzone claims are avoided." : `Roxzone percentile: ${formatPercentile(analysisJson.roxzoneAnalysis?.percentile) ?? "not available"}.`));

  if (hasContext(athleteContext)) {
    sections.push(section("training_context", "Training Context Interpretation", contextCopy(analysisJson, athleteContext)));
  }

  sections.push(section("recommended_focus_areas", "Recommended Focus Areas", recommendations.map((item) => `${item.priority}. ${item.title}: ${item.rationale} ${item.timeHorizon}.${item.safetyNote ? ` ${item.safetyNote}` : ""}`)));
  sections.push(section("cta", "Next Step", "Use Forma to build a training plan targeting your bottleneck."));

  return { sections, recommendations };
}
