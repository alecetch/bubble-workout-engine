import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GRADE_RANK } from "../confidence/confidenceConfig.js";
import { shouldShowInsight } from "../confidence/suppressionRules.js";
import { scoreInsight } from "./insightScorer.js";
import { selectInsights } from "./insightSelector.js";
import { evaluateTrigger } from "./triggerEvaluator.js";
import { renderInsight } from "./copyRenderer.js";
import { generatePopulationInsights } from "./populationInsights.js";
import { generateContextInsights } from "./contextInsights.js";
import { ACTION_MAP, VOLUME_INCREASING_ACTIONS } from "./recommendedActions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REGISTRY_PATH = path.join(__dirname, "insightRegistry.json");

export { GRADE_RANK as INSIGHT_ENGINE_GRADE_RANK };

let registryCache = null;

export function loadInsightRegistry() {
  if (!registryCache) {
    registryCache = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  }
  return registryCache;
}

export function enabledInsights() {
  return loadInsightRegistry().filter((insight) => insight.enabled);
}

function gradeAtLeast(grade, minGrade) {
  return (GRADE_RANK[grade] ?? 0) >= (GRADE_RANK[minGrade] ?? 0);
}

function outputTypeForSuppression(insightDef) {
  if (insightDef.outputType === "socialPublic") return "populationPost";
  if (insightDef.category === "time_potential") return "potentialGain";
  if (insightDef.category === "limiter") return "biggestLimiter";
  if (insightDef.category === "roxzone") return "roxzoneEfficiency";
  if (insightDef.category === "fatigue") return "runningFatigue";
  return insightDef.outputType;
}

function daysToRace(athleteContext = {}) {
  const explicit = Number(athleteContext.daysToRace);
  if (Number.isFinite(explicit)) return explicit;
  if (!athleteContext.raceDate) return null;
  const race = new Date(athleteContext.raceDate);
  if (Number.isNaN(race.getTime())) return null;
  return Math.ceil((race.getTime() - Date.now()) / 86400000);
}

function applyRaceProximity(insightDef, athleteContext = {}) {
  const days = daysToRace(athleteContext);
  const actions = insightDef.recommendedActions ?? [];
  const hasVolumeAction = actions.some((action) => VOLUME_INCREASING_ACTIONS.has(action));
  if (Number.isFinite(days) && days < 14 && hasVolumeAction) {
    return {
      recommendedActions: actions.filter((action) => !VOLUME_INCREASING_ACTIONS.has(action)),
      safetyNote: "Race is inside 14 days, so high-volume loading recommendations are suppressed.",
      suppressPrescriptiveCopy: true,
    };
  }
  return { recommendedActions: actions, safetyNote: null, suppressPrescriptiveCopy: false };
}

function shouldKeep(insightDef, evidenceValues, athleteContext = {}) {
  const grade = evidenceValues.confidenceGrade ?? "D";
  if (!gradeAtLeast(grade, insightDef.minConfidenceGrade ?? "D")) return false;
  return shouldShowInsight(
    {
      outputType: outputTypeForSuppression(insightDef),
      sampleSize: evidenceValues.sampleSize ?? 0,
      isPredictive: insightDef.outputType === "predictive",
      isPrescriptive: insightDef.outputType === "prescriptive",
      suggestsVolumeIncrease: (insightDef.recommendedActions ?? []).some((action) => VOLUME_INCREASING_ACTIONS.has(action)),
      timePotentialSeconds: evidenceValues.potentialGainSeconds,
    },
    { grade, sampleSize: evidenceValues.sampleSize ?? 0 },
    { daysToRace: daysToRace(athleteContext), dataQualityScore: athleteContext.dataQualityScore },
  );
}

function toScoredInsight(insightDef, evidenceValues, analysisJson, athleteContext) {
  const score = scoreInsight(insightDef, evidenceValues, analysisJson, athleteContext);
  const raceProximity = applyRaceProximity(insightDef, athleteContext);
  const copyEvidence = { ...evidenceValues, recommendedActions: raceProximity.recommendedActions };
  return {
    id: insightDef.id,
    category: insightDef.category,
    title: renderInsight(insightDef, analysisJson, athleteContext, "title", copyEvidence),
    socialHook: renderInsight(insightDef, analysisJson, athleteContext, "socialHook", copyEvidence),
    reportCopy: raceProximity.suppressPrescriptiveCopy
      ? "Race is close, so this report avoids recommending new high-volume changes."
      : renderInsight(insightDef, analysisJson, athleteContext, "reportCopy", copyEvidence),
    emailCopy: raceProximity.suppressPrescriptiveCopy
      ? "Race is close, so keep changes low-risk and avoid adding new volume."
      : renderInsight(insightDef, analysisJson, athleteContext, "emailCopy", copyEvidence),
    evidence: evidenceValues,
    confidence: evidenceValues.confidenceGrade ?? "D",
    confidenceGrade: evidenceValues.confidenceGrade ?? "D",
    priorityScore: score.priorityScore,
    priority_score: score.priority_score,
    scoreComponents: score.scoreComponents,
    recommendedTemplates: insightDef.recommendedTemplates ?? [],
    reportSections: insightDef.reportSections ?? [],
    recommendedActions: raceProximity.recommendedActions,
    recommendedActionCopy: Object.fromEntries(raceProximity.recommendedActions.map((action) => [action, ACTION_MAP[action] ?? action])),
    guardrails: insightDef.guardrails ?? [],
    outputType: insightDef.outputType,
    requiresContext: Boolean(insightDef.requiresContext),
    safetyNote: raceProximity.safetyNote,
  };
}

function evaluateDefinitions(insightDefs, analysisJson, athleteContext) {
  return insightDefs
    .filter((insightDef) => insightDef.enabled && !insightDef.requiresContext)
    .map((insightDef) => ({ insightDef, ...evaluateTrigger(insightDef, analysisJson, athleteContext) }))
    .filter((result) => result.eligible)
    .map(({ insightDef, evidenceValues }) => ({ insightDef, evidenceValues }));
}

export function generateInsights(analysisJson = {}, athleteContext = {}) {
  const definitions = enabledInsights();
  const populationGroupKey = athleteContext.populationBenchmarkGroupKey ?? analysisJson.benchmarkContext?.goalBenchmarkGroup?.key ?? analysisJson.benchmarkContext?.primaryBenchmarkGroup?.key;
  const populationDef = definitions.find((def) => def.id === "INSIGHT_046");

  const candidates = [
    ...evaluateDefinitions(definitions, analysisJson, athleteContext),
    ...generateContextInsights(definitions, analysisJson, athleteContext),
    ...generatePopulationInsights(populationGroupKey, populationDef),
  ];

  const scored = candidates
    .filter(({ insightDef, evidenceValues }) => shouldKeep(insightDef, evidenceValues, athleteContext))
    .map(({ insightDef, evidenceValues }) => toScoredInsight(insightDef, evidenceValues, analysisJson, athleteContext));

  return selectInsights(scored);
}
