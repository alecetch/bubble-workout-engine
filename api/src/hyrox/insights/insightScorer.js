const CONFIDENCE_NORMALISATION = Object.freeze({ A: 1, B: 0.85, C: 0.65, D: 0.4, E: 0 });

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function evidenceStrength(evidenceValues = {}) {
  if (evidenceValues.evidenceType === "direct_precise") return 1;
  if (evidenceValues.evidenceType === "direct_fallback") return 0.8;
  if (evidenceValues.evidenceType === "derived") return 0.7;
  if (evidenceValues.evidenceType === "context_inference") return 0.6;
  if (evidenceValues.evidenceType === "context_only") return 0.4;
  if (evidenceValues.evidenceType === "population") return (evidenceValues.sampleSize ?? 0) >= 1000 ? 1 : 0.3;
  if (evidenceValues.evidenceType === "data_quality") return 0.7;
  return 0.5;
}

function maxPotentialGain(analysisJson = {}) {
  const values = [
    analysisJson.timePotential?.headlineGainSeconds,
    analysisJson.headline?.headlineGainSeconds,
    ...(analysisJson.limiters ?? []).map((limiter) => limiter.timeGapSeconds),
    ...(analysisJson.segments ?? []).map((segment) => segment.timeGapToMedianSeconds),
  ].map(Number).filter((value) => Number.isFinite(value) && value > 0);
  return Math.max(1, ...values);
}

function timeImpact(evidenceValues = {}, analysisJson = {}) {
  const gain = Number(evidenceValues.potentialGainSeconds ?? evidenceValues.primaryValue ?? 0);
  if (!Number.isFinite(gain) || gain <= 0) return 0;
  return clamp01(gain / maxPotentialGain(analysisJson));
}

function goalRelevance(insightDef = {}, athleteContext = {}) {
  if (insightDef.category === "goal_gap") return 1;
  if (athleteContext.targetFinishTimeSeconds || athleteContext.targetTimeSeconds) {
    if (["limiter", "time_potential", "recommendation", "fatigue", "roxzone"].includes(insightDef.category)) return 0.8;
  }
  if (["limiter", "time_potential", "recommendation"].includes(insightDef.category)) return 0.7;
  if (["population", "myth_buster", "data_quality"].includes(insightDef.category)) return 0.3;
  return 0.5;
}

function novelty(insightDef = {}) {
  if (["population", "myth_buster"].includes(insightDef.category)) return 0.8;
  if (insightDef.category === "limiter") return 0.7;
  if (insightDef.category === "recommendation") return 0.5;
  if (insightDef.category === "data_quality") return 0.2;
  return 0.6;
}

function confidenceNorm(evidenceValues = {}) {
  return CONFIDENCE_NORMALISATION[evidenceValues.confidenceGrade ?? evidenceValues.confidence ?? "D"] ?? 0.4;
}

function actionability(insightDef = {}) {
  if (insightDef.category === "recommendation") return 1;
  if (insightDef.outputType === "prescriptive") return 1;
  if (["diagnostic", "socialPublic"].includes(insightDef.outputType)) return 0.8;
  if (insightDef.outputType === "descriptive") return 0.5;
  return insightDef.recommendedActions?.length ? 0.8 : 0.5;
}

export function scoreInsight(insightDef, evidenceValues = {}, analysisJson = {}, athleteContext = {}) {
  const components = {
    evidenceStrength: evidenceStrength(evidenceValues),
    timeImpact: timeImpact(evidenceValues, analysisJson),
    userGoalRelevance: goalRelevance(insightDef, athleteContext),
    novelty: novelty(insightDef),
    confidence: confidenceNorm(evidenceValues),
    actionability: actionability(insightDef),
  };
  const priorityScore = (
    components.evidenceStrength * 0.30
    + components.timeImpact * 0.25
    + components.userGoalRelevance * 0.20
    + components.novelty * 0.10
    + components.confidence * 0.10
    + components.actionability * 0.05
  );

  return {
    priorityScore: Math.round(priorityScore * 1000) / 1000,
    priority_score: Math.round(priorityScore * 1000) / 1000,
    scoreComponents: components,
  };
}
