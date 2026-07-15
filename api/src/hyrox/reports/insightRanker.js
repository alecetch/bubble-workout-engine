import { GRADE_RANK } from "../confidence/confidenceConfig.js";

export const CONFIDENCE = Object.freeze({ high: 1, medium: 0.7, low: 0.4, A: 1, B: 0.85, C: 0.65, D: 0.4, E: 0 });
export const CONFIDENCE_GRADE_KEYS = Object.freeze(Object.keys(GRADE_RANK));

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function confidence(insight) {
  return CONFIDENCE[insight.confidenceGrade ?? insight.confidence] ?? 0.5;
}

function severity(insight) {
  const seconds = Number(insight.evidence?.potentialGainSeconds ?? insight.evidence?.primaryValue ?? 0);
  return clamp01(seconds / 120) || clamp01(insight.priorityScore ?? insight.priority_score ?? 0);
}

function actionability(insight) {
  return insight.recommendedActions?.length ? 1 : insight.category === "recommendation" ? 1 : 0.5;
}

function novelty(insight) {
  if (["population", "myth_buster"].includes(insight.category)) return 0.9;
  if (["roxzone", "fatigue", "balance"].includes(insight.category)) return 0.7;
  return 0.5;
}

function shareability(insight) {
  if (insight.socialHook) return 0.8;
  if (["population", "limiter", "time_potential"].includes(insight.category)) return 0.7;
  return 0.4;
}

function contextRelevance(insight) {
  return insight.requiresContext ? 1 : ["goal_gap", "limiter", "time_potential"].includes(insight.category) ? 0.7 : 0.4;
}

function motivationalValue(insight) {
  if (insight.category === "strength") return 1;
  if (["limiter", "time_potential"].includes(insight.category)) return 0.7;
  return 0.5;
}

function outputScore(insight, outputType) {
  if (outputType === "carousel_a" || outputType === "carousel_b") {
    return 0.30 * shareability(insight)
      + 0.25 * novelty(insight)
      + 0.20 * confidence(insight)
      + 0.15 * severity(insight)
      + 0.10 * actionability(insight);
  }
  return 0.35 * actionability(insight)
    + 0.25 * severity(insight)
    + 0.20 * confidence(insight)
    + 0.10 * contextRelevance(insight)
    + 0.10 * motivationalValue(insight);
}

export function rankInsightsForOutput(insights = [], outputType = "web_report") {
  return insights
    .map((insight) => ({ ...insight, outputScore: Math.round(outputScore(insight, outputType) * 1000) / 1000 }))
    .sort((a, b) => (b.outputScore - a.outputScore) || ((b.priorityScore ?? 0) - (a.priorityScore ?? 0)) || a.id.localeCompare(b.id));
}
