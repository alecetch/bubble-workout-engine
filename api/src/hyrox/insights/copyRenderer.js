import { SEGMENT_MAP } from "../config/segmentMap.js";
import { getCopyPrefix } from "../confidence/confidenceLabels.js";
import { shouldSoftenInsight } from "../confidence/suppressionRules.js";
import { formatSecondsToTime } from "../ingestion/timeParser.js";
import { displaySegmentLabel, segmentSubject, segmentVerb } from "../reports/segmentDisplay.js";

const SAFE_FALLBACK = "your benchmark group";
const SEGMENT_LABELS = Object.freeze(Object.fromEntries(SEGMENT_MAP.map((segment) => [segment.segmentKey, segment.displayName])));

function seconds(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${Math.round(n)}%`;
}

function formatPctOne(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${Math.round(n * 10) / 10}%`;
}

export function buildCopyVariables(analysisJson = {}, evidenceValues = {}, athleteContext = {}) {
  const group = analysisJson.benchmarkContext?.primaryBenchmarkGroup ?? {};
  const segmentKey = evidenceValues.segmentKey ?? analysisJson.headline?.biggestLimiter?.segmentKey;
  const heroSeconds = seconds(evidenceValues.primaryValue ?? evidenceValues.potentialGainSeconds ?? evidenceValues.heroMetricSeconds);
  const potentialGain = seconds(evidenceValues.potentialGainSeconds ?? analysisJson.timePotential?.headlineGainSeconds ?? analysisJson.headline?.headlineGainSeconds);
  const projectedTime = seconds(evidenceValues.projectedTimeSeconds ?? analysisJson.timePotential?.newProjectedTimeSeconds ?? analysisJson.headline?.projectedTimeSeconds);

  const segmentLabel = displaySegmentLabel(
    { segmentKey, label: evidenceValues.segmentLabel ?? SEGMENT_LABELS[segmentKey] },
    "This area",
  );

  return {
    segment_label: segmentLabel,
    segment_verb: segmentVerb(segmentLabel),
    segment_subject: segmentSubject({ segmentKey, label: segmentLabel }),
    segment_subject_verb: segmentVerb(segmentSubject({ segmentKey, label: segmentLabel })),
    hero_metric: heroSeconds === null ? SAFE_FALLBACK : formatSecondsToTime(heroSeconds),
    percentile: formatPercent(evidenceValues.percentile),
    benchmark_group_label: evidenceValues.benchmarkGroup ?? group.label ?? group.key ?? SAFE_FALLBACK,
    sample_size: Number.isFinite(Number(evidenceValues.sampleSize)) ? String(Math.round(Number(evidenceValues.sampleSize))) : null,
    run_fade_pct: formatPctOne(evidenceValues.runFadePct ?? analysisJson.runningAnalysis?.runFadePct),
    potential_gain: potentialGain === null ? null : formatSecondsToTime(potentialGain),
    projected_time: projectedTime === null ? null : formatSecondsToTime(projectedTime),
    profile_type: evidenceValues.profileType ?? analysisJson.workRunBalance?.profileType ?? null,
    target_time: seconds(evidenceValues.targetFinishTimeSeconds ?? athleteContext.targetFinishTimeSeconds) === null
      ? null
      : formatSecondsToTime(seconds(evidenceValues.targetFinishTimeSeconds ?? athleteContext.targetFinishTimeSeconds)),
  };
}

export function renderCopy(template = "", variables = {}) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, token) => {
    const value = variables[token];
    if (value === null || value === undefined || value === "") {
      console.warn(`[hyrox] missing insight copy variable: ${token}`);
      return SAFE_FALLBACK;
    }
    return String(value);
  });
}

export function renderInsight(insightDef, analysisJson = {}, athleteContext = {}, copyMode = "reportCopy", evidenceValues = {}) {
  const variables = buildCopyVariables(analysisJson, evidenceValues, athleteContext);
  const template = insightDef?.[copyMode] ?? insightDef?.reportCopy ?? insightDef?.title ?? "";
  const rendered = renderCopy(template, variables);
  const confidence = {
    grade: evidenceValues.confidenceGrade ?? "D",
    fallbackLevel: evidenceValues.fallbackLevel ?? 0,
    sampleSize: evidenceValues.sampleSize ?? 0,
  };
  if (shouldSoftenInsight({ ageGroupMissing: Boolean(athleteContext.ageGroupMissing) }, confidence)) {
    const prefix = getCopyPrefix(confidence.grade);
    return prefix ? `${prefix} ${rendered}` : rendered;
  }
  return rendered;
}
