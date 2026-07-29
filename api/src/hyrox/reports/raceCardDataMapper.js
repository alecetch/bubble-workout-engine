import { isDoublesAnalysisDivision } from "../config/divisionGroups.js";
import { comparisonLabel, hasGoalGroup } from "./comparisonBasis.js";
import { comparisonProfileLabel as buildComparisonProfileLabel } from "./comparisonProfileLabel.js";
import { comparisonOptionsArray } from "./comparisonOptions.js";
import { ensureHyroxReportContract } from "./reportContractBuilder.js";
import { displaySegmentLabel } from "./segmentDisplay.js";
import { buildSplitDisplayRows } from "./splitRowDisplayContract.js";

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatTimeDelta(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const abs = Math.abs(Math.round(seconds));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const formatted = `${m}:${String(s).padStart(2, "0")}`;
  return seconds >= 0 ? `+${formatted}` : `-${formatted}`;
}

// Sign-worded gap copy for the race-card limiter panel (e.g. "1:02 slower") — reads more
// directly than a bare signed number needing separate interpretation. Formats the same
// timeGapSeconds value as formatTimeDelta, just wrapped in words instead of a +/- sign.
function formatGapWords(seconds) {
  const magnitude = formatSeconds(Math.abs(seconds));
  if (!magnitude) return null;
  return `${magnitude} ${seconds >= 0 ? "slower" : "faster"}`;
}

function segment(analysisJson, key) {
  return analysisJson.segments?.find((row) => row.segmentKey === key) ?? null;
}

function targetGapSeconds(row, goalAvailable) {
  if (Number.isFinite(row?.frameGapNetOfPenaltySeconds)) return row.frameGapNetOfPenaltySeconds;
  if (Number.isFinite(row?.frameGapSeconds)) return row.frameGapSeconds;
  if (Number.isFinite(row?.timeGapToExactTargetSeconds)) return row.timeGapToExactTargetSeconds;
  if (goalAvailable && Number.isFinite(row?.goalBenchmarkSeconds) && Number.isFinite(row?.userSeconds)) {
    return row.userSeconds - row.goalBenchmarkSeconds;
  }
  return Number.isFinite(row?.timeGapToMedianSeconds) ? row.timeGapToMedianSeconds : null;
}

/**
 * Maps analysisJson + optional athleteContext to the HyroxRaceCardData shape
 * consumed by raceCardBuilder.
 *
 * @param {object} analysisJson  Full output of hyroxAnalysisEngine.analyseSubmission()
 * @param {object} [athleteContext]  Supplemental athlete/submission context
 * @returns {HyroxRaceCardData}
 */
export function buildHyroxRaceCardData(analysisJson, athleteContext = {}, contract = null) {
  const aj = analysisJson ?? {};
  const scores = aj.scores ?? {};
  const headline = aj.headline ?? {};
  const race = aj.race ?? {};
  const athlete = aj.athlete ?? {};
  const benchmarkContext = aj.benchmarkContext ?? {};
  const timePotential = aj.timePotential ?? {};
  const narrative = ensureHyroxReportContract({ analysisJson: aj, athleteContext, calculatorMode: aj.calculatorMode, contract });
  const opportunity = narrative.sourceOpportunity;
  const penalty = narrative.penalty;
  const comparisonBasis = comparisonLabel(aj);
  const comparisonProfileLabel = buildComparisonProfileLabel(aj);

  // Athlete name — prefer context displayName, then athlete.name
  const athleteName =
    athleteContext.displayName ??
    athleteContext.athleteName ??
    athlete.name ??
    "HYROX Athlete";

  // Finish time formatted
  const finishTime = formatSeconds(race.finishTimeSeconds);

  // Target time (nullable)
  const targetTimeSeconds = narrative.inputFacts?.targetTimeSeconds
    ?? race.targetTimeSeconds
    ?? race.targetFinishTimeSeconds
    ?? athleteContext.targetFinishTimeSeconds
    ?? athleteContext.targetTimeSeconds
    ?? null;
  const targetTime = narrative.inputFacts?.targetTimeDisplay ?? (targetTimeSeconds != null ? formatSeconds(targetTimeSeconds) : null);
  const exactTargetGapSeconds = narrative.targetAssessment?.exactGapSeconds
    ?? (Number.isFinite(race.finishTimeSeconds) && Number.isFinite(targetTimeSeconds)
      ? Math.round(race.finishTimeSeconds - targetTimeSeconds)
      : null);
  const targetGapFormatted = narrative.targetAssessment?.displayGap
    ?? (Number.isFinite(exactTargetGapSeconds)
      ? formatSeconds(Math.abs(exactTargetGapSeconds))
      : null);
  const targetGapSigned = narrative.targetAssessment?.signedDisplayGap
    ?? (Number.isFinite(exactTargetGapSeconds)
      ? formatTimeDelta(exactTargetGapSeconds)
      : null);
  const targetGapTone = narrative.targetAssessment?.status === "ahead"
    ? "positive"
    : narrative.targetAssessment?.status === "behind"
      ? "negative"
      : narrative.targetAssessment?.status === "on_target"
        ? "neutral"
        : Number.isFinite(exactTargetGapSeconds)
          ? exactTargetGapSeconds < 0 ? "positive" : exactTargetGapSeconds > 0 ? "negative" : "neutral"
          : null;

  // Analysis mode — prefer the analysis engine's own calculatorMode (authoritative) when present;
  // fall back to inferring from the comparison basis for callers/fixtures that predate that field.
  const mode = aj.calculatorMode === "analyse" || aj.calculatorMode === "target"
    ? aj.calculatorMode
    : comparisonBasis === "MEDIAN" ? "analyse" : "target";

  // Percentile text from first available comparison option.
  const compOpts = comparisonOptionsArray(benchmarkContext);
  const overall = segment(aj, "total_time");
  const benchmarkPercentilesAvailable = narrative.rankPolicy.allowed;
  const percentileText = narrative.rankPolicy.displays[0]?.label ?? null;
  const confidenceQualifier = benchmarkPercentilesAvailable
    ? benchmarkContext?.confidenceLabel === "insufficient" || benchmarkContext?.doublesBenchmarkedAsSingles === true ? "directional" : null
    : null;

  // Forma Score — use the total-population percentile from comparisonOptions (same source as
  // "TOP N% WORLDWIDE" label) so both figures are always consistent. overallPerformanceScore is
  // benchmarked against the athlete's performance-band peer group in analyse mode, which produces
  // a misleadingly low number (e.g. 40) for a globally top-1% athlete.
  const formaScore = benchmarkPercentilesAvailable
    ? narrative.rankPolicy.displays[0]?.percentile ?? compOpts[0]?.percentile ?? scores.overallPerformanceScore ?? null
    : null;

  // Strongest station / relative split is resolved by the report contract.
  const strengthPolicy = narrative.strengthPolicy ?? {};
  const biggestStrength = strengthPolicy.strength ?? (strengthPolicy.status === "fastest_ahead_split_only" ? strengthPolicy.fastestAheadSplit : null);
  const strongestStation = biggestStrength
	    ? {
	        name: strengthPolicy.displayLabel ?? biggestStrength.label,
        cardHeader: strengthPolicy.status === "fastest_ahead_split_only" ? "Best Relative Split" : "Strongest Station",
	        markdownLabel: strengthPolicy.status === "fastest_ahead_split_only" ? "Best relative split" : "Strongest station",
		        percentile: strengthPolicy.status === "fastest_ahead_split_only"
          ? null
          : biggestStrength.summaryText ?? (strengthPolicy.displayGap ? `Ahead by ${String(strengthPolicy.displayGap).replace(/^-/, "")}` : null),
        caption: strengthPolicy.explanation ?? biggestStrength.dataQualityNote,
        policyStatus: strengthPolicy.status,
      }
    : null;

  // Biggest limiter
  const biggestLimiterData = opportunity.largestFitnessLimiter
    ? { ...opportunity.largestFitnessLimiter, label: displaySegmentLabel(opportunity.largestFitnessLimiter, opportunity.largestFitnessLimiter.label) }
    : null;
  const roxzoneAction = narrative.roxzonePolicy?.action ?? null;
  const headlineGainSeconds =
    timePotential.headlineGainSeconds ?? headline.headlineGainSeconds ?? null;
  const primary = narrative.primaryClaim;
  const primaryIsPenalty = primary?.isPenalty;
  const biggestLimiter = primaryIsPenalty && opportunity.fastestControllableWin
    ? {
        name: opportunity.fastestControllableWin.label,
        potentialGain: formatSeconds(penalty.totalPenaltySeconds),
        rankText: null,
        caption: opportunity.fastestControllableWin.caption,
        isPenalty: true,
      }
    : primary
    ? {
        name: primary.label,
        potentialGain:
          headlineGainSeconds != null ? formatSeconds(Math.abs(headlineGainSeconds)) : Number.isFinite(primary.gainSeconds) ? formatSeconds(Math.abs(primary.gainSeconds)) : null,
        rankText:
          Number.isFinite(primary.gainSeconds)
            ? formatGapWords(primary.gainSeconds)
            : null,
        caption: roxzoneAction?.confidenceText ?? narrative.roxzonePolicy?.requiredCaveat ?? narrative.dataQualityPolicy?.longCaveat ?? null,
        actionText: roxzoneAction?.raceCardCta ?? null,
        actionEvidenceLevel: roxzoneAction?.actionEvidenceLevel ?? null,
        isRoxzone: Boolean(roxzoneAction),
        cardHeader: primary.compactLabel,
        claimStrength: primary.claimStrength,
      }
    : null;
  const penaltySummary = penalty.totalPenaltySeconds >= 60
    ? {
        label: "Penalties",
        value: formatSeconds(penalty.totalPenaltySeconds),
        isDominant: penalty.usePenaltyHero,
        caption: opportunity.fastestControllableWin?.caption ?? null,
      }
    : null;

  // Race split profile: use the canonical rows resolved by the report contract.
  const splitRows = Array.isArray(narrative.splitProfile?.rows) && narrative.splitProfile.rows.length
    ? narrative.splitProfile.rows
    : buildSplitDisplayRows(aj);

  // Doubles flag
  const division = athlete.division ?? athleteContext.division ?? "";
  const isDoubles = isDoublesAnalysisDivision(division);

  return {
    athleteName,
	    finishTime,
	    targetTime,
    targetGapSeconds: exactTargetGapSeconds,
    targetGapFormatted,
    targetGapSigned,
    targetGapTone,
	    percentileText,
    confidenceQualifier,
    formaScore,
    mode,
    comparisonBasis,
    comparisonProfileLabel,
    strongestStation,
    biggestLimiter,
    fastestControllableWin: opportunity.fastestControllableWin
      ? {
          name: opportunity.fastestControllableWin.label,
          potentialGain: formatSeconds(opportunity.fastestControllableWin.timeGapSeconds),
          caption: opportunity.fastestControllableWin.caption,
          isPrimary: opportunity.hasPenaltyDominantOpportunity,
        }
      : null,
    largestFitnessLimiter: biggestLimiterData
      ? {
          name: biggestLimiterData.label,
          potentialGain: Number.isFinite(biggestLimiterData.timeGapSeconds) ? formatSeconds(Math.abs(biggestLimiterData.timeGapSeconds)) : null,
          rankText: Number.isFinite(biggestLimiterData.timeGapSeconds) ? `${formatTimeDelta(biggestLimiterData.timeGapSeconds)} gap` : null,
        }
      : null,
    artifactHeadlineMode: narrative.headlineMode,
    narrative,
    penaltySummary,
    splitRows,
    isDoubles,
  };
}
