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

const AGGREGATE_KEYS = new Set(["run_time", "work_time", "roxzone_time", "total_time"]);

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

  // Split rows: runs and stations only, sorted by |frameGapSeconds| desc, capped at 10
  const segments = Array.isArray(aj.segments) ? aj.segments : [];
  const splitRows = segments
    .filter(
      (seg) =>
        (seg.type === "run" || seg.type === "station") &&
        !AGGREGATE_KEYS.has(seg.segmentKey) &&
        Number.isFinite(seg.frameGapSeconds),
    )
    .sort((a, b) => Math.abs(b.frameGapSeconds) - Math.abs(a.frameGapSeconds))
    .slice(0, 10)
    .map((seg) => ({
      key: seg.segmentKey,
      label: seg.label,
      userTime: formatSeconds(seg.userSeconds) ?? "-",
      delta: formatTimeDelta(seg.frameGapSeconds) ?? "0:00",
      tone: seg.frameGapSeconds < 0 ? "positive" : seg.frameGapSeconds > 0 ? "negative" : "neutral",
    }));

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
