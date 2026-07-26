import { SEGMENT_MAP } from "../config/segmentMap.js";
import { isDoublesAnalysisDivision } from "../config/divisionGroups.js";
import { comparisonLabel, hasGoalGroup } from "./comparisonBasis.js";
import { benchmarkConfidenceQualifier, comparisonOptionsArray, percentileTextWithFallback } from "./comparisonOptions.js";
import { penaltyContext } from "./penaltyContext.js";

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

const RACE_SEGMENTS = SEGMENT_MAP.filter((segment) => segment.type === "run" || segment.type === "station");

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

function strengthGapText(strength) {
  const seconds = Number.isFinite(strength?.timeAdvantageSeconds)
    ? -Math.abs(strength.timeAdvantageSeconds)
    : targetGapSeconds(strength, false);
  if (!Number.isFinite(seconds)) return null;
  if (seconds < 0) return `Ahead by ${formatSeconds(Math.abs(seconds))}`;
  if (seconds > 0) return `+${formatSeconds(seconds)} gap`;
  return "On comparison";
}

/**
 * Maps analysisJson + optional athleteContext to the HyroxRaceCardData shape
 * consumed by raceCardBuilder.
 *
 * @param {object} analysisJson  Full output of hyroxAnalysisEngine.analyseSubmission()
 * @param {object} [athleteContext]  Supplemental athlete/submission context
 * @returns {HyroxRaceCardData}
 */
export function buildHyroxRaceCardData(analysisJson, athleteContext = {}) {
  const aj = analysisJson ?? {};
  const scores = aj.scores ?? {};
  const headline = aj.headline ?? {};
  const race = aj.race ?? {};
  const athlete = aj.athlete ?? {};
  const benchmarkContext = aj.benchmarkContext ?? {};
  const timePotential = aj.timePotential ?? {};
  const penalty = penaltyContext(aj);
  const comparisonBasis = comparisonLabel(aj);

  // Athlete name — prefer context displayName, then athlete.name
  const athleteName =
    athleteContext.displayName ??
    athleteContext.athleteName ??
    athlete.name ??
    "HYROX Athlete";

  // Finish time formatted
  const finishTime = formatSeconds(race.finishTimeSeconds);

  // Target time (nullable)
  const targetTimeSeconds = race.targetTimeSeconds ?? null;
  const targetTime = targetTimeSeconds != null ? formatSeconds(targetTimeSeconds) : null;

  // Analysis mode — prefer the analysis engine's own calculatorMode (authoritative) when present;
  // fall back to inferring from the comparison basis for callers/fixtures that predate that field.
  const mode = aj.calculatorMode === "analyse" || aj.calculatorMode === "target"
    ? aj.calculatorMode
    : comparisonBasis === "MEDIAN" ? "analyse" : "target";

  // Percentile text from first available comparison option.
  const compOpts = comparisonOptionsArray(benchmarkContext);
  const overall = segment(aj, "total_time");
  const percentileText = percentileTextWithFallback(benchmarkContext, overall, athleteContext.overallPercentile);
  const confidenceQualifier = benchmarkConfidenceQualifier(benchmarkContext);

  // Forma Score — use the total-population percentile from comparisonOptions (same source as
  // "TOP N% WORLDWIDE" label) so both figures are always consistent. overallPerformanceScore is
  // benchmarked against the athlete's performance-band peer group in analyse mode, which produces
  // a misleadingly low number (e.g. 40) for a globally top-1% athlete.
  const formaScore = compOpts[0]?.percentile ?? scores.overallPerformanceScore ?? null;

  // Strongest station
  const biggestStrength = headline.biggestStrength ?? null;
  const biggestStrengthSegment = biggestStrength?.segmentKey ? segment(aj, biggestStrength.segmentKey) : null;
  const strongestStationData = biggestStrength
    ? { ...(biggestStrengthSegment ?? {}), ...biggestStrength }
    : null;
  const strongestStation = biggestStrength
    ? {
        name: biggestStrength.label,
        percentile: strengthGapText(strongestStationData),
        caption: null,
      }
    : null;

  // Biggest limiter
  const biggestLimiterData = headline.biggestLimiter ?? null;
  const headlineGainSeconds =
    timePotential.headlineGainSeconds ?? headline.headlineGainSeconds ?? null;
  const biggestLimiter = penalty.usePenaltyHero
    ? {
        name: "Penalties",
        potentialGain: formatSeconds(penalty.totalPenaltySeconds),
        rankText: null,
        caption: "Fastest controllable win",
        isPenalty: true,
      }
    : biggestLimiterData
    ? {
        name: biggestLimiterData.label,
        potentialGain:
          headlineGainSeconds != null ? formatTimeDelta(headlineGainSeconds) : null,
        rankText:
          Number.isFinite(biggestLimiterData.timeGapSeconds)
            ? `${formatTimeDelta(biggestLimiterData.timeGapSeconds)} gap`
            : null,
        caption: null,
      }
    : null;
  const penaltySummary = penalty.totalPenaltySeconds >= 60
    ? {
        label: "Penalties",
        value: formatSeconds(penalty.totalPenaltySeconds),
        isDominant: penalty.usePenaltyHero,
      }
    : null;

  // Race split profile: mirror the carousel "How the race unfolded" flow order.
  const goalAvailable = hasGoalGroup(aj);
  const splitRows = RACE_SEGMENTS.flatMap((mapRow) => {
    const seg = segment(aj, mapRow.segmentKey);
    if (!seg || !Number.isFinite(seg.userSeconds)) return [];
    const gapSeconds = targetGapSeconds(seg, goalAvailable);
    const roundedGap = Number.isFinite(gapSeconds) ? Math.round(gapSeconds) : 0;
    return [{
      key: mapRow.segmentKey,
      label: mapRow.displayName,
      type: mapRow.type,
      raceOrder: mapRow.raceOrder,
      userTime: formatSeconds(seg.userSeconds) ?? "-",
      delta: roundedGap === 0 ? "0:00" : formatTimeDelta(roundedGap),
      tone: roundedGap < 0 ? "positive" : roundedGap > 0 ? "negative" : "neutral",
    }];
  });

  // Doubles flag
  const division = athlete.division ?? athleteContext.division ?? "";
  const isDoubles = isDoublesAnalysisDivision(division);

  return {
    athleteName,
    finishTime,
    targetTime,
    percentileText,
    confidenceQualifier,
    formaScore,
    mode,
    comparisonBasis,
    strongestStation,
    biggestLimiter,
    penaltySummary,
    splitRows,
    isDoubles,
  };
}
