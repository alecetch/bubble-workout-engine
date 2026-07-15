import {
  COMPLETENESS_SCORES,
  CONFIDENCE_RULES,
  RELEVANCE_SCORES,
  SAMPLE_SIZE_SCORES,
  VARIANCE_SCORES,
  GRADE_CUTOFFS,
  GRADE_RANK,
} from "./confidenceConfig.js";

function pointsFromMinTable(value, table) {
  const row = table.find((entry) => value >= entry.min);
  return row?.points ?? 0;
}

function pointsFromMaxTable(value, table) {
  const n = Number.isFinite(value) ? value : 0;
  const row = table.find((entry) => n <= entry.maxMissingnessRate || n <= entry.maxCv);
  return row?.points ?? 0;
}

export function gradeFromScore(score) {
  if (score >= GRADE_CUTOFFS.A) return "A";
  if (score >= GRADE_CUTOFFS.B) return "B";
  if (score >= GRADE_CUTOFFS.C) return "C";
  if (score >= GRADE_CUTOFFS.D) return "D";
  return "E";
}

export function isGradeAtLeast(grade, minimumGrade) {
  return (GRADE_RANK[grade] ?? 0) >= (GRADE_RANK[minimumGrade] ?? 0);
}

function relevancePoints(candidate) {
  return RELEVANCE_SCORES[candidate?.matchType] ?? RELEVANCE_SCORES.population;
}

function recencyPoints(candidate) {
  if (candidate?.performanceBand) return 10;
  return 8;
}

function isSkewed(stats) {
  const mean = Number(stats?.meanSeconds ?? stats?.mean_seconds);
  const median = Number(stats?.medianSeconds ?? stats?.median_seconds ?? stats?.p50Seconds ?? stats?.p50_seconds);
  if (!Number.isFinite(mean) || !Number.isFinite(median) || median === 0) return false;
  return Math.abs(mean - median) / median > CONFIDENCE_RULES.skewThreshold;
}

export function calculateConfidence(benchmarkStats, candidate = {}, request = {}) {
  const sampleSize = Number(benchmarkStats?.sampleSize ?? benchmarkStats?.sample_size ?? 0);
  const missingnessRate = Number(benchmarkStats?.missingnessRate ?? benchmarkStats?.missingness_rate ?? 0);
  const cv = Number(benchmarkStats?.cv ?? 0);
  const components = {
    sampleSize: pointsFromMinTable(sampleSize, SAMPLE_SIZE_SCORES),
    relevance: relevancePoints(candidate, request),
    completeness: pointsFromMaxTable(missingnessRate, COMPLETENESS_SCORES),
    variance: pointsFromMaxTable(cv, VARIANCE_SCORES),
    recency: recencyPoints(candidate),
  };
  const uncappedScore = Object.values(components).reduce((sum, value) => sum + value, 0);
  const score = sampleSize < 20 ? Math.min(uncappedScore, GRADE_CUTOFFS.D - 1) : uncappedScore;
  return {
    score,
    grade: gradeFromScore(score),
    sampleSize,
    components,
    isNoisy: Number.isFinite(cv) && cv > CONFIDENCE_RULES.noisyCvThreshold,
    isSkewed: isSkewed(benchmarkStats),
  };
}
