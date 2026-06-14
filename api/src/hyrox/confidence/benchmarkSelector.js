import { getBenchmarkGroup, getBenchmarkStats } from "../engine/benchmarkService.js";
import { calculateConfidence, isGradeAtLeast } from "./confidenceScorer.js";
import { buildFallbackChain, buildPerformanceTargetFallbackChain } from "./fallbackRules.js";
import { GRADE_RANK, MIN_SAMPLES_BY_OUTPUT, OUTPUT_TYPE_REQUIRED_GRADE, REQUIRED_GRADE } from "./confidenceConfig.js";

export { REQUIRED_GRADE };

function requiredGradeForOutput(outputType) {
  return OUTPUT_TYPE_REQUIRED_GRADE[outputType] ?? REQUIRED_GRADE[outputType] ?? "D";
}

function fallbackReason(level) {
  if (level === 0) return null;
  if (level === 1) return "exact benchmark sample below threshold or unavailable";
  return "broader benchmark used because narrower group did not meet confidence threshold";
}

function enrichCandidate(candidate) {
  const group = getBenchmarkGroup(candidate.groupKey);
  return group ? { ...candidate, ...group, groupKey: candidate.groupKey, level: candidate.level, matchType: candidate.matchType } : candidate;
}

function selectionFromCandidate({ candidate, stats, confidence, outputType }) {
  const sampleSize = stats.sampleSize ?? 0;
  const reason = fallbackReason(candidate.level);
  const confidenceAudit = {
    ...confidence,
    sampleSize,
    fallbackLevel: candidate.level,
    fallbackReason: reason,
  };

  return {
    suppressed: false,
    groupKey: candidate.groupKey,
    benchmarkUsed: candidate.groupKey,
    benchmarkRequested: candidate.benchmarkRequested,
    fallbackLevel: candidate.level,
    fallbackReason: reason,
    sampleSize,
    confidenceScore: confidenceAudit.score,
    confidenceGrade: confidenceAudit.grade,
    confidence: confidenceAudit,
    outputType,
    group: getBenchmarkGroup(candidate.groupKey),
    stats,
  };
}

export function selectBenchmark(request = {}, metricKey, outputType = "overallPercentile", options = {}) {
  const chain = options.performanceTarget
    ? buildPerformanceTargetFallbackChain(request)
    : buildFallbackChain(request);
  const requiredGrade = options.requiredGrade ?? requiredGradeForOutput(outputType);
  const minSample = MIN_SAMPLES_BY_OUTPUT[outputType] ?? 0;
  const attempted = [];

  for (const rawCandidate of chain) {
    const candidate = enrichCandidate(rawCandidate);
    const stats = getBenchmarkStats(candidate.groupKey, metricKey);
    if (!stats) {
      attempted.push({ groupKey: candidate.groupKey, reason: "missing_metric" });
      continue;
    }
    const confidence = calculateConfidence(stats, candidate, request);
    const sampleSize = Number(stats.sampleSize ?? 0);
    attempted.push({
      groupKey: candidate.groupKey,
      grade: confidence.grade,
      score: confidence.score,
      sampleSize,
    });
    if (sampleSize < minSample) continue;
    if (!isGradeAtLeast(confidence.grade, requiredGrade)) continue;
    return selectionFromCandidate({ candidate, stats, confidence, outputType });
  }

  return {
    suppressed: true,
    reason: "no_benchmark_meets_threshold",
    benchmarkRequested: chain[0]?.benchmarkRequested ?? null,
    metricKey,
    outputType,
    requiredGrade,
    minSample,
    attempted,
  };
}

export function gradeIsAtLeast(grade, minGrade) {
  return (GRADE_RANK[grade] ?? 0) >= (GRADE_RANK[minGrade] ?? 0);
}
