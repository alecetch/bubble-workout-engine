import { formatGain, formatPercentile, formatTime } from "./copyFormatter.js";
import { ensureHyroxReportContract } from "./reportContractBuilder.js";
import { dataQualityNote, resolveReportStrength } from "./reportSelections.js";
import { roxzoneActionability } from "./roxzoneActionability.js";
import { displaySegmentLabel, segmentSubject, segmentVerb } from "./segmentDisplay.js";

function segment(analysisJson, key) {
  return analysisJson.segments?.find((row) => row.segmentKey === key) ?? null;
}

function hasReplayRoxzoneDetail(analysisJson) {
  const rox = analysisJson.roxzoneAnalysis ?? {};
  return Boolean(
    rox.entryExitAvailable ||
    rox.roxzoneNarrative?.available ||
    Number(rox.roxzoneNarrative?.measurableStationCount) > 0 ||
    Number(rox.measurableStationCount) > 0,
  );
}

function hasCompleteCoreSplits(analysisJson) {
  const segments = Array.isArray(analysisJson.segments) ? analysisJson.segments : [];
  const runCount = new Set(segments.filter((row) => row.type === "run").map((row) => row.segmentKey)).size;
  const stationCount = new Set(segments.filter((row) => row.type === "station").map((row) => row.segmentKey)).size;
  return runCount >= 8 && stationCount >= 8;
}

export function buildBrowserSummary(analysisJson = {}, insights = [], athleteContext = {}, calculatorMode = "target", contract = null) {
  const narrative = ensureHyroxReportContract({ analysisJson, athleteContext, calculatorMode, insights, contract });
  const opportunity = narrative.sourceOpportunity;
  const limiter = narrative.primaryClaim && !narrative.primaryClaim.isPenalty
    ? { ...narrative.primaryClaim, label: narrative.primaryClaim.label, timeGapSeconds: narrative.primaryClaim.gainSeconds }
    : narrative.largestFitnessLimiter
    ? { ...narrative.largestFitnessLimiter, label: displaySegmentLabel(narrative.largestFitnessLimiter, narrative.largestFitnessLimiter.label) }
    : null;
  const roxzoneAction = roxzoneActionability(analysisJson, limiter, { isDoubles: narrative.inputFacts?.isDoubles ?? narrative.teamContext?.isDoubles });
  const strength = resolveReportStrength(analysisJson);
  const canonicalPrimary = narrative.primaryOpportunity;
  const topInsightCandidate = insights[0] ?? null;
  const topInsightSegmentKey = topInsightCandidate?.evidence?.segmentKey ?? null;
  const topInsightIsRoxzone = topInsightSegmentKey === "roxzone_time"
    || topInsightCandidate?.evidence?.coreClaim === "roxzone_efficiency"
    || /\broxzone\b/i.test(String(topInsightCandidate?.title ?? ""));
  const topInsightClaimsPrimary = /biggest|opportunity|limiter|costing/i.test(String(topInsightCandidate?.title ?? ""))
    || ["biggest_limiter", "time_potential", "roxzone_efficiency"].includes(String(topInsightCandidate?.evidence?.coreClaim ?? ""));
  const topInsightClaimsStrength = /\bstrength\b/i.test(String(topInsightCandidate?.title ?? ""))
    || topInsightCandidate?.evidence?.coreClaim === "biggest_strength";
  const topInsightStrengthLabel = displaySegmentLabel(
    { segmentKey: topInsightSegmentKey, label: topInsightCandidate?.evidence?.segmentLabel },
    topInsightCandidate?.evidence?.segmentLabel ?? topInsightSegmentKey,
  );
  const topInsightConflictsWithPrimary = Boolean(
    topInsightCandidate
      && canonicalPrimary
      && (
        (topInsightClaimsPrimary && topInsightSegmentKey && topInsightSegmentKey !== canonicalPrimary.segmentKey)
        || (topInsightIsRoxzone && canonicalPrimary.segmentKey !== "roxzone_time")
      ),
  );
  const topInsightConflictsWithStrength = Boolean(
    topInsightCandidate
      && topInsightClaimsStrength
      && !Number.isFinite(Number(topInsightCandidate?.evidence?.timeGapSeconds))
      && (
        !strength
        || (topInsightSegmentKey && topInsightSegmentKey !== strength.segmentKey)
        || (topInsightStrengthLabel && strength.label && topInsightStrengthLabel !== strength.label)
      ),
  );
  const topInsight = topInsightConflictsWithPrimary || topInsightConflictsWithStrength ? null : topInsightCandidate;
  const topInsightMatchesPrimary = Boolean(
    topInsight
      && canonicalPrimary
      && (
        topInsightSegmentKey === canonicalPrimary.segmentKey
        || (topInsightIsRoxzone && canonicalPrimary.segmentKey === "roxzone_time")
      ),
  );
  const topInsightHasConcreteClaim = Boolean(
    topInsight
      && (
        topInsightSegmentKey
        || Number.isFinite(Number(topInsight.evidence?.potentialGainSeconds))
        || Number.isFinite(Number(topInsight.evidence?.timeGapSeconds))
      ),
  );
  const topInsightHeroEligible = Boolean(
    topInsight
      && topInsightHasConcreteClaim
      && (!topInsightClaimsPrimary || topInsightMatchesPrimary)
      && !topInsightClaimsStrength
      && (narrative.headlineMode === "single_track" || topInsightMatchesPrimary),
  );
  const heroMetricSeconds = topInsightHeroEligible
    ? topInsightMatchesPrimary && Number.isFinite(Number(limiter?.timeGapSeconds))
      ? limiter.timeGapSeconds
      : topInsight.evidence?.potentialGainSeconds
    : narrative.headlineMode === "penalty_first"
      ? narrative.hero.metricSeconds ?? 0
      : analysisJson.timePotential?.headlineGainSeconds ?? narrative.hero.metricSeconds ?? limiter?.timeGapSeconds ?? 0;
  const total = segment(analysisJson, "total_time");
  const benchmarkPercentilesAvailable = narrative.rankPolicy.allowed;
  const noteParts = [];
  const replayRoxzoneAvailable = hasReplayRoxzoneDetail(analysisJson);
  const coreSplitsComplete = hasCompleteCoreSplits(analysisJson);
  if (analysisJson.roxzoneAnalysis?.mode === "inferred_total" && !replayRoxzoneAvailable) {
    noteParts.push("RoxZone total is estimated from unallocated race time.");
  }
  const partialDataNote = dataQualityNote(analysisJson);
  if (!coreSplitsComplete && partialDataNote) noteParts.push(partialDataNote);

  return {
    heroInsight: {
      title: topInsightHeroEligible ? topInsight.title : narrative.hero.title,
      heroMetric: formatGain(heroMetricSeconds),
    },
    overallPercentile: benchmarkPercentilesAvailable && Number.isFinite(Number(narrative.rankPolicy.displays[0]?.percentile)) ? narrative.rankPolicy.displays[0].percentile : null,
    overallPercentileLabel: benchmarkPercentilesAvailable ? narrative.rankPolicy.displays[0]?.label ?? formatPercentile(total?.percentile) : null,
    benchmarkGroupLabel: benchmarkPercentilesAvailable
      ? narrative.benchmark.comparisonProfileLabel ?? analysisJson.benchmarkContext?.primaryBenchmarkGroup?.label ?? analysisJson.benchmarkContext?.primaryBenchmarkGroup?.key ?? "your benchmark band"
      : "Benchmark data unavailable",
    comparisonOptions: benchmarkPercentilesAvailable ? analysisJson.benchmarkContext?.comparisonOptions ?? null : null,
    biggestLimiter: limiter ? { label: limiter.label, timeGapFormatted: formatGain(limiter.timeGapSeconds) } : null,
    fastestControllableWin: opportunity.fastestControllableWin
      ? {
          label: opportunity.fastestControllableWin.label,
          timeGapFormatted: formatGain(opportunity.fastestControllableWin.timeGapSeconds),
          caption: opportunity.fastestControllableWin.caption,
        }
      : null,
    largestFitnessLimiter: limiter ? { label: limiter.label, timeGapFormatted: formatGain(limiter.timeGapSeconds) } : null,
    roxzoneAction,
    biggestStrength: strength
      ? {
          label: strength.label,
          summaryText: strength.summaryText,
          percentile: Number.isFinite(Number(strength.percentile)) ? Number(strength.percentile) : null,
          dataQualityNote: strength.dataQualityNote,
        }
      : null,
    timePotential: {
      headlineGainFormatted: formatGain(analysisJson.timePotential?.headlineGainSeconds ?? 0),
      projectedTimeFormatted: formatTime(analysisJson.timePotential?.newProjectedTimeSeconds ?? analysisJson.headline?.projectedTimeSeconds),
    },
    sentMessage: athleteContext.email ? `Your full report has been sent to ${athleteContext.email}` : null,
    dataQualityNote: noteParts.length ? noteParts.join(" ") : null,
    calculatorMode,
    narrative,
    athleteArchetype: analysisJson.athleteArchetype
      ? {
          key: analysisJson.athleteArchetype.key,
          label: analysisJson.athleteArchetype.label,
          confidence: analysisJson.athleteArchetype.confidence ?? null,
        }
      : null,
    workRunBalance: analysisJson.workRunBalance
      ? {
          runSharePct: analysisJson.workRunBalance.runShare != null
            ? Math.round(analysisJson.workRunBalance.runShare * 100)
            : null,
          workSharePct: analysisJson.workRunBalance.workShare != null
            ? Math.round(analysisJson.workRunBalance.workShare * 100)
            : null,
          profileType: analysisJson.workRunBalance.profileType ?? null,
          profileTypeLabel: {
            transition_limited: "Transition limited",
            runner_dominant: "Runner dominant",
            strength_dominant: "Strength dominant",
            balanced_hybrid: "Balanced hybrid",
          }[analysisJson.workRunBalance.profileType] ?? null,
        }
      : null,
  };
}
