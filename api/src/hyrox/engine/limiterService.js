import { BENCHMARK_THRESHOLDS } from "../config/benchmarkThresholds.js";
import { RUN_KEYS, STATION_KEYS } from "../config/segmentMap.js";

const CONFIDENCE_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });
const ROXZONE_LIMITER_DOMINANCE_RATIO = 2.5;

// Excludes low-confidence segments (including repaired/estimated splits) from headline
// ranking - a segment we can't fully stand behind shouldn't drive the biggest-opportunity
// callout, subject line, or hero headline. It can still appear in FULL SPLIT DETAIL.
function confidenceAboveLow(segment) {
  return (CONFIDENCE_RANK[segment.confidence] ?? 0) >= CONFIDENCE_RANK.medium;
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

function isIndividualSplitSegment(segment) {
  return segment?.type === "run"
    || segment?.type === "station"
    || RUN_KEYS.includes(segment?.segmentKey)
    || STATION_KEYS.includes(segment?.segmentKey);
}

function isDeprioritizedAggregateSegment(segment) {
  return segment?.type === "aggregate" && !isCanonicalRoxzoneSegment(segment);
}

function isDominantRoxzoneLimiter(segment, nonRoxzoneCandidates) {
  const roxzoneGap = effectiveGapSeconds(segment);
  if (!Number.isFinite(roxzoneGap) || roxzoneGap <= 0) return false;

  const nextLargestGap = Math.max(
    0,
    ...nonRoxzoneCandidates.map((candidate) => effectiveGapSeconds(candidate) ?? 0),
  );
  return nextLargestGap <= 0 || roxzoneGap >= nextLargestGap * ROXZONE_LIMITER_DOMINANCE_RATIO;
}

function strengthAdvantageSeconds(candidate) {
  const gap = candidate?.gap ?? effectiveGapSeconds(candidate?.segment);
  return Number.isFinite(gap) && gap < 0 ? Math.abs(gap) : 0;
}

function isDominantRoxzoneStrength(candidate, nonRoxzoneCandidates) {
  if (!isCanonicalRoxzoneSegment(candidate?.segment)) return false;
  const roxzoneAdvantage = strengthAdvantageSeconds(candidate);
  if (roxzoneAdvantage <= 0) return false;

  const nextLargestAdvantage = Math.max(
    0,
    ...nonRoxzoneCandidates.map((other) => strengthAdvantageSeconds(other)),
  );
  return nextLargestAdvantage <= 0 || roxzoneAdvantage >= nextLargestAdvantage * ROXZONE_LIMITER_DOMINANCE_RATIO;
}

function compareStrengthCandidates(a, b) {
  return a.gap - b.gap;
}

export function compareLimiterSegments(a, b) {
  const aIsRoxzone = isCanonicalRoxzoneSegment(a);
  const bIsRoxzone = isCanonicalRoxzoneSegment(b);
  if (aIsRoxzone || bIsRoxzone) {
    const gapA = effectiveGapSeconds(a) ?? 0;
    const gapB = effectiveGapSeconds(b) ?? 0;
    return gapB - gapA;
  }
  if (isDeprioritizedAggregateSegment(a) && isIndividualSplitSegment(b)) return 1;
  if (isDeprioritizedAggregateSegment(b) && isIndividualSplitSegment(a)) return -1;
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
    .filter((segment) => confidenceAboveLow(segment))
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
    .filter(({ segment }) => !isRoxzoneSegment(segment) || segment.segmentKey === "roxzone_time");

  const individualCandidates = candidates
    .filter(({ segment }) => isIndividualSplitSegment(segment))
    .sort(compareStrengthCandidates);
  const aggregateCandidates = candidates
    .filter(({ segment }) => isDeprioritizedAggregateSegment(segment))
    .sort(compareStrengthCandidates);
  const nonRoxzoneCandidates = candidates.filter(({ segment }) => !isRoxzoneSegment(segment));
  const roxzoneCandidates = candidates
    .filter(({ segment }) => isCanonicalRoxzoneSegment(segment));
  const dominantRoxzoneCandidates = roxzoneCandidates
    .filter((candidate) => isDominantRoxzoneStrength(candidate, nonRoxzoneCandidates))
    .sort(compareStrengthCandidates);
  const secondaryRoxzoneCandidates = roxzoneCandidates
    .filter((candidate) => !dominantRoxzoneCandidates.includes(candidate))
    .sort(compareStrengthCandidates);

  const rankedCandidates = [
    ...[...individualCandidates, ...dominantRoxzoneCandidates].sort(compareStrengthCandidates),
    ...secondaryRoxzoneCandidates,
    ...aggregateCandidates,
  ];

  const segment = rankedCandidates[0]?.segment;
  const gap = rankedCandidates[0]?.gap;
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
