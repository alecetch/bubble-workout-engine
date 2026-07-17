import { BENCHMARK_THRESHOLDS } from "../config/benchmarkThresholds.js";

const CONFIDENCE_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });
const ROXZONE_LIMITER_MIN_GAP_SECONDS = 90;
const ROXZONE_LIMITER_DOMINANCE_RATIO = 2.5;

function confidenceAtLeastLow(segment) {
  return (CONFIDENCE_RANK[segment.confidence] ?? 0) >= 1;
}

// When a goal benchmark is available, prefer the gap to the athlete's target over the gap to the
// age-group median. This keeps the headline limiter consistent with what the split table shows.
function effectiveGapSeconds(segment) {
  if (!segment) return null;
  return segment.frameGapSeconds ?? segment.timeGapToExactTargetSeconds ?? segment.timeGapToMedianSeconds ?? null;
}

function isRoxzoneSegment(segment) {
  return segment?.segmentKey === "roxzone_time" || String(segment?.segmentKey ?? "").startsWith("roxzone_");
}

function isCanonicalRoxzoneSegment(segment) {
  return segment?.segmentKey === "roxzone_time";
}

function isDominantRoxzoneLimiter(segment, nonRoxzoneCandidates) {
  const roxzoneGap = effectiveGapSeconds(segment);
  if (!Number.isFinite(roxzoneGap) || roxzoneGap < ROXZONE_LIMITER_MIN_GAP_SECONDS) return false;

  const nextLargestGap = Math.max(
    0,
    ...nonRoxzoneCandidates.map((candidate) => effectiveGapSeconds(candidate) ?? 0),
  );
  return nextLargestGap <= 0 || roxzoneGap >= nextLargestGap * ROXZONE_LIMITER_DOMINANCE_RATIO;
}

export function compareLimiterSegments(a, b) {
  const aIsRoxzone = isCanonicalRoxzoneSegment(a);
  const bIsRoxzone = isCanonicalRoxzoneSegment(b);
  if (aIsRoxzone || bIsRoxzone) {
    const gapA = effectiveGapSeconds(a) ?? 0;
    const gapB = effectiveGapSeconds(b) ?? 0;
    return gapB - gapA;
  }
  if (a.type === "aggregate" && b.type === "station") return 1;
  if (b.type === "aggregate" && a.type === "station") return -1;
  const gapA = effectiveGapSeconds(a) ?? 0;
  const gapB = effectiveGapSeconds(b) ?? 0;
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
  const candidates = segmentStats
    .filter((segment) => confidenceAtLeastLow(segment))
    .filter((segment) => {
      const gap = effectiveGapSeconds(segment);
      return Number.isFinite(gap) && gap > 0;
    })
    .filter((segment) => segment.segmentKey !== "total_time");
  const nonRoxzoneCandidates = candidates.filter((segment) => !isRoxzoneSegment(segment));
  const roxzoneCandidates = candidates
    .filter((segment) => isCanonicalRoxzoneSegment(segment))
    .filter((segment) => isDominantRoxzoneLimiter(segment, nonRoxzoneCandidates));

  return [...nonRoxzoneCandidates, ...roxzoneCandidates].sort(compareLimiterSegments);
}

export function findBiggestStrength(segmentStats) {
  const candidates = segmentStats
    .map((segment) => ({ segment, gap: effectiveGapSeconds(segment) }))
    .filter(({ segment, gap }) => Number.isFinite(gap) && gap < -BENCHMARK_THRESHOLDS.strengthMinimumAdvantageSeconds)
    .filter(({ segment }) => !isRoxzoneSegment(segment) || segment.segmentKey === "roxzone_time")
    .sort((a, b) => a.gap - b.gap);

  const segment = candidates[0]?.segment;
  const gap = candidates[0]?.gap;
  if (!segment) return null;
  return {
    segmentKey: segment.segmentKey,
    label: segment.label,
    percentile: segment.percentile,
    timeAdvantageSeconds: Math.round(Math.abs(gap)),
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
