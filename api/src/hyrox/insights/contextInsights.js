import { evaluateTrigger } from "./triggerEvaluator.js";

export function generateContextInsights(insightDefs = [], analysisJson = {}, athleteContext = {}) {
  if (!athleteContext || Object.keys(athleteContext).length === 0) return [];
  return insightDefs
    .filter((def) => def.enabled && def.requiresContext)
    .map((insightDef) => ({ insightDef, ...evaluateTrigger(insightDef, analysisJson, athleteContext) }))
    .filter((result) => result.eligible)
    .map(({ insightDef, evidenceValues }) => ({ insightDef, evidenceValues }));
}
