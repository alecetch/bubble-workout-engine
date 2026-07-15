import { BENCHMARK_THRESHOLDS } from "../config/benchmarkThresholds.js";

const CONFIDENCE_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });

function confidenceAtLeastLow(segment) {
  return (CONFIDENCE_RANK[segment.confidence] ?? 0) >= 1;
}

// When a goal benchmark is available, prefer the gap to the athlete's target over the gap to the
// age-group median. This keeps the headline limiter consistent with what the split table shows.
function effectiveGapSeconds(segment) {
  return segment.frameGapSeconds ?? segment.timeGapToExactTargetSeconds ?? segment.timeGapToMedianSeconds ?? null;
}

export function compareLimiterSegments(a, b) {
  if (a.type === "aggregate" && b.type === "station") return 1;
  if (b.type === "aggregate" && a.type === "station") return -1;
  const gapA = effectiveGapSeconds(a) ?? 0;
  const gapB = effectiveGapSeconds(b) ?? 0;
  const gapDiff = Math.abs(gapA - gapB);
  if (gapDiff <= BENCHMARK_THRESHOLDS.limiterTieSeconds) {
    return (a.percentile ?? 100) - (b.percentile ?? 100);
  }
  return gapB - gapA;
}

function toLimiter(segment) {
  if (!segment) return null;
  return {
    segmentKey: segment.segmentKey,
    label: segment.label,
    type: segment.type,
    timeGapSeconds: Math.round(effectiveGapSeconds(segment) ?? segment.timeGapToMedianSeconds),
    percentile: segment.percentile,
    benchmarkGroupUsed: segment.benchmarkGroupUsed,
    benchmarkValueSeconds: segment.benchmarkValueSeconds,
    confidence: segment.confidence,
  };
}

export function findBiggestLimiter(segmentStats) {
  const candidates = rankLimiterSegments(segmentStats);
  return toLimiter(candidates[0] ?? null);
}

export function rankLimiterSegments(segmentStats) {
  return segmentStats
    .filter((segment) => confidenceAtLeastLow(segment))
    .filter((segment) => {
      const gap = effectiveGapSeconds(segment);
      return Number.isFinite(gap) && gap > 0;
    })
    .filter((segment) => segment.segmentKey !== "total_time")
    .filter((segment) => !segment.segmentKey.startsWith("roxzone_"))
    .sort(compareLimiterSegments);
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

  if (!selectedLimiter || !["station", "aggregate", "run"].includes(selectedLimiter.type)) {
    return {
      headlineGainSeconds: 0,
      conservativeGainSeconds: 0,
      competitiveGainSeconds: 0,
      goalBasedGainSeconds: null,
      newProjectedTimeSeconds: normalisedSubmission.race?.finishTimeSeconds ?? null,
      benchmarkUsed: benchmarkContext?.primaryBenchmarkGroup?.key ?? null,
    };
  }

  const effectiveGap = effectiveGapSeconds(selectedLimiter);
  const conservativeGainSeconds = Math.max(
    0,
    Number.isFinite(effectiveGap)
      ? effectiveGap
      : selectedLimiter.userSeconds - (selectedLimiter.benchmarkMedianSeconds ?? selectedLimiter.userSeconds),
  );
  const competitiveGainSeconds = Math.max(0, selectedLimiter.userSeconds - (selectedLimiter.benchmarkTopQuartileSeconds ?? selectedLimiter.userSeconds));
  const goalBasedGainSeconds = Number.isFinite(selectedLimiter.timeGapToExactTargetSeconds)
    ? Math.max(0, selectedLimiter.timeGapToExactTargetSeconds)
    : Number.isFinite(selectedLimiter.goalBenchmarkSeconds)
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
