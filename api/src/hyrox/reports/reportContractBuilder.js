import { formatGain, formatPerformancePercentile, formatTime } from "./copyFormatter.js";
import { comparisonProfileLabel, performanceBandLabel } from "./comparisonProfileLabel.js";
import { benchmarkConfidenceQualifier, comparisonOptionsArray } from "./comparisonOptions.js";
import { buildHyroxReportNarrative } from "./reportNarrativeModel.js";
import { hasGoalGroup } from "./comparisonBasis.js";
import { resolveReportStrength, reportStrengthGapSeconds } from "./reportSelections.js";
import { roxzoneActionability } from "./roxzoneActionability.js";
import { displaySegmentLabel, segmentSubject, segmentVerb } from "./segmentDisplay.js";
import { buildSplitDisplayRows, formatSplitDelta, formatSplitSeconds } from "./splitRowDisplayContract.js";
import { isDoublesAnalysisDivision } from "../config/divisionGroups.js";

const VERSION = 1;

const RANK_FORBIDDEN_TERMS = Object.freeze([
  "TOP",
  "BOTTOM",
  "WORLDWIDE",
  "%",
  "percentile",
]);

function segment(analysisJson = {}, key) {
  return (analysisJson.segments ?? []).find((row) => row?.segmentKey === key) ?? null;
}

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function displayDelta(seconds) {
  if (!Number.isFinite(Number(seconds))) return null;
  return formatSplitDelta(Math.round(Number(seconds)));
}

function displayDuration(seconds) {
  return formatSplitSeconds(Math.abs(Number(seconds)));
}

function targetStatus(gapSeconds) {
  if (!Number.isFinite(Number(gapSeconds))) return "unknown";
  if (gapSeconds < 0) return "ahead";
  if (gapSeconds > 0) return "behind";
  return "on_target";
}

function targetTone(status, gapSeconds) {
  if (status === "ahead") return "green";
  if (status === "on_target") return "neutral";
  if (status !== "behind") return "neutral";
  const seconds = Math.abs(Number(gapSeconds));
  return seconds >= 360 ? "red" : "amber";
}

function gapMagnitude(gapSeconds) {
  if (!Number.isFinite(Number(gapSeconds))) return "unknown";
  const abs = Math.abs(Number(gapSeconds));
  if (abs <= 60) return "tiny";
  if (abs <= 180) return "small";
  if (abs <= 360) return "moderate";
  return "large";
}

function selectedTargetSeconds(analysisJson = {}, athleteContext = {}) {
  const total = segment(analysisJson, "total_time");
  return positiveNumber(
    analysisJson.benchmarkContext?.goalBenchmarkGroup?.targetFinishSeconds,
    total?.exactTargetSeconds,
    analysisJson.race?.targetTimeSeconds,
    analysisJson.race?.targetFinishTimeSeconds,
    athleteContext.targetFinishTimeSeconds,
    athleteContext.targetTimeSeconds,
  );
}

function hasWarning(warnings, ...needles) {
  return warnings.some((warning) => needles.includes(String(warning)));
}

function hasPattern(warnings, pattern) {
  return warnings.some((warning) => pattern.test(String(warning)));
}

function dataQualityPolicy(analysisJson = {}) {
  const warnings = Array.isArray(analysisJson.dataQuality?.warnings) ? analysisJson.dataQuality.warnings : [];
  const issues = Array.isArray(analysisJson.dataQuality?.issues) ? analysisJson.dataQuality.issues : [];
  const completeness = Number(analysisJson.dataQuality?.inputCompleteness);
  const noBenchmark = analysisJson.analysisScope === "no_benchmark_data" || issues.includes("no_benchmark_data");
  const partialSplitData = hasWarning(warnings, "partial_split_data") || (Number.isFinite(completeness) && completeness < 1);
  const missingRunData = hasWarning(warnings, "missing_run_data", "missing_running_data", "missing_run_total", "incomplete_running_splits");
  const missingStationData = hasWarning(warnings, "missing_station_data");
  const inferredRoxzone = hasWarning(warnings, "roxzone_inferred_from_unallocated_time") || analysisJson.roxzoneAnalysis?.mode === "inferred_total";
  const estimatedSplit = hasWarning(warnings, "split_estimated_from_residual")
    || (Array.isArray(analysisJson.dataQuality?.estimatedSplitKeys) && analysisJson.dataQuality.estimatedSplitKeys.length > 0);
  const anomaly = hasPattern([...warnings, ...issues], /anomal|unreconciled|impossible|inconsistent/i);
  const directional = noBenchmark || partialSplitData || missingRunData || missingStationData || inferredRoxzone || estimatedSplit;
  const suppressed = anomaly;
  const caveats = [];

  if (noBenchmark) caveats.push("Benchmark data is unavailable, so this summary is directional.");
  if (partialSplitData) caveats.push("Some run or station split data is missing, so this summary is directional.");
  if (missingRunData) caveats.push("Running split data is incomplete, so run-specific claims are directional.");
  if (missingStationData) caveats.push("Station split data is incomplete, so station-specific claims are directional.");
  if (inferredRoxzone) caveats.push("RoxZone time is estimated from unallocated race time, so transition claims are directional.");
  if (estimatedSplit) caveats.push("One or more split values were estimated from residual time.");
  if (anomaly) caveats.push("One or more split values look unusual, so check the race splits before treating this as firm.");

  const confidence = suppressed ? "low" : directional ? "directional" : "high";

  return {
    confidence,
    warnings,
    issues,
    noBenchmark,
    partialSplitData,
    missingRunData,
    missingStationData,
    inferredRoxzone,
    estimatedSplit,
    anomaly,
    caveatRequired: directional || suppressed,
    compactCaveat: suppressed ? "Directional analysis" : directional ? "Directional" : null,
    longCaveat: caveats.join(" ") || null,
    suppressions: [
      ...(noBenchmark ? ["rank_claims"] : []),
      ...(missingRunData ? ["firm_run_claims"] : []),
      ...(missingStationData ? ["firm_station_claims"] : []),
      ...(inferredRoxzone ? ["firm_roxzone_claims"] : []),
      ...(suppressed ? ["firm_primary_claims"] : []),
    ],
  };
}

function explicitRankDisplays(analysisJson = {}, athleteContext = {}, policy) {
  const benchmarkContext = analysisJson.benchmarkContext ?? {};
  const total = segment(analysisJson, "total_time");
  const comparisonLabel = comparisonProfileLabel(analysisJson);
  const options = comparisonOptionsArray(benchmarkContext);
  const qualifier = benchmarkConfidenceQualifier(benchmarkContext);
  const displays = [];
  const pushDisplay = ({ id, label, basisLabel, source, percentile }) => {
    const value = Number(percentile);
    if (!Number.isFinite(value) || !basisLabel) return;
    const rankLabel = label ?? formatPerformancePercentile(value);
    displays.push({ id, label: rankLabel, basisLabel, source, percentile: value, qualifier });
  };

  for (const option of options) {
    const value = Number(option.percentile);
    if (!Number.isFinite(value)) continue;
    pushDisplay({
      id: option.id ?? "comparison",
      label: value >= 60
        ? `TOP ${Math.max(1, Math.round(option.topPercent ?? 100 - value))}% WORLDWIDE`
        : `${formatPerformancePercentile(value, { uppercase: true })} WORLDWIDE`,
      basisLabel: option.label ?? comparisonLabel,
      source: "comparison_option",
      percentile: value,
    });
  }

  if (displays.length === 0) {
    pushDisplay({
      id: "overall",
      basisLabel: comparisonLabel,
      source: Number.isFinite(Number(total?.fieldPercentile)) ? "field_percentile"
        : Number.isFinite(Number(total?.percentile)) ? "segment_percentile"
          : "athlete_context",
      percentile: total?.fieldPercentile ?? total?.percentile ?? athleteContext.overallPercentile,
    });
  }

  const allowed = !policy.noBenchmark
    && !policy.anomaly
    && analysisJson.analysisScope !== "no_benchmark_data"
    && displays.length > 0
    && displays.every((display) => display.basisLabel);

  return {
    allowed,
    reason: allowed
      ? "explicit_percentile_with_basis"
      : policy.noBenchmark ? "no_benchmark_data"
        : policy.anomaly ? "data_quality"
          : displays.length === 0 ? "missing_percentile"
            : "missing_basis",
    displays: allowed ? displays : [],
    forbiddenTerms: allowed ? [] : [...RANK_FORBIDDEN_TERMS],
    basisRequired: true,
  };
}

function claimFromOpportunity(opportunity = null, { headlineMode, policy } = {}) {
  if (!opportunity) return null;
  const normalizedLabel = opportunity.normalizedLabel ?? opportunity.displayLabel ?? opportunity.label ?? null;
  const suppressed = policy.anomaly;
  const directional = policy.noBenchmark
    || policy.partialSplitData
    || policy.estimatedSplit
    || (policy.missingRunData && opportunity.type === "run")
    || (policy.missingStationData && opportunity.type === "station")
    || (policy.inferredRoxzone && opportunity.segmentKey === "roxzone_time");
  const claimStrength = suppressed ? "suppressed" : directional ? "directional" : "firm";
  const compactLabel = headlineMode === "penalty_first"
    ? "FASTEST CONTROLLABLE WIN"
    : claimStrength === "firm"
      ? "BIGGEST LIMITER"
      : claimStrength === "directional"
        ? "DIRECTIONAL OPPORTUNITY"
        : "INSUFFICIENT SPLIT CONFIDENCE";

  return {
    label: opportunity.displayLabel ?? opportunity.label ?? normalizedLabel,
    normalizedLabel,
    segmentKey: opportunity.segmentKey ?? null,
    type: opportunity.type ?? null,
    role: headlineMode === "penalty_first" ? "fastest_controllable_win" : "primary_opportunity",
    gainSeconds: Number.isFinite(Number(opportunity.timeGapSeconds)) ? Number(opportunity.timeGapSeconds) : null,
    timeGapSeconds: Number.isFinite(Number(opportunity.timeGapSeconds)) ? Number(opportunity.timeGapSeconds) : null,
    displayGain: Number.isFinite(Number(opportunity.timeGapSeconds)) ? formatGain(opportunity.timeGapSeconds) : null,
    claimStrength,
    compactLabel,
    longLabel: claimStrength === "firm" ? "Biggest opportunity" : compactLabel,
    reason: policy.longCaveat,
    isPenalty: Boolean(opportunity.isPenalty),
    isDirectional: claimStrength !== "firm",
  };
}

function runCoachingMeaning(opportunity = null) {
  const label = String(opportunity?.normalizedLabel ?? opportunity?.displayLabel ?? opportunity?.label ?? "");
  const key = String(opportunity?.segmentKey ?? "").toLowerCase();
  const match = key.match(/^run_([1-8])$/) ?? label.match(/^run\s*([1-8])$/i);
  if (!match) return null;
  const runIndex = Number(match[1]);
  if (runIndex === 1) return "sustainable opening pace control";
  if (runIndex >= 6) return "race-fatigued running durability";
  return "mid-race aerobic durability";
}

function categoryCoachingLabel(opportunity = null) {
  if (opportunity?.segmentKey === "run_time") return "Running";
  if (opportunity?.segmentKey === "work_time") return "Stations";
  return opportunity?.normalizedLabel ?? opportunity?.displayLabel ?? opportunity?.label ?? null;
}

function buildSecondaryCoaching(narrative = {}) {
  const unique = [];
  const push = (item) => {
    if (!item?.normalizedLabel) return;
    if (unique.some((existing) => existing.normalizedLabel === item.normalizedLabel)) return;
    unique.push(item);
  };

  push(narrative.largestFitnessLimiter);
  push(narrative.secondaryOpportunity);

  const categoryLeader = narrative.largestCategoryGap ?? null;
  const segmentLeader = narrative.largestFitnessLimiter ?? narrative.largestSegmentGap ?? null;
  const categoryLabel = categoryCoachingLabel(categoryLeader);
  const segmentLabel = segmentLeader?.normalizedLabel ?? null;
  const bridgeRequired = Boolean(categoryLabel && segmentLabel && categoryLabel !== segmentLabel);
  const segmentMeaning = runCoachingMeaning(segmentLeader);
  const routeSummarySentence = segmentLabel
    ? bridgeRequired
      ? `${categoryLabel} is the larger category gap, but ${segmentLabel} is the concrete training route${segmentMeaning ? ` (${segmentMeaning})` : ""}.`
      : `${segmentLabel} is the concrete training route${segmentMeaning ? ` (${segmentMeaning})` : ""}.`
    : null;

  return {
    categoryLeader,
    categoryLeaderGapSeconds: categoryLeader?.timeGapSeconds ?? null,
    segmentLeader,
    segmentLeaderGapSeconds: segmentLeader?.timeGapSeconds ?? null,
    largestFitnessLimiter: narrative.largestFitnessLimiter ?? null,
    fastestControllableWin: narrative.fastestControllableWin ?? null,
    orderedTrainingRoute: unique,
    routeSummarySentence,
    routeBulletClaims: unique.map((item) => ({
      label: item.normalizedLabel,
      segmentKey: item.segmentKey ?? null,
      type: item.type ?? null,
      timeGapSeconds: item.timeGapSeconds ?? null,
      coachingMeaning: runCoachingMeaning(item),
    })),
    penaltyAdjustedCategoryGaps: {
      categoryLeader,
    },
    penaltyAdjustedSegmentGaps: unique,
    dataQualityPolicy: narrative.dataQuality,
  };
}

function inputFacts(analysisJson = {}, athleteContext = {}, calculatorMode = "target") {
  const finishTimeSeconds = finiteNumber(segment(analysisJson, "total_time")?.userSeconds, analysisJson.race?.finishTimeSeconds, athleteContext.finishTimeSeconds);
  const targetTimeSeconds = selectedTargetSeconds(analysisJson, athleteContext);
  const exactTargetGapSeconds = Number.isFinite(finishTimeSeconds) && Number.isFinite(targetTimeSeconds)
    ? Math.round(finishTimeSeconds - targetTimeSeconds)
    : null;
  const benchmarkAvailable = analysisJson.analysisScope !== "no_benchmark_data"
    && Boolean(analysisJson.benchmarkContext?.primaryBenchmarkGroup || analysisJson.benchmarkContext?.goalBenchmarkGroup);
  const isDoubles = [
    analysisJson.athlete?.division,
    analysisJson.race?.division,
    analysisJson.division,
    athleteContext.division,
    analysisJson.benchmarkContext?.division,
    analysisJson.benchmarkContext?.primaryBenchmarkGroup?.division,
    analysisJson.benchmarkContext?.goalBenchmarkGroup?.division,
  ].some(isDoublesAnalysisDivision);

  return {
    calculatorMode,
    mode: calculatorMode,
    finishTimeSeconds,
    finishTimeDisplay: Number.isFinite(finishTimeSeconds) ? formatTime(finishTimeSeconds) : null,
    targetTimeSeconds,
    targetTimeDisplay: Number.isFinite(targetTimeSeconds) ? formatTime(targetTimeSeconds) : null,
    exactTargetGapSeconds,
    exactTargetGapDisplay: Number.isFinite(exactTargetGapSeconds) ? displayDuration(exactTargetGapSeconds) : null,
    exactTargetGapSigned: Number.isFinite(exactTargetGapSeconds) ? displayDelta(exactTargetGapSeconds) : null,
    analysisScope: analysisJson.analysisScope ?? null,
    benchmarkAvailable,
    isDoubles,
    teamContext: {
      isDoubles,
      combinedTimeCaveat: isDoubles ? "This is your combined team time; official HYROX data does not split individual partner contribution." : null,
      opportunityOwner: isDoubles ? "your team's" : "your",
    },
    benchmarkGroupLabel: analysisJson.benchmarkContext?.primaryBenchmarkGroup?.label ?? null,
    goalBenchmarkGroupLabel: analysisJson.benchmarkContext?.goalBenchmarkGroup?.label ?? null,
  };
}

function buildComparisonFrame(analysisJson = {}, rankPolicy) {
  const basis = comparisonProfileLabel(analysisJson);
  const achievedBand = analysisJson.benchmarkContext?.achievedBand ?? analysisJson.benchmarkContext?.analysisFrame?.achievedBand ?? null;
  const comparisonBand = analysisJson.benchmarkContext?.analysisFrame?.comparisonBand
    ?? analysisJson.benchmarkContext?.nextBand
    ?? analysisJson.benchmarkContext?.goalBenchmarkGroup?.label
    ?? null;
  return {
    basisLabel: basis,
    displayLabel: basis,
    achievedBand,
    comparisonBand,
    rankAvailable: rankPolicy.allowed,
    percentileAvailable: rankPolicy.displays.length > 0,
    rankDisplays: rankPolicy.displays,
  };
}

function buildTargetAssessment(facts, analysisJson = {}, primaryClaim = null) {
  const status = targetStatus(facts.exactTargetGapSeconds);
  const magnitude = gapMagnitude(facts.exactTargetGapSeconds);
  const hasExactTarget = Number.isFinite(facts.targetTimeSeconds) && Number.isFinite(facts.exactTargetGapSeconds);
  const primaryIsRoxzone = primaryClaim?.segmentKey === "roxzone_time" || /\broxzone\b/i.test(String(primaryClaim?.label ?? ""));
  const primaryIsPenalty = primaryClaim?.isPenalty;
  const isTargetMode = facts.calculatorMode === "target" || hasExactTarget;
  const highPerformer = (() => {
    const finish = Number(analysisJson.race?.finishTimeSeconds);
    const total = segment(analysisJson, "total_time");
    const achievedBand = String(analysisJson.benchmarkContext?.achievedBand ?? analysisJson.benchmarkContext?.analysisFrame?.comparisonBand ?? "");
    return (Number.isFinite(finish) && finish <= 3600)
      || achievedBand === "sub_60"
      || Number(total?.percentile) >= 90
      || analysisJson.athleteArchetype?.key === "high_performer";
  })();

  const feasibilityLabel = !hasExactTarget
    ? null
    : status === "ahead" ? "ahead of target"
      : status === "on_target" ? "on target"
        : highPerformer && Number(facts.targetTimeSeconds) <= 3300 ? "elite stretch"
        : magnitude === "tiny" ? "very close"
          : magnitude === "small" ? "realistic with focused execution"
            : magnitude === "moderate" ? "meaningful stretch"
              : "aggressive stretch";

  const ctaHeadline = (() => {
    if (primaryIsPenalty) return "FIX THE FASTEST WIN";
    if (primaryIsRoxzone) return "TIGHTEN YOUR RACE FLOW";
    if (isTargetMode && status === "behind" && (magnitude === "moderate" || magnitude === "large")) return "FIND YOUR TARGET ROUTE";
    if (isTargetMode && status === "behind") return "FIND YOUR BOTTLENECK";
    if (isTargetMode && status === "ahead") return "PROTECT YOUR TARGET EDGE";
    if (highPerformer) return "FIND YOUR NEXT MARGINAL GAIN";
    return "FIND YOUR BOTTLENECK";
  })();

  return {
    hasExactTarget,
    targetTimeSeconds: facts.targetTimeSeconds,
    targetTimeDisplay: facts.targetTimeDisplay,
    exactGapSeconds: facts.exactTargetGapSeconds,
    displayGap: facts.exactTargetGapDisplay,
    signedDisplayGap: facts.exactTargetGapSigned,
    status,
    tone: targetTone(status, facts.exactTargetGapSeconds),
    gapMagnitude: magnitude,
    feasibilityLabel,
    routeType: primaryIsPenalty ? "execution_first" : primaryIsRoxzone ? "flow_first" : status === "behind" ? "target_gap_route" : "performance_refinement",
    ctaHeadline,
    ctaReason: hasExactTarget
      ? `${status}_${magnitude}_target_gap`
      : highPerformer ? "high_performer_without_exact_target" : "standard_bottleneck",
  };
}

function categoryGap(analysisJson = {}, key) {
  const row = segment(analysisJson, key);
  return finiteNumber(
    row?.frameGapNetOfPenaltySeconds,
    row?.frameGapSeconds,
    row?.timeGapToExactTargetSecondsNetOfPenalty,
    row?.timeGapToExactTargetSeconds,
    hasGoalGroup(analysisJson) && Number.isFinite(row?.goalBenchmarkSeconds) && Number.isFinite(row?.userSeconds)
      ? row.userSeconds - row.goalBenchmarkSeconds
      : null,
    row?.timeGapToMedianSecondsNetOfPenalty,
    row?.timeGapToMedianSeconds,
  );
}

function categoryName(key) {
  if (key === "run_time") return "Running";
  if (key === "work_time") return "Stations";
  if (key === "roxzone_time") return "RoxZone";
  if (key === "penalties") return "Penalties";
  return key;
}

function comparisonRangeLabel(label) {
  const raw = String(label ?? "").trim().toUpperCase();
  const rangeMatch = raw.match(/^SUB\s+(\d+)-(\d+)\s+MEDIAN$/);
  if (rangeMatch) {
    const lower = Number(rangeMatch[1]);
    const upper = Number(rangeMatch[2]);
    if (Number.isFinite(lower) && Number.isFinite(upper)) {
      return `${lower}:00–${upper - 1}:59`;
    }
  }
  const subMatch = raw.match(/^SUB\s+(\d+)\s+MEDIAN$/);
  if (subMatch) return `under ${Number(subMatch[1])}:00`;
  return null;
}

function bandFromGroup(group) {
  if (!group) return null;
  if (group.performanceBand) return group.performanceBand;
  const keyMatch = String(group.key ?? "").match(/(?:^|:)band:([^:]+)/);
  return keyMatch?.[1] ?? null;
}

function comparisonMedianRange(analysisJson = {}) {
  const benchmarkContext = analysisJson.benchmarkContext ?? {};
  const band = benchmarkContext.analysisFrame?.comparisonBand
    ?? bandFromGroup(benchmarkContext.escalationBasisBandGroup)
    ?? bandFromGroup(benchmarkContext.primaryBenchmarkGroup);
  const bandLabel = performanceBandLabel(band);
  const bandRange = bandLabel ? comparisonRangeLabel(`${bandLabel} MEDIAN`) : null;
  return bandRange ?? comparisonRangeLabel(comparisonProfileLabel(analysisJson));
}

function totalGapLensSuffix(analysisJson = {}) {
  const mode = analysisJson.calculatorMode;
  if (mode === "target") {
    return " lower than your target finish time";
  }
  const range = comparisonMedianRange(analysisJson);
  if (range) return ` lower than the median for ${range} finishers`;
  return " lower than the comparison median";
}

function buildGapReconciliation(analysisJson = {}, primaryClaim = null) {
  const totalGapSeconds = categoryGap(analysisJson, "total_time");
  const runningGapSeconds = categoryGap(analysisJson, "run_time");
  const stationGapSeconds = categoryGap(analysisJson, "work_time");
  const roxzoneGapSeconds = categoryGap(analysisJson, "roxzone_time");
  const penaltyGapSeconds = (Array.isArray(analysisJson.penalties) ? analysisJson.penalties : [])
    .reduce((sum, penalty) => sum + (Number(penalty?.penaltySeconds) || 0), 0);
  const candidates = [
    ["work_time", stationGapSeconds],
    ["run_time", runningGapSeconds],
    ["roxzone_time", roxzoneGapSeconds],
    ...(penaltyGapSeconds > 0 ? [["penalties", penaltyGapSeconds]] : []),
  ].filter(([, value]) => Number.isFinite(value));
  const largest = [...candidates].sort((a, b) => Number(b[1]) - Number(a[1]))[0] ?? null;
  const positiveSum = candidates.reduce((sum, [, value]) => sum + Math.max(0, Number(value)), 0);
  const offsets = candidates.filter(([, value]) => Number(value) < -5).map(([key, value]) => ({ key, label: categoryName(key), seconds: Number(value), display: displayDelta(value) }));
  const requiresOffsetWording = Boolean(
    Number.isFinite(totalGapSeconds)
      && largest
      && Number(largest[1]) > Number(totalGapSeconds) + 5
      && (offsets.length > 0 || positiveSum > Number(totalGapSeconds) + 30)
  );
  const largestCategory = largest ? { key: largest[0], label: categoryName(largest[0]), gapSeconds: Number(largest[1]), displayGap: displayDelta(largest[1]) } : null;
  const primaryLabel = primaryClaim?.label ?? primaryClaim?.normalizedLabel ?? null;
  const totalDisplay = Number.isFinite(totalGapSeconds) ? displayDelta(totalGapSeconds) : null;
  const lensSuffix = totalGapLensSuffix(analysisJson);
  const summarySentence = (() => {
    if (!largestCategory || !totalDisplay || !Number.isFinite(totalGapSeconds) || Number(totalGapSeconds) <= 0) return null;
    const verb = largestCategory.label === "Running" || largestCategory.label === "RoxZone" ? "is" : "are";
    if (requiresOffsetWording) {
      const offsetText = offsets.length
        ? offsets.map((item) => item.label).join(" and ")
        : "other categories";
      const offsetVerb = offsets.length === 1 ? "reduces" : "reduce";
      const roxClause = Number(roxzoneGapSeconds) >= 30
        ? ` RoxZone transitions add another ${displayDelta(roxzoneGapSeconds)}.`
        : "";
      if (largestCategory.key === "work_time" && offsets.some((item) => item.key === "run_time")) {
        return `Station performance is the largest category gap at ${largestCategory.displayGap}. Running is ahead of the comparison, which offsets a large part of that.${roxClause} Even accounting for that offset, the total gap is ${totalDisplay}${lensSuffix}.`;
      }
      if (largestCategory.key === "run_time" && offsets.some((item) => item.key === "work_time")) {
        return `Running is the largest positive gap at ${largestCategory.displayGap}. Station time is already ahead of the comparison, which offsets a large part of that.${roxClause} Even accounting for that offset, the total gap is ${totalDisplay}${lensSuffix}.`;
      }
      return `${largestCategory.label} ${verb} the largest positive gap at ${largestCategory.displayGap}, but ${offsetText} ${offsetVerb} the total race gap to ${totalDisplay}.`;
    }
    if (largestCategory.key === "run_time" && Number(stationGapSeconds) < -5) {
      return `Running is the largest category gap at ${largestCategory.displayGap}, for a total race gap of ${totalDisplay}. Station time is already ahead of the comparison.`;
    }
    if (largestCategory.key === "work_time" && Number(runningGapSeconds) < -5) {
      return `Stations are the largest category gap at ${largestCategory.displayGap}, for a total race gap of ${totalDisplay}. Running is already ahead of the comparison.`;
    }
    if (largestCategory.key === "work_time") {
      return `Station performance is the largest category gap at ${largestCategory.displayGap}, for a total race gap of ${totalDisplay}.`;
    }
    return `${largestCategory.label} ${verb} the largest category gap at ${largestCategory.displayGap}, for a total race gap of ${totalDisplay}.`;
  })();

  return {
    totalGapSeconds,
    runningGapSeconds,
    stationGapSeconds,
    roxzoneGapSeconds,
    penaltyGapSeconds,
    largestCategory,
    largestCategoryGapSeconds: largestCategory?.gapSeconds ?? null,
    largestSegment: primaryLabel ? { label: primaryLabel, gapSeconds: primaryClaim?.gainSeconds ?? null } : null,
    largestSegmentGapSeconds: primaryClaim?.gainSeconds ?? null,
    offsetCategories: offsets,
    offsetSeconds: Number.isFinite(totalGapSeconds) ? Math.max(0, positiveSum - Math.max(0, totalGapSeconds)) : null,
    requiresOffsetWording,
    summarySentence,
    artifactSentences: {
      email: summarySentence,
      raceCard: summarySentence,
      carousel: summarySentence,
    },
  };
}

function toContractSplitRow(row, policy) {
  return {
    segmentKey: row.key,
    key: row.key,
    label: row.label,
    type: row.type,
    raceOrder: row.raceOrder,
    athleteSeconds: row.displayTimeSeconds,
    rawAthleteSeconds: row.rawTimeSeconds,
    comparisonSeconds: row.comparisonTimeSeconds,
    rawGapSeconds: row.rawGapSeconds,
    gapSeconds: row.displayGapSeconds,
    adjustedGapSeconds: row.adjustedGapSeconds,
    displayGap: row.displayGapFormatted,
    displayGapSeconds: row.displayGapSeconds,
    displayGapFormatted: row.displayGapFormatted,
    displayGapTone: row.displayGapTone,
    rawTimeFormatted: row.rawTimeFormatted,
    displayTimeFormatted: row.displayTimeFormatted,
    comparisonTimeFormatted: row.comparisonTimeFormatted,
    userTime: row.userTime,
    rawUserTime: row.rawUserTime,
    delta: row.delta,
    tone: row.tone,
    isReliable: !policy.caveatRequired,
    isEstimated: policy.estimatedSplit,
    isPenaltyAdjusted: row.isPenaltyAdjusted,
    penaltyAdjustmentSeconds: row.penaltyAdjustmentSeconds,
    penaltyAdjustmentFormatted: row.penaltyAdjustmentFormatted,
    penaltyAdjustmentLabel: row.penaltyAdjustmentLabel,
    policyTags: [
      ...(policy.caveatRequired ? ["directional"] : []),
      ...(row.isPenaltyAdjusted ? ["penalty_adjusted"] : []),
    ],
  };
}

function buildSplitProfile(analysisJson = {}, policy) {
  const rows = buildSplitDisplayRows(analysisJson).map((row) => toContractSplitRow(row, policy));
  const withGaps = rows.filter((row) => Number.isFinite(row.displayGapSeconds));
  const biggestGain = [...withGaps].filter((row) => row.displayGapSeconds < 0).sort((a, b) => a.displayGapSeconds - b.displayGapSeconds)[0] ?? null;
  const biggestLoss = [...withGaps].filter((row) => row.displayGapSeconds > 0).sort((a, b) => b.displayGapSeconds - a.displayGapSeconds)[0] ?? null;
  const fastestAheadSplit = biggestGain;
  return {
    rows,
    biggestGain,
    biggestLoss,
    biggestStationLoss: [...withGaps].filter((row) => row.type === "station" && row.displayGapSeconds > 0).sort((a, b) => b.displayGapSeconds - a.displayGapSeconds)[0] ?? null,
    biggestRunLoss: [...withGaps].filter((row) => row.type === "run" && row.displayGapSeconds > 0).sort((a, b) => b.displayGapSeconds - a.displayGapSeconds)[0] ?? null,
    fastestAheadSplit,
    strongestProtectableSplit: null,
    noStrengthReason: rows.length ? "No reliable protectable strength identified from strict strength inputs." : "No split rows available.",
  };
}

function buildStrengthPolicy(analysisJson = {}, splitProfile, policy) {
  const strength = resolveReportStrength(analysisJson);
  const fastestAhead = splitProfile.fastestAheadSplit;
  const strengthGap = reportStrengthGapSeconds(strength);
  if (policy.anomaly) {
    return {
      status: "suppressed",
      displayLabel: "INSUFFICIENT SPLIT CONFIDENCE",
      compactLabel: "INSUFFICIENT SPLIT CONFIDENCE",
      strength: null,
      fastestAheadSplit: fastestAhead,
      explanation: "Split confidence is too low to name a reliable strength.",
      fallbackReason: "data_quality",
      maySayStrongestStation: false,
    };
  }
  if (strength) {
    const displayGap = Number.isFinite(strengthGap) ? displayDelta(strengthGap) : null;
    const caveatPrefix = policy.caveatRequired ? "Directional: " : "";
    return {
      status: "reliable_strength",
      displayLabel: strength.label,
      compactLabel: "STRONGEST STATION",
      strength,
      fastestAheadSplit: fastestAhead,
      displayGap,
      explanation: `${caveatPrefix}${strength.label} is the strongest benchmarked area in this result.`,
      fallbackReason: null,
      maySayStrongestStation: !policy.caveatRequired,
      dataQualityNote: strength.dataQualityNote ?? policy.compactCaveat ?? null,
    };
  }
  if (fastestAhead) {
    return {
      status: "fastest_ahead_split_only",
      displayLabel: fastestAhead.label,
      compactLabel: "FASTEST AHEAD SPLIT",
      strength: null,
      fastestAheadSplit: fastestAhead,
      displayGap: fastestAhead.displayGap,
      explanation: `${fastestAhead.label} is the best relative split, but no protectable strength was identified with enough evidence.`,
      fallbackReason: "no_protectable_strength",
      maySayStrongestStation: false,
      dataQualityNote: policy.compactCaveat ?? null,
    };
  }
  return {
    status: "no_reliable_strength",
    displayLabel: "NO RELIABLE STRENGTH",
    compactLabel: "NO RELIABLE STRENGTH",
    strength: null,
    fastestAheadSplit: null,
    displayGap: null,
    explanation: "No reliable strongest split could be identified from the available data.",
    fallbackReason: splitProfile.noStrengthReason,
    maySayStrongestStation: false,
    dataQualityNote: policy.compactCaveat ?? null,
  };
}

function buildRoxzonePolicy(analysisJson = {}, primaryClaim = null, policy, facts = {}) {
  const action = roxzoneActionability(analysisJson, primaryClaim, { isDoubles: facts.isDoubles });
  const copyPrecision = policy.inferredRoxzone || policy.partialSplitData || policy.estimatedSplit || policy.missingRunData || policy.missingStationData
    ? "directional"
    : "exact";
  return {
    claimConfidence: primaryClaim?.claimStrength ?? policy.confidence,
    actionEvidenceLevel: action?.actionEvidenceLevel ?? null,
    copyPrecision,
    allowedActionLabel: action?.carouselAction ?? action?.raceCardCta ?? null,
    requiredCaveat: copyPrecision === "exact" ? null : policy.compactCaveat ?? "Directional",
    forbiddenTerms: copyPrecision === "exact" ? [] : ["exact", "definitely", "precise"],
    action,
  };
}

function primaryOpening(primaryClaim = null, targetAssessment = {}, gapReconciliation = {}, facts = {}) {
  if (!primaryClaim?.label) return "Your HYROX analysis is ready.";
  const reconciliationSentence = gapReconciliation?.summarySentence ? ` ${gapReconciliation.summarySentence}` : "";
  const owner = facts.teamContext?.opportunityOwner ?? "your";
  const teamCaveat = facts.teamContext?.combinedTimeCaveat ? ` ${facts.teamContext.combinedTimeCaveat}` : "";
  if (primaryClaim.isPenalty) return `${primaryClaim.label} are ${owner} fastest controllable win.${reconciliationSentence}${teamCaveat}`;
  const subject = segmentSubject(primaryClaim);
  const noun = primaryClaim.claimStrength !== "firm"
    ? targetAssessment.hasExactTarget ? "main directional target opportunity" : "main directional opportunity"
    : targetAssessment.hasExactTarget ? "main target opportunity" : "main opportunity";
  const feasibilityArticle = /^[aeiou]/i.test(String(targetAssessment.feasibilityLabel ?? "")) ? "an" : "a";
  const feasibilitySentence = targetAssessment.status === "behind" && targetAssessment.feasibilityLabel
    ? ` This target is ${feasibilityArticle} ${targetAssessment.feasibilityLabel}.`
    : "";
  const teamNoun = facts.isDoubles && primaryClaim.claimStrength === "firm"
    ? targetAssessment.hasExactTarget ? "main team target opportunity" : "main team opportunity"
    : noun;
  return `${subject} ${segmentVerb(subject)} the ${teamNoun}.${feasibilitySentence}${reconciliationSentence}${teamCaveat}`;
}

function buildEmailSubject({ primaryClaim, targetAssessment, inputFacts }) {
  const subjectPrimary = primaryClaim?.label ?? primaryClaim?.normalizedLabel ?? null;
  if (primaryClaim?.isPenalty) {
    return `Your HYROX fastest win is ${primaryClaim.displayGain ?? displayDuration(primaryClaim.gainSeconds)} of penalties`;
  }
  if (!subjectPrimary) return "Your HYROX race analysis is ready";
  if (inputFacts?.calculatorMode === "target" && targetAssessment?.targetTimeDisplay) {
    return `Your route to ${targetAssessment.targetTimeDisplay}: start with ${subjectPrimary}`;
  }
  if (primaryClaim?.segmentKey === "roxzone_time" || /\broxzone\b/i.test(subjectPrimary)) {
    return `${subjectPrimary} is your next HYROX refinement`;
  }
  if (primaryClaim?.type === "run") {
    return `${subjectPrimary} is your main HYROX opportunity`;
  }
  return `Start with ${subjectPrimary} in your HYROX analysis`;
}

function buildArtifactSlots({ primaryClaim, targetAssessment, gapReconciliation, splitProfile, strengthPolicy, inputFacts }) {
  const subjectPrimary = primaryClaim?.label ?? primaryClaim?.normalizedLabel ?? null;
  const limiterLabel = subjectPrimary;
  const biggestGain = splitProfile.biggestGain
    ? { station: splitProfile.biggestGain.label.toUpperCase(), delta: splitProfile.biggestGain.displayGap }
    : { station: "NO SPLIT AHEAD", delta: "0" };
  const biggestLoss = splitProfile.biggestLoss
    ? { station: splitProfile.biggestLoss.label.toUpperCase(), delta: splitProfile.biggestLoss.displayGap }
    : { station: "N/A", delta: "0" };
  const strengthFeatureLabel = strengthPolicy.status === "fastest_ahead_split_only"
    ? "Best Relative Split"
    : strengthPolicy.status === "reliable_strength" && strengthPolicy.maySayStrongestStation !== false
      ? "Strongest Station"
      : strengthPolicy.status === "no_reliable_strength"
        ? "Split Confidence"
        : "Relative Split Signal";
  const carouselFeatures = [
    "Biggest Limiter",
    "Time Potential",
    strengthFeatureLabel,
    ...(inputFacts.benchmarkAvailable ? ["Percentile Ranking"] : []),
    "Race Efficiency Score",
  ];
  return {
    email: {
      subject: buildEmailSubject({ primaryClaim, targetAssessment, inputFacts }),
      subjectPrimary,
      mainInsightOpening: primaryOpening(primaryClaim, targetAssessment, gapReconciliation, inputFacts),
      reconciliation: gapReconciliation.summarySentence,
    },
    raceCard: {
      heroPrimary: limiterLabel,
      targetGap: targetAssessment.displayGap,
      targetGapSigned: targetAssessment.signedDisplayGap,
      strengthLabel: strengthPolicy.displayLabel,
      ctaHeadline: targetAssessment.ctaHeadline,
      reconciliation: gapReconciliation.summarySentence,
    },
    carousel: {
      slide1Primary: limiterLabel ? limiterLabel.toUpperCase() : null,
      slide2Gain: biggestGain,
      slide2Loss: biggestLoss,
      strengthLabel: strengthPolicy.displayLabel.toUpperCase(),
      strengthCompactLabel: strengthPolicy.compactLabel,
      ctaHeadline: targetAssessment.ctaHeadline,
      reconciliation: gapReconciliation.summarySentence,
      features: carouselFeatures,
    },
    caption: {
      primary: limiterLabel ? limiterLabel.toUpperCase() : null,
    },
  };
}

export function ensureHyroxReportContract({ analysisJson = {}, athleteContext = {}, calculatorMode = analysisJson.calculatorMode ?? "target", insights = [], contract = null } = {}) {
  return contract ?? buildHyroxReportContract({ analysisJson, athleteContext, calculatorMode, insights });
}

export function buildHyroxReportContract({
  analysisJson = {},
  athleteContext = {},
  calculatorMode = analysisJson.calculatorMode ?? "target",
  insights = [],
} = {}) {
  const narrative = buildHyroxReportNarrative({ analysisJson, athleteContext, calculatorMode, insights });
  const policy = dataQualityPolicy(analysisJson);
  const rankPolicy = explicitRankDisplays(analysisJson, athleteContext, policy);
  const primaryClaim = claimFromOpportunity(narrative.primaryOpportunity, { headlineMode: narrative.headlineMode, policy });
  const secondaryClaims = [
    narrative.secondaryOpportunity,
    narrative.fastestControllableWin,
    narrative.largestFitnessLimiter,
  ]
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((other) => other.normalizedLabel === item.normalizedLabel) === index)
    .filter((item) => item.normalizedLabel !== primaryClaim?.normalizedLabel)
    .map((item) => claimFromOpportunity(item, { headlineMode: "secondary", policy }));
  const facts = inputFacts(analysisJson, athleteContext, calculatorMode);
  const comparisonFrame = buildComparisonFrame(analysisJson, rankPolicy);
  const targetAssessment = buildTargetAssessment(facts, analysisJson, primaryClaim);
  const gapReconciliation = buildGapReconciliation(analysisJson, primaryClaim);
  const splitProfile = buildSplitProfile(analysisJson, policy);
  const strengthPolicy = buildStrengthPolicy(analysisJson, splitProfile, policy);
  splitProfile.strongestProtectableSplit = strengthPolicy.strength ?? null;
  const roxzonePolicy = buildRoxzonePolicy(analysisJson, primaryClaim, policy, facts);
  const primaryTrack = {
    headlineMode: narrative.headlineMode,
    primary: primaryClaim,
    fastestControllableWin: narrative.fastestControllableWin,
    largestFitnessLimiter: narrative.largestFitnessLimiter,
    secondaryCoaching: buildSecondaryCoaching(narrative),
    penaltyRelationship: primaryClaim?.isPenalty
      ? "penalty_primary"
      : narrative.fastestControllableWin ? "penalty_secondary" : "none",
    compactLabel: primaryClaim?.compactLabel ?? null,
    longLabel: primaryClaim?.longLabel ?? null,
    claimStrength: primaryClaim?.claimStrength ?? null,
  };
  const artifactSlots = buildArtifactSlots({ primaryClaim, targetAssessment, gapReconciliation, splitProfile, strengthPolicy, inputFacts: facts });

  const contract = {
    version: VERSION,
    mode: calculatorMode,
    analysisScope: analysisJson.analysisScope ?? null,
    headlineMode: narrative.headlineMode,
    inputFacts: facts,
    teamContext: facts.teamContext,
    comparisonFrame,
    primaryTrack,
    targetAssessment,
    gapReconciliation,
    splitProfile,
    strengthPolicy,
    roxzonePolicy,
    artifactSlots,
    primaryClaim,
    primaryOpportunity: narrative.primaryOpportunity,
    secondaryClaims,
    fastestControllableWin: narrative.fastestControllableWin,
    largestFitnessLimiter: narrative.largestFitnessLimiter,
    secondaryCoaching: primaryTrack.secondaryCoaching,
    largestCategoryGap: narrative.largestCategoryGap,
    largestSegmentGap: narrative.largestSegmentGap,
    categorySegmentBridge: narrative.categorySegmentBridge,
    rankPolicy,
    rankDisplays: {
      allowed: rankPolicy.allowed,
      primary: rankPolicy.displays[0] ?? null,
      displays: rankPolicy.displays,
    },
    benchmark: {
      available: rankPolicy.allowed,
      comparisonProfileLabel: rankPolicy.allowed ? comparisonFrame.displayLabel : "Benchmark unavailable",
      rankClaimsAllowed: rankPolicy.allowed,
    },
    dataQualityPolicy: policy,
    penalty: narrative.penalty,
    dataQuality: {
      ...narrative.dataQuality,
      ...policy,
      firmClaimsAllowed: primaryClaim?.claimStrength === "firm",
      rankClaimsAllowed: rankPolicy.allowed,
      artifactLabelPolicy: {
        primaryLabel: primaryClaim?.compactLabel === "BIGGEST LIMITER" ? null : primaryClaim?.compactLabel,
        strengthLabel: policy.caveatRequired ? "DIRECTIONAL STRENGTH" : null,
      },
      note: policy.longCaveat,
    },
    artifactPolicy: {
      email: { primaryLabel: primaryClaim?.longLabel, caveat: policy.longCaveat },
      browser: { primaryLabel: primaryClaim?.longLabel, caveat: policy.longCaveat },
      raceCard: { primaryLabel: primaryClaim?.compactLabel, caveat: policy.compactCaveat, targetGap: artifactSlots.raceCard.targetGap },
      carousel: { primaryLabel: primaryClaim?.compactLabel, caveat: policy.compactCaveat, ctaHeadline: artifactSlots.carousel.ctaHeadline },
      caption: { primaryLabel: primaryClaim?.longLabel, caveat: policy.longCaveat },
    },
    hero: {
      ...narrative.hero,
      metricLabel: primaryClaim?.compactLabel ?? narrative.hero?.metricLabel,
    },
    mainInsight: {
      ...narrative.mainInsight,
      opener: artifactSlots.email.mainInsightOpening ?? narrative.mainInsight?.opener,
      reconciliation: artifactSlots.email.reconciliation,
    },
    coaching: {},
    sourceNarrative: narrative,
    sourceOpportunity: narrative.sourceOpportunity,
  };

  return contract;
}
