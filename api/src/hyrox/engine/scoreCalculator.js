import { SCORING_WEIGHTS } from "../config/scoringWeights.js";
import { STATION_KEYS } from "../config/segmentMap.js";

function clampScore(value) {
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function byKey(segmentStats) {
  return new Map(segmentStats.map((segment) => [segment.segmentKey, segment]));
}

function weightedAverage(components, values) {
  const available = components
    .map((component) => ({ ...component, value: values.get(component.metricKey) }))
    .filter((component) => Number.isFinite(component.value));
  const totalWeight = available.reduce((sum, component) => sum + component.weight, 0);
  if (available.length === 0 || totalWeight <= 0) return null;
  return available.reduce((sum, component) => sum + component.value * (component.weight / totalWeight), 0);
}

function stationConsistencyScore(normalisedSubmission) {
  const values = STATION_KEYS.map((key) => normalisedSubmission.splitMap?.get(key)?.timeSeconds).filter(Number.isFinite);
  if (values.length < 3) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!avg) return null;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / avg;
  return clampScore(100 - cv * 200);
}

function fadeScore(runFadeAnalysis) {
  if (!runFadeAnalysis?.available || !Number.isFinite(runFadeAnalysis.runFadePct)) return null;
  const benchmark = Number.isFinite(runFadeAnalysis.benchmarkMedianFadePct) ? runFadeAnalysis.benchmarkMedianFadePct : 5;
  const excess = Math.max(0, runFadeAnalysis.runFadePct - benchmark);
  return clampScore(100 - excess * 5);
}

export function calculateScores(segmentStats, normalisedSubmission, runFadeAnalysis = null) {
  const map = byKey(segmentStats);
  const values = new Map(segmentStats.map((segment) => [segment.segmentKey, segment.percentile]));
  values.set("run_fade", fadeScore(runFadeAnalysis));
  values.set("station_consistency", stationConsistencyScore(normalisedSubmission));

  const engineScore = clampScore(weightedAverage(SCORING_WEIGHTS.engine, values));
  const strengthScore = clampScore(weightedAverage(SCORING_WEIGHTS.strength, values));
  const bodyweightGritScore = clampScore(weightedAverage(SCORING_WEIGHTS.bodyweightGrit, values));
  const executionScore = clampScore(weightedAverage(SCORING_WEIGHTS.execution, values));
  const hybridBalanceScore = Number.isFinite(engineScore) && Number.isFinite(strengthScore)
    ? clampScore(100 - Math.abs(engineScore - strengthScore))
    : null;

  const raceComponents = Object.entries(SCORING_WEIGHTS.raceEfficiency)
    .map(([key, weight]) => ({ value: { engineScore, strengthScore, bodyweightGritScore, executionScore, hybridBalanceScore }[key], weight }))
    .filter((component) => Number.isFinite(component.value));
  const totalRaceWeight = raceComponents.reduce((sum, component) => sum + component.weight, 0);
  const raceEfficiencyScore = totalRaceWeight > 0
    ? clampScore(raceComponents.reduce((sum, component) => sum + component.value * (component.weight / totalRaceWeight), 0))
    : null;

  const overallPerformanceScore = clampScore(map.get("total_time")?.percentile ?? raceEfficiencyScore);

  return {
    overallPerformanceScore,
    engineScore,
    strengthScore,
    bodyweightGritScore,
    executionScore,
    hybridBalanceScore,
    raceEfficiencyScore,
  };
}
