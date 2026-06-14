import { BENCHMARK_THRESHOLDS } from "../config/benchmarkThresholds.js";

const CONFIDENCE_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });

function confidenceAtLeastLow(segment) {
  return (CONFIDENCE_RANK[segment.confidence] ?? 0) >= 1;
}

function preferLimiter(a, b) {
  const gapDiff = Math.abs(a.timeGapToMedianSeconds - b.timeGapToMedianSeconds);
  if (gapDiff <= BENCHMARK_THRESHOLDS.limiterTieSeconds) {
    return (a.percentile ?? 100) - (b.percentile ?? 100);
  }
  if (a.type === "station" && b.type === "aggregate" && a.timeGapToMedianSeconds >= b.timeGapToMedianSeconds - 5) return -1;
  if (b.type === "station" && a.type === "aggregate" && b.timeGapToMedianSeconds >= a.timeGapToMedianSeconds - 5) return 1;
  return b.timeGapToMedianSeconds - a.timeGapToMedianSeconds;
}

function toLimiter(segment) {
  if (!segment) return null;
  return {
    segmentKey: segment.segmentKey,
    label: segment.label,
    type: segment.type,
    timeGapSeconds: Math.round(segment.timeGapToMedianSeconds),
    percentile: segment.percentile,
    benchmarkGroupUsed: segment.benchmarkGroupUsed,
    benchmarkValueSeconds: segment.benchmarkValueSeconds,
    confidence: segment.confidence,
  };
}

export function findBiggestLimiter(segmentStats) {
  const candidates = segmentStats
    .filter((segment) => confidenceAtLeastLow(segment))
    .filter((segment) => Number.isFinite(segment.timeGapToMedianSeconds) && segment.timeGapToMedianSeconds > 0)
    .filter((segment) => segment.segmentKey !== "total_time")
    .filter((segment) => !segment.segmentKey.startsWith("roxzone_"))
    .sort(preferLimiter);
  return toLimiter(candidates[0] ?? null);
}

export function findBiggestStrength(segmentStats) {
  const candidates = segmentStats
    .filter((segment) => Number.isFinite(segment.percentile))
    .filter((segment) => Number.isFinite(segment.timeGapToMedianSeconds) && segment.timeGapToMedianSeconds < -BENCHMARK_THRESHOLDS.strengthMinimumAdvantageSeconds)
    .filter((segment) => !segment.segmentKey.startsWith("roxzone_") || segment.percentile >= 90)
    .sort((a, b) => (b.percentile - a.percentile) || (a.timeGapToMedianSeconds - b.timeGapToMedianSeconds));

  const segment = candidates[0];
  if (!segment) return null;
  return {
    segmentKey: segment.segmentKey,
    label: segment.label,
    percentile: segment.percentile,
    timeAdvantageSeconds: Math.round(Math.abs(segment.timeGapToMedianSeconds)),
    confidence: segment.confidence,
  };
}

export function calculateTimePotential(segmentStats, normalisedSubmission, benchmarkContext, limiter = null) {
  const selectedLimiter = limiter
    ? segmentStats.find((segment) => segment.segmentKey === limiter.segmentKey)
    : segmentStats.find((segment) => segment.segmentKey === findBiggestLimiter(segmentStats)?.segmentKey);

  if (!selectedLimiter || selectedLimiter.type !== "station") {
    return {
      headlineGainSeconds: 0,
      conservativeGainSeconds: 0,
      competitiveGainSeconds: 0,
      goalBasedGainSeconds: null,
      newProjectedTimeSeconds: normalisedSubmission.race?.finishTimeSeconds ?? null,
      benchmarkUsed: benchmarkContext?.primaryBenchmarkGroup?.key ?? null,
    };
  }

  const conservativeGainSeconds = Math.max(0, selectedLimiter.userSeconds - (selectedLimiter.benchmarkMedianSeconds ?? selectedLimiter.userSeconds));
  const competitiveGainSeconds = Math.max(0, selectedLimiter.userSeconds - (selectedLimiter.benchmarkTopQuartileSeconds ?? selectedLimiter.userSeconds));
  const goalBasedGainSeconds = Number.isFinite(selectedLimiter.goalBenchmarkSeconds)
    ? Math.max(0, selectedLimiter.userSeconds - selectedLimiter.goalBenchmarkSeconds)
    : null;
  const headlineGainSeconds = goalBasedGainSeconds ?? conservativeGainSeconds;
  const finish = normalisedSubmission.race?.finishTimeSeconds ?? null;

  return {
    headlineGainSeconds: Math.round(headlineGainSeconds),
    conservativeGainSeconds: Math.round(conservativeGainSeconds),
    competitiveGainSeconds: Math.round(competitiveGainSeconds),
    goalBasedGainSeconds: goalBasedGainSeconds === null ? null : Math.round(goalBasedGainSeconds),
    newProjectedTimeSeconds: Number.isFinite(finish) ? Math.round(finish - headlineGainSeconds) : null,
    benchmarkUsed: goalBasedGainSeconds !== null
      ? benchmarkContext?.goalBenchmarkGroup?.key ?? benchmarkContext?.primaryBenchmarkGroup?.key ?? null
      : benchmarkContext?.primaryBenchmarkGroup?.key ?? null,
  };
}
