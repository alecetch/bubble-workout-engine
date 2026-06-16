import { HYROX_ANALYSIS_VERSION } from "../config/benchmarkThresholds.js";
import { normaliseSubmission } from "./segmentNormaliser.js";
import { selectBenchmarkGroups } from "./benchmarkSelector.js";
import { calculateSegmentStats } from "./percentileCalculator.js";
import { calculateScores } from "./scoreCalculator.js";
import { findBiggestLimiter, findBiggestStrength, calculateTimePotential } from "./limiterService.js";
import { analyseRunFade } from "./runFadeAnalyser.js";
import { analyseRoxzone } from "./roxzoneAnalyser.js";
import { analyseContext } from "./contextAnalyser.js";
import { classifyArchetype } from "./archetypeClassifier.js";
import { buildFocusAreas } from "./focusAreaBuilder.js";
import { computeExactTargetMap, attachExactTargets } from "./splitTargetCalculator.js";

function markSegmentRoles(segments, limiter, strength) {
  return segments.map((segment) => ({
    ...segment,
    isBiggestLimiter: segment.segmentKey === limiter?.segmentKey,
    isBiggestStrength: segment.segmentKey === strength?.segmentKey,
  }));
}

function stationBreakdown(segments) {
  return segments
    .filter((segment) => segment.type === "station" && Number.isFinite(segment.percentile))
    .sort((a, b) =>
      (b.timeGapToExactTargetSeconds ?? b.timeGapToMedianSeconds ?? 0) -
      (a.timeGapToExactTargetSeconds ?? a.timeGapToMedianSeconds ?? 0)
    )
    .map((segment) => ({
      segmentKey: segment.segmentKey,
      label: segment.label,
      percentile: segment.percentile,
      timeGapSeconds: Math.round(segment.timeGapToExactTargetSeconds ?? segment.timeGapToMedianSeconds ?? 0),
      confidence: segment.confidence,
    }));
}

function workRunBalance(normalised) {
  const total = normalised.race?.finishTimeSeconds;
  const run = normalised.runTimeSeconds;
  const work = normalised.workTimeSeconds;
  const rox = normalised.roxzoneTimeSeconds;
  const runShare = total ? run / total : null;
  const workShare = total ? work / total : null;
  const roxzoneShare = total && Number.isFinite(rox) ? rox / total : null;
  let profileType = "balanced_hybrid";
  if ((roxzoneShare ?? 0) > 0.12) profileType = "transition_limited";
  else if ((runShare ?? 0) > 0.6) profileType = "runner_dominant";
  else if ((workShare ?? 0) > 0.42) profileType = "strength_dominant";
  return {
    runShare,
    workShare,
    roxzoneShare,
    workToRunRatio: run ? work / run : null,
    profileType,
  };
}

function dataQuality(normalised, benchmarkContext) {
  const expected = normalised.completeness.totalExpectedSplits;
  const supplied = normalised.completeness.runSplits + normalised.completeness.stationSplits + normalised.completeness.roxzoneSplits;
  const issues = [];
  const warnings = [];
  if (!benchmarkContext.available) issues.push("no_benchmark_data");
  if (!Number.isFinite(normalised.race?.finishTimeSeconds)) issues.push("missing_finish_time");
  if (normalised.roxzoneMode === "inferred_total") warnings.push("roxzone_inferred_from_unallocated_time");
  if (supplied < expected) warnings.push("partial_split_data");
  return {
    inputCompleteness: Math.round((supplied / expected) * 100) / 100,
    splitMode: normalised.roxzoneMode,
    issues,
    warnings,
    confidence: issues.length > 0 ? "low" : supplied >= expected ? "high" : "medium",
  };
}

function analysisScope(input, normalised, benchmarkContext) {
  const division = normalised.athlete?.division ?? normalised.race?.division;
  if (division && !["open", "pro"].includes(division)) return "limited";
  if (!benchmarkContext.available) return "no_benchmark_data";
  const supplied = normalised.completeness.runSplits + normalised.completeness.stationSplits;
  if (supplied < 8) return "limited";
  if (supplied < 16 || normalised.roxzoneMode !== "explicit_splits") return "partial";
  return "full";
}

export function analyseSubmission(input = {}) {
  const normalised = normaliseSubmission(input);
  const benchmarkContext = selectBenchmarkGroups(normalised);
  const scope = analysisScope(input, normalised, benchmarkContext);

  const rawSegments = benchmarkContext.available ? calculateSegmentStats(normalised, benchmarkContext) : [];
  const targetFinishSeconds = input.athleteContext?.targetFinishTimeSeconds ?? null;
  const exactTargetMap = computeExactTargetMap(
    rawSegments,
    targetFinishSeconds,
    Boolean(benchmarkContext.goalBenchmarkGroup),
  );
  const baseSegments = attachExactTargets(rawSegments, exactTargetMap);
  const runFadeAnalysis = analyseRunFade(normalised, benchmarkContext);
  const roxzoneAnalysis = analyseRoxzone(normalised, benchmarkContext);
  const scores = calculateScores(baseSegments, normalised, runFadeAnalysis);
  const limiter = findBiggestLimiter(baseSegments);
  const strength = findBiggestStrength(baseSegments);
  const segments = markSegmentRoles(baseSegments, limiter, strength);
  const rankedStations = stationBreakdown(segments);
  const strengths = strength ? [strength] : [];
  const limiters = limiter ? [limiter] : [];
  const timePotential = calculateTimePotential(segments, normalised, benchmarkContext, limiter);
  const contextAnalysis = analyseContext(normalised, scores, limiter);
  const athleteArchetype = classifyArchetype(scores, normalised, runFadeAnalysis, roxzoneAnalysis, limiter, segments);
  const recommendedFocusAreas = buildFocusAreas({
    limiter,
    scores,
    runFadeAnalysis,
    roxzoneAnalysis,
    contextAnalysis,
    timePotential,
  });

  return {
    submissionId: input.submissionId ?? null,
    analysisVersion: HYROX_ANALYSIS_VERSION,
    analysisScope: scope,
    athlete: normalised.athlete,
    race: normalised.race,
    dataQuality: dataQuality(normalised, benchmarkContext),
    benchmarkContext: {
      primaryBenchmarkGroup: benchmarkContext.primaryBenchmarkGroup,
      fallbacksUsed: benchmarkContext.fallbacksUsed,
      goalBenchmarkGroup: benchmarkContext.goalBenchmarkGroup,
    },
    headline: {
      biggestLimiter: limiter ? {
        segmentKey: limiter.segmentKey,
        label: limiter.label,
        type: limiter.type,
        timeGapSeconds: limiter.timeGapSeconds,
        percentile: limiter.percentile,
        confidence: limiter.confidence,
      } : null,
      biggestStrength: strength ? {
        segmentKey: strength.segmentKey,
        label: strength.label,
        percentile: strength.percentile,
      } : null,
      headlineGainSeconds: timePotential.headlineGainSeconds,
      projectedTimeSeconds: timePotential.newProjectedTimeSeconds,
    },
    scores,
    segments,
    stationBreakdown: rankedStations,
    strengths,
    limiters,
    penalties: normalised.penalties ?? [],
    timePotential,
    runningAnalysis: runFadeAnalysis,
    roxzoneAnalysis,
    workRunBalance: workRunBalance(normalised),
    contextAnalysis,
    athleteArchetype,
    recommendedFocusAreas,
  };
}
