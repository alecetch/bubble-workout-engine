import { SEGMENT_MAP } from "../config/segmentMap.js";

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

function ordinalRank(percentile) {
  if (!Number.isFinite(percentile)) return null;
  const n = Math.round(percentile);
  const mod100 = n % 100;
  const mod10 = n % 10;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? "th"
    : mod10 === 1 ? "st"
    : mod10 === 2 ? "nd"
    : mod10 === 3 ? "rd"
    : "th";
  return `${n}${suffix} percentile`;
}

const RACE_SEGMENTS = SEGMENT_MAP.filter((segment) => segment.type === "run" || segment.type === "station");

function segment(analysisJson, key) {
  return analysisJson.segments?.find((row) => row.segmentKey === key) ?? null;
}

function hasGoalGroup(analysisJson) {
  return Boolean(analysisJson.benchmarkContext?.goalBenchmarkGroup);
}

function targetGapSeconds(row, goalAvailable) {
  if (Number.isFinite(row?.timeGapToExactTargetSeconds)) return row.timeGapToExactTargetSeconds;
  if (goalAvailable && Number.isFinite(row?.goalBenchmarkSeconds) && Number.isFinite(row?.userSeconds)) {
    return row.userSeconds - row.goalBenchmarkSeconds;
  }
  if (Number.isFinite(row?.frameGapSeconds)) return row.frameGapSeconds;
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
export function buildHyroxRaceCardData(analysisJson, athleteContext = {}) {
  const aj = analysisJson ?? {};
  const scores = aj.scores ?? {};
  const headline = aj.headline ?? {};
  const race = aj.race ?? {};
  const athlete = aj.athlete ?? {};
  const benchmarkContext = aj.benchmarkContext ?? {};
  const timePotential = aj.timePotential ?? {};

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

  // Analysis mode
  const mode = targetTimeSeconds != null ? "target" : "analyse";

  // Percentile text from first available comparison option.
  // comparisonOptions may be a flat array (test fixtures) or { defaultId, options: [] } (engine output).
  const compOpts = Array.isArray(benchmarkContext.comparisonOptions)
    ? benchmarkContext.comparisonOptions
    : Array.isArray(benchmarkContext.comparisonOptions?.options)
      ? benchmarkContext.comparisonOptions.options
      : [];
  const primaryComp = compOpts[0] ?? null;
  const percentileText =
    primaryComp?.topPercent != null ? `TOP ${primaryComp.topPercent}% WORLDWIDE` : null;

  // Forma Score — use the total-population percentile from comparisonOptions (same source as
  // "TOP N% WORLDWIDE" label) so both figures are always consistent. overallPerformanceScore is
  // benchmarked against the athlete's performance-band peer group in analyse mode, which produces
  // a misleadingly low number (e.g. 40) for a globally top-1% athlete.
  const formaScore = compOpts[0]?.percentile ?? scores.overallPerformanceScore ?? null;

  // Strongest station
  const biggestStrength = headline.biggestStrength ?? null;
  const strongestStation = biggestStrength
    ? {
        name: biggestStrength.label,
        percentile:
          biggestStrength.percentile != null
            ? `Top ${Math.max(1, Math.round(100 - biggestStrength.percentile))}%`
            : null,
        caption: null,
      }
    : null;

  // Biggest limiter
  const biggestLimiterData = headline.biggestLimiter ?? null;
  const headlineGainSeconds =
    timePotential.headlineGainSeconds ?? headline.headlineGainSeconds ?? null;
  const biggestLimiter = biggestLimiterData
    ? {
        name: biggestLimiterData.label,
        potentialGain:
          headlineGainSeconds != null ? formatTimeDelta(headlineGainSeconds) : null,
        rankText:
          biggestLimiterData.percentile != null
            ? ordinalRank(biggestLimiterData.percentile)
            : null,
        caption: null,
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
      userTime: formatSeconds(seg.userSeconds) ?? "-",
      delta: roundedGap === 0 ? "0:00" : formatTimeDelta(roundedGap),
      tone: roundedGap < 0 ? "positive" : roundedGap > 0 ? "negative" : "neutral",
    }];
  });

  // Doubles flag
  const division = String(
    athlete.division ?? athleteContext.division ?? "",
  ).toLowerCase();
  const isDoubles = division.startsWith("doubles");

  return {
    athleteName,
    finishTime,
    targetTime,
    percentileText,
    formaScore,
    mode,
    strongestStation,
    biggestLimiter,
    splitRows,
    isDoubles,
  };
}
