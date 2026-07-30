import { formatGain, formatPerformancePercentile, label as fallbackLabel } from "./copyFormatter.js";
import { benchmarkConfidenceQualifier, hasBenchmarkPercentileData, percentileTextWithFallback, primaryComparisonOption } from "./comparisonOptions.js";
import { comparisonProfileLabel } from "./comparisonProfileLabel.js";
import { opportunityFraming } from "./opportunityFraming.js";
import { dataQualityNote } from "./reportSelections.js";
import { displaySegmentLabel, segmentSubject, segmentVerb } from "./segmentDisplay.js";
import { isDoublesAnalysisDivision } from "../config/divisionGroups.js";

const VERSION = 1;

function segment(analysisJson = {}, key) {
  return (analysisJson.segments ?? []).find((row) => row?.segmentKey === key) ?? null;
}

export function normalizeNarrativeLabel(value = null) {
  const text = String(value?.label ?? value?.name ?? value ?? "")
    .trim()
    .replace(/\bTotal Roxzone Time\b/gi, "RoxZone")
    .replace(/\bRoxzone\b/gi, "RoxZone")
    .replace(/\s+/g, " ");
  if (!text) return null;
  if (/^penalties$/i.test(text)) return "Penalties";
  if (/^roxzone$/i.test(text)) return "RoxZone";
  return text
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bSkierg\b/g, "SkiErg")
    .replace(/\bRoxzone\b/g, "RoxZone");
}

function normalizedOpportunity(item = null) {
  if (!item) return null;
  const displayLabel = displaySegmentLabel(item, item.label ?? fallbackLabel(item.segmentKey)) ?? item.label ?? null;
  const normalizedLabel = normalizeNarrativeLabel(displayLabel);
  return {
    ...item,
    label: displayLabel,
    displayLabel,
    normalizedLabel,
    timeGapSeconds: Number.isFinite(Number(item.timeGapSeconds)) ? Number(item.timeGapSeconds) : null,
    isPenalty: item.type === "penalty" || normalizedLabel === "Penalties",
  };
}

function firstAvailablePercentile(analysisJson = {}, athleteContext = {}) {
  const total = segment(analysisJson, "total_time");
  const primary = primaryComparisonOption(analysisJson.benchmarkContext);
  const raw = primary?.percentile
    ?? total?.fieldPercentile
    ?? total?.percentile
    ?? athleteContext.overallPercentile
    ?? null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function buildRankDisplays(analysisJson = {}, athleteContext = {}, benchmarkAvailable = false) {
  if (!benchmarkAvailable) {
    return {
      allowed: false,
      primary: null,
      benchmarkBandStanding: { available: false, label: null, basisLabel: null, source: "benchmark_band" },
      worldwideStanding: { available: false, label: null, basisLabel: null, source: "worldwide" },
      ageGroupStanding: { available: false, label: null, basisLabel: null, source: "age_group" },
    };
  }

  const total = segment(analysisJson, "total_time");
  const primaryOption = primaryComparisonOption(analysisJson.benchmarkContext);
  const primaryLabel = percentileTextWithFallback(analysisJson.benchmarkContext, total, athleteContext.overallPercentile);
  const comparisonLabel = comparisonProfileLabel(analysisJson);
  const qualifier = benchmarkConfidenceQualifier(analysisJson.benchmarkContext);
  const fieldPercentile = firstAvailablePercentile(analysisJson, athleteContext);
  const age = analysisJson.benchmarkContext?.ageBenchmark;
  const agePercentile = Number(age?.fieldPercentile);

  return {
    allowed: true,
    primary: primaryLabel ? {
      available: true,
      label: primaryLabel,
      basisLabel: primaryOption?.label ?? comparisonLabel ?? "benchmark field",
      source: Number.isFinite(Number(primaryOption?.percentile)) ? "comparison_option" : "overall",
      qualifier,
    } : null,
    benchmarkBandStanding: {
      available: Number.isFinite(fieldPercentile),
      label: Number.isFinite(fieldPercentile) ? formatPerformancePercentile(fieldPercentile) : null,
      basisLabel: comparisonLabel,
      source: "benchmark_band",
    },
    worldwideStanding: {
      available: Number.isFinite(Number(primaryOption?.percentile)),
      label: Number.isFinite(Number(primaryOption?.percentile))
        ? percentileTextWithFallback(analysisJson.benchmarkContext, {}, null)
        : null,
      basisLabel: "worldwide",
      source: "worldwide",
    },
    ageGroupStanding: {
      available: Number.isFinite(agePercentile),
      label: Number.isFinite(agePercentile)
        ? formatPerformancePercentile(agePercentile, { scope: `in your ${age?.ageGroup ?? "age group"}` })
        : null,
      basisLabel: age?.ageGroup ?? null,
      source: "age_group",
    },
  };
}

function qualityFlags(analysisJson = {}, benchmarkAvailable = false) {
  const warnings = Array.isArray(analysisJson.dataQuality?.warnings) ? analysisJson.dataQuality.warnings : [];
  const completeness = Number(analysisJson.dataQuality?.inputCompleteness);
  const partial = warnings.includes("partial_split_data") || (Number.isFinite(completeness) && completeness < 1);
  const missingRun = warnings.includes("missing_run_data") || warnings.includes("missing_running_data");
  const missingStation = warnings.includes("missing_station_data");
  const anomaly = warnings.some((warning) => /anomal|unreconciled|impossible|inconsistent/i.test(String(warning)));
  const note = dataQualityNote(analysisJson);
  return {
    confidence: anomaly ? "low" : partial || missingRun || missingStation || !benchmarkAvailable ? "directional" : "high",
    warnings,
    partialSplitData: partial,
    missingRunData: missingRun,
    missingStationData: missingStation,
    anomaly,
    noBenchmarkData: !benchmarkAvailable,
    note: note ?? (!benchmarkAvailable ? "Benchmark data is unavailable, so this summary is directional." : null),
    firmClaimsAllowed: !anomaly,
    rankClaimsAllowed: benchmarkAvailable && !anomaly,
    artifactLabelPolicy: anomaly || !benchmarkAvailable
      ? { primaryLabel: "Directional opportunity", strengthLabel: "Directional strength" }
      : { primaryLabel: null, strengthLabel: null },
  };
}

function bridgeFor(category = null, segmentOpportunity = null) {
  if (!category || !segmentOpportunity) return { required: false, sentence: null };
  const categoryLabel = normalizeNarrativeLabel(displaySegmentLabel(category, category.label));
  const segmentLabel = segmentOpportunity.normalizedLabel;
  const categoryType = category.segmentKey === "run_time" ? "run" : category.segmentKey === "work_time" ? "station" : category.segmentKey;
  const segmentType = segmentOpportunity.type === "aggregate" && segmentOpportunity.segmentKey === "roxzone_time"
    ? "roxzone_time"
    : segmentOpportunity.type;
  const required = Boolean(categoryLabel && segmentLabel && categoryType && segmentType && categoryType !== segmentType);
  return {
    required,
    categoryLeader: categoryLabel,
    segmentLeader: segmentLabel,
    sentence: required
      ? `${categoryLabel} is the larger category gap, but ${segmentSubject(segmentOpportunity)} is the single biggest segment to attack first.`
      : null,
  };
}

function doublesContext(analysisJson = {}, athleteContext = {}) {
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
    isDoubles,
    combinedTimeCaveat: isDoubles ? "This is your combined team time; official HYROX data does not split individual partner contribution." : null,
    opportunityOwner: isDoubles ? "your team's" : "your",
  };
}

function heroFor(narrative) {
  const primary = narrative.primaryOpportunity;
  const owner = narrative.teamContext?.opportunityOwner ?? "your";
  if (!primary) return { title: "Your HYROX analysis is ready", metricSeconds: null, metricLabel: null };
  if (narrative.headlineMode === "penalty_first") {
    return {
      title: `${primary.displayLabel} ${segmentVerb(primary.displayLabel)} ${owner} fastest controllable win`,
      metricSeconds: primary.timeGapSeconds,
      metricLabel: "Fastest controllable win",
    };
  }
  return {
    title: `${segmentSubject(primary)} ${segmentVerb(primary)} ${owner} biggest opportunity`,
    metricSeconds: primary.timeGapSeconds,
    metricLabel: narrative.dataQuality?.artifactLabelPolicy?.primaryLabel ?? "Biggest opportunity",
  };
}

function mainInsightFor(narrative) {
  const primary = narrative.primaryOpportunity;
  const secondaryFitness = narrative.largestFitnessLimiter;
  const owner = narrative.teamContext?.opportunityOwner ?? "your";
  const caveat = narrative.teamContext?.combinedTimeCaveat ? ` ${narrative.teamContext.combinedTimeCaveat}` : "";
  if (!primary) return { opener: "Your HYROX analysis is ready." };
  if (narrative.headlineMode === "penalty_first") {
    const follow = secondaryFitness?.normalizedLabel
      ? ` After that, ${secondaryFitness.normalizedLabel} is the main fitness limiter.`
      : "";
    return { opener: `${primary.displayLabel} are ${owner} fastest controllable win.${follow}${caveat}` };
  }
  if (narrative.headlineMode === "fitness_first_with_penalty_win") {
    const penalty = narrative.fastestControllableWin;
    const follow = penalty?.timeGapSeconds
      ? ` Penalties are a separate ${formatGain(penalty.timeGapSeconds)} execution win to clean up.`
      : "";
    return { opener: `${segmentSubject(primary)} ${segmentVerb(primary)} ${owner} training route.${follow}${caveat}` };
  }
  if (narrative.headlineMode === "no_benchmark_directional" || narrative.headlineMode === "data_anomaly_directional") {
    return { opener: `${segmentSubject(primary)} looks like ${owner} main directional opportunity, but treat this as lower confidence.${caveat}` };
  }
  return { opener: `${segmentSubject(primary)} ${segmentVerb(primary)} ${owner} biggest opportunity.${caveat}` };
}

export function buildHyroxReportNarrative({
  analysisJson = {},
  athleteContext = {},
  calculatorMode = analysisJson.calculatorMode ?? "target",
  insights = [],
} = {}) {
  const opportunity = opportunityFraming(analysisJson);
  const overall = segment(analysisJson, "total_time");
  const benchmarkAvailable = hasBenchmarkPercentileData(analysisJson, overall, athleteContext.overallPercentile);
  const fastestControllableWin = normalizedOpportunity(opportunity.fastestControllableWin);
  const largestFitnessLimiter = normalizedOpportunity(opportunity.largestFitnessLimiter);
  const largestCategoryGap = normalizedOpportunity(opportunity.largestCategoryGap);
  const largestSegmentGap = normalizedOpportunity(opportunity.largestSegmentGap);
  const primaryOpportunity = normalizedOpportunity(opportunity.primaryOpportunity);
  const dataQuality = qualityFlags(analysisJson, benchmarkAvailable);
  const teamContext = doublesContext(analysisJson, athleteContext);
  const baseMode = opportunity.artifactHeadlineMode;
  const headlineMode = dataQuality.anomaly
    ? "data_anomaly_directional"
    : !benchmarkAvailable
      ? "no_benchmark_directional"
      : baseMode;
  const narrative = {
    version: VERSION,
    mode: calculatorMode,
    analysisScope: analysisJson.analysisScope ?? null,
    headlineMode,
    artifactHeadlineMode: headlineMode,
    primaryOpportunity,
    secondaryOpportunity: opportunity.secondaryOpportunities?.map(normalizedOpportunity).find(Boolean) ?? null,
    fastestControllableWin,
    largestFitnessLimiter,
    largestCategoryGap,
    largestSegmentGap,
    categorySegmentBridge: bridgeFor(largestCategoryGap, primaryOpportunity),
    benchmark: {
      available: benchmarkAvailable,
      comparisonProfileLabel: benchmarkAvailable ? comparisonProfileLabel(analysisJson) : "Benchmark unavailable",
      rankClaimsAllowed: dataQuality.rankClaimsAllowed,
    },
    rankDisplays: buildRankDisplays(analysisJson, athleteContext, benchmarkAvailable),
    teamContext,
    dataQuality,
    penalty: opportunity.penalty,
    insights,
    sourceOpportunity: opportunity,
  };
  narrative.hero = heroFor(narrative);
  narrative.mainInsight = mainInsightFor(narrative);
  return narrative;
}
