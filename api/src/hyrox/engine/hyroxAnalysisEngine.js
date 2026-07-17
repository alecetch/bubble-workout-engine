import { HYROX_ANALYSIS_VERSION } from "../config/benchmarkThresholds.js";
import { isIndividualAnalysisDivision } from "../config/divisionGroups.js";
import { normaliseSubmission } from "./segmentNormaliser.js";
import { selectBenchmarkGroups } from "./benchmarkSelector.js";
import { approximatePercentile, calculateSegmentStats } from "./percentileCalculator.js";
import { calculateScores } from "./scoreCalculator.js";
import { findBiggestLimiter, findBiggestStrength, calculateTimePotential } from "./limiterService.js";
import { analyseRunFade } from "./runFadeAnalyser.js";
import { analyseRoxzone } from "./roxzoneAnalyser.js";
import { analyseContext } from "./contextAnalyser.js";
import { classifyArchetype } from "./archetypeClassifier.js";
import { buildFocusAreas } from "./focusAreaBuilder.js";
import { computeExactTargetMap, attachExactTargets } from "./splitTargetCalculator.js";
import { analyseMuscleGroups } from "./muscleGroupAnalyser.js";
import { selectAnalysisFrame } from "./analysisFrameSelector.js";
import { getBenchmarkStats } from "./benchmarkService.js";

function markSegmentRoles(segments, limiter, strength) {
  return segments.map((segment) => ({
    ...segment,
    isBiggestLimiter: segment.segmentKey === limiter?.segmentKey,
    isBiggestStrength: segment.segmentKey === strength?.segmentKey,
  }));
}

function stationBreakdown(segments, { gapField = "frameGapSeconds" } = {}) {
  return segments
    .filter((segment) => segment.type === "station" && Number.isFinite(segment.percentile))
    .sort((a, b) => (b[gapField] ?? 0) - (a[gapField] ?? 0))
    .map((segment) => ({
      segmentKey: segment.segmentKey,
      label: segment.label,
      percentile: segment.percentile,
      fieldPercentile: segment.fieldPercentile ?? null,
      timeGapSeconds: Math.round(segment[gapField] ?? 0),
      confidence: segment.confidence,
      nextBandMedianSeconds: segment.nextBandMedianSeconds ?? null,
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

function roundedTopPercent(percentile) {
  if (!Number.isFinite(Number(percentile))) return null;
  const top = Math.max(1, Math.round(100 - Number(percentile)));
  return top;
}

function comparisonOption({ id, label, groupKey, sampleSize, userSeconds, stats }) {
  if (!groupKey || !stats || !Number.isFinite(userSeconds)) return null;
  const percentile = approximatePercentile(userSeconds, stats);
  if (!Number.isFinite(Number(percentile))) return null;
  return {
    id,
    label,
    groupKey,
    percentile,
    topPercent: roundedTopPercent(percentile),
    sampleSize: Number(sampleSize ?? stats.sampleSize ?? 0),
  };
}

function buildBenchmarkComparisonOptions(normalised, benchmarkContext) {
  const userSeconds = normalised.race?.finishTimeSeconds;
  if (!Number.isFinite(userSeconds)) return null;
  const options = [];
  const seen = new Set();
  const push = (option) => {
    if (!option || seen.has(option.groupKey)) return;
    seen.add(option.groupKey);
    options.push(option);
  };

  const total = benchmarkContext.totalPopulationBenchmark;
  push(comparisonOption({
    id: "global",
    label: "Global",
    groupKey: total?.groupKey ?? benchmarkContext.primaryBenchmarkGroup?.key,
    sampleSize: total?.sampleSize ?? benchmarkContext.primaryBenchmarkGroup?.sampleSize,
    userSeconds,
    stats: getBenchmarkStats(total?.groupKey ?? benchmarkContext.primaryBenchmarkGroup?.key, "total_time"),
  }));

  const regional = benchmarkContext.regionalBenchmark;
  push(comparisonOption({
    id: "regional",
    label: regional?.regionLabel ? regional.regionLabel : "Regional",
    groupKey: regional?.groupKey,
    sampleSize: regional?.sampleSize,
    userSeconds,
    stats: getBenchmarkStats(regional?.groupKey, "total_time"),
  }));

  const age = benchmarkContext.ageBenchmark;
  push(comparisonOption({
    id: "age_group",
    label: age?.ageGroup ? `Age group ${age.ageGroup}` : "Age group",
    groupKey: age?.groupKey,
    sampleSize: age?.sampleSize,
    userSeconds,
    stats: getBenchmarkStats(age?.groupKey, "total_time"),
  }));

  if (options.length === 0) return null;
  return {
    defaultId: "global",
    options,
  };
}

function dataQuality(normalised, benchmarkContext) {
  // Inferred-total RoxZone is not missing data — only count the 16 race splits as required.
  const isExplicitRoxzone = normalised.roxzoneMode === "explicit_splits";
  const raceSplitsSupplied = normalised.completeness.runSplits + normalised.completeness.stationSplits;
  const expected = isExplicitRoxzone ? normalised.completeness.totalExpectedSplits : 16;
  const supplied = isExplicitRoxzone
    ? raceSplitsSupplied + normalised.completeness.roxzoneSplits
    : raceSplitsSupplied;
  const issues = [];
  const warnings = [];
  if (!benchmarkContext.available) issues.push("no_benchmark_data");
  if (!Number.isFinite(normalised.race?.finishTimeSeconds)) issues.push("missing_finish_time");
  if (normalised.roxzoneMode === "inferred_total") warnings.push("roxzone_inferred_from_unallocated_time");
  if (supplied < expected) warnings.push("partial_split_data");
  if (normalised.completeness.runSplits > 0 && normalised.completeness.runSplits < 8) warnings.push("incomplete_running_splits");
  if (normalised.completeness.runSplits > 0 && !Number.isFinite(normalised.runTimeSeconds)) warnings.push("missing_run_total");
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
  if (division && !isIndividualAnalysisDivision(division)) return "limited";
  if (!benchmarkContext.available) return "no_benchmark_data";
  const supplied = normalised.completeness.runSplits + normalised.completeness.stationSplits;
  if (supplied < 8) return "limited";
  if (supplied < 16) return "partial";
  return "full";
}

function attachNextBandStats(segments, nextBandGroupKey) {
  if (!nextBandGroupKey) return segments;
  return segments.map((segment) => {
    const stats = getBenchmarkStats(nextBandGroupKey, segment.segmentKey);
    const median = stats?.medianSeconds ?? stats?.p50Seconds ?? null;
    return {
      ...segment,
      nextBandMedianSeconds: median,
      timeGapToNextBandMedianSeconds:
        Number.isFinite(median) && Number.isFinite(segment.userSeconds)
          ? segment.userSeconds - median
          : null,
    };
  });
}

function addFrameGaps(segments, analysisFrame, calculatorMode) {
  const isAnalyse = calculatorMode === "analyse";
  const frame = analysisFrame?.frame;
  const isNextBandFrame = frame === "next_band" || frame === "next_band_stretch";
  const useNextBandGaps = isNextBandFrame || Boolean(analysisFrame?.useNextBandGaps);

  return segments.map((segment) => {
    let frameGapSeconds;
    if (!isAnalyse) {
      frameGapSeconds = segment.timeGapToExactTargetSeconds ?? segment.timeGapToMedianSeconds ?? null;
    } else if (useNextBandGaps) {
      frameGapSeconds = segment.timeGapToNextBandMedianSeconds ?? segment.timeGapToMedianSeconds ?? null;
    } else {
      frameGapSeconds = segment.timeGapToMedianSeconds ?? null;
    }
    return { ...segment, frameGapSeconds };
  });
}

export function analyseSubmission(input = {}) {
  const calculatorMode = input.calculatorMode ?? "target";
  const normalised = normaliseSubmission(input);
  const benchmarkContext = selectBenchmarkGroups(normalised, {
    calculatorMode,
  });
  const scope = analysisScope(input, normalised, benchmarkContext);

  const rawSegments = benchmarkContext.available ? calculateSegmentStats(normalised, benchmarkContext) : [];
  const targetFinishSeconds = input.athleteContext?.targetFinishTimeSeconds ?? null;
  const exactTargetMap = computeExactTargetMap(
    rawSegments,
    targetFinishSeconds,
    Boolean(benchmarkContext.goalBenchmarkGroup),
  );
  const baseSegments = attachExactTargets(rawSegments, exactTargetMap);
  const totalTimeSeg = rawSegments.find((segment) => segment.segmentKey === "total_time");
  const analysisFrame = selectAnalysisFrame({
    achievedBand: benchmarkContext.achievedBand ?? null,
    nextBand: benchmarkContext.nextBand ?? null,
    gapToBandMedianSeconds: totalTimeSeg?.timeGapToMedianSeconds ?? null,
  });
  const needsNextBandStats = analysisFrame.frame === "next_band" || analysisFrame.frame === "next_band_stretch" || Boolean(analysisFrame.useNextBandGaps);
  const segmentsWithNextBand = needsNextBandStats
    ? attachNextBandStats(baseSegments, benchmarkContext.nextBandGroup?.key ?? null)
    : baseSegments;
  const framedSegments = addFrameGaps(segmentsWithNextBand, analysisFrame, calculatorMode);
  const runFadeAnalysis = analyseRunFade(normalised, benchmarkContext);
  const roxzoneAnalysis = analyseRoxzone(normalised, benchmarkContext);
  const scores = calculateScores(framedSegments, normalised, runFadeAnalysis);
  const limiter = findBiggestLimiter(framedSegments);
  const strength = findBiggestStrength(framedSegments);
  const segments = markSegmentRoles(framedSegments, limiter, strength);
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
  const muscleBenchmarkContext = calculatorMode === "target"
    ? selectBenchmarkGroups(normalised, { calculatorMode: "analyse" })
    : benchmarkContext;
  const muscleSegments = calculatorMode === "target" && muscleBenchmarkContext?.available
    ? calculateSegmentStats(normalised, muscleBenchmarkContext)
    : segments;
  const muscleStationBreakdown = stationBreakdown(muscleSegments, { gapField: "timeGapToMedianSeconds" });
  const muscleGroupProfile = analyseMuscleGroups({
    stationBreakdown: muscleStationBreakdown,
    analysisScope: scope,
  });
  const comparisonOptions = buildBenchmarkComparisonOptions(normalised, benchmarkContext);

  return {
    submissionId: input.submissionId ?? null,
    analysisVersion: HYROX_ANALYSIS_VERSION,
    analysisScope: scope,
    calculatorMode,
    athlete: normalised.athlete,
    race: normalised.race,
    dataQuality: dataQuality(normalised, benchmarkContext),
    benchmarkContext: {
      primaryBenchmarkGroup: benchmarkContext.primaryBenchmarkGroup,
      fallbacksUsed: benchmarkContext.fallbacksUsed,
      goalBenchmarkGroup: benchmarkContext.goalBenchmarkGroup
        ? { ...benchmarkContext.goalBenchmarkGroup, targetFinishSeconds: targetFinishSeconds ?? null }
        : null,
      achievedBand: benchmarkContext.achievedBand ?? null,
      nextBand: benchmarkContext.nextBand ?? null,
      nextBandGroup: benchmarkContext.nextBandGroup ?? null,
      confidenceLabel: benchmarkContext.confidenceLabel ?? null,
      demographicBenchmarkGroup: benchmarkContext.demographicBenchmarkGroup ?? null,
      doublesBenchmarkedAsSingles: benchmarkContext.doublesBenchmarkedAsSingles ?? false,
      useDoublesBenchmarks: benchmarkContext.useDoublesBenchmarks ?? false,
      ageBenchmark: benchmarkContext.ageBenchmark ?? { available: false },
      regionalBenchmark: benchmarkContext.regionalBenchmark ?? { available: false },
      totalPopulationBenchmark: benchmarkContext.totalPopulationBenchmark ?? { available: false },
      comparisonOptions,
      analysisFrame,
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
        timeAdvantageSeconds: strength.timeAdvantageSeconds,
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
    muscleGroupProfile,
  };
}
