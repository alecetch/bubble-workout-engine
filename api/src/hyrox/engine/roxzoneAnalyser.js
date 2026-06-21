import { ENTRY_KEYS, EXIT_KEYS, ROXZONE_KEYS, STATION_KEYS } from "../config/segmentMap.js";
import { calculateSegmentStats } from "./percentileCalculator.js";

const MAX_REASONABLE_REPLAY_DIFF_SECONDS = 10 * 60;
const DISPLAY_STATIONS = Object.freeze([
  "ski_erg",
  "sled_push",
  "sled_pull",
  "burpee_broad_jump",
  "row",
  "farmers_carry",
  "sandbag_lunges",
  "wall_balls",
]);

function regressionSlope(points) {
  if (points.length < 2) return 0;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const numerator = points.reduce((sum, point) => sum + ((point.x - meanX) * (point.y - meanY)), 0);
  const denominator = points.reduce((sum, point) => sum + ((point.x - meanX) ** 2), 0);
  return denominator ? numerator / denominator : 0;
}

function trendFromSlope(slope) {
  return slope > 2 ? "rising" : slope < -2 ? "falling" : "stable";
}

function stationLabel(stationKey) {
  return String(stationKey ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bErg\b/, "Erg");
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function avg(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function buildScenarioTags({ stationOverhead, entryBreakdown, exitBreakdown, entryTrend, exitTrend, percentile, timeGapToMedianSeconds }) {
  const tags = [];
  const totals = stationOverhead.map((row) => row.totalSeconds);
  const medianTotal = median(totals);
  const worst = stationOverhead[0] ?? null;
  const entryTotal = entryBreakdown.reduce((sum, row) => sum + row.seconds, 0);
  const exitTotal = exitBreakdown.reduce((sum, row) => sum + row.seconds, 0);
  const firstHalf = avg(stationOverhead.filter((row) => row.stationIndex <= 4).map((row) => row.totalSeconds));
  const lateHalf = avg(stationOverhead.filter((row) => row.stationIndex >= 5).map((row) => row.totalSeconds));

  if (worst && medianTotal && worst.totalSeconds >= medianTotal * 2) tags.push("single_outlier");
  if (entryTotal > exitTotal * 1.2) tags.push("entry_led");
  if (exitTotal > entryTotal * 1.2) tags.push("exit_led");
  if (entryTrend === "rising" || exitTrend === "rising" || (firstHalf && lateHalf && lateHalf > firstHalf * 1.35)) tags.push("late_race_drift");
  if ((percentile ?? 100) < 45 || (timeGapToMedianSeconds ?? 0) >= 30) tags.push("high_total_roxzone");
  if ((percentile ?? 0) >= 55 && !tags.includes("single_outlier")) tags.push("controlled_roxzone");
  return tags.length ? tags : ["balanced"];
}

function buildNarrativeCopy({ replayTotalSeconds, officialTotalSeconds, roundingDifferenceSeconds, worstCombined, worstEntry, worstExit, entryTrend, exitTrend, scenarioTags }) {
  const station = stationLabel(worstCombined?.stationKey);
  const hasOfficial = Number.isFinite(officialTotalSeconds);
  const summaryCopy = hasOfficial
    ? `Your Race Replay rows add up to ${replayTotalSeconds}s of measurable RoxZone time, versus ${officialTotalSeconds}s officially.`
    : `Your Race Replay rows add up to ${replayTotalSeconds}s of measurable RoxZone time.`;

  let interpretationCopy = "RoxZone is race execution time: station setup, breathing reset, movement through the zone and leaving stations cleanly under fatigue.";
  if (scenarioTags.includes("single_outlier") && worstCombined) {
    interpretationCopy = `The biggest RoxZone story is around ${station}. That station accounted for the largest entry/exit cost, which suggests it disrupted your race rhythm more than the total alone shows.`;
  } else if (scenarioTags.includes("exit_led") && worstExit) {
    interpretationCopy = `Your longer RoxZone losses came after stations, especially after ${stationLabel(worstExit.stationKey)}. That usually points to recovery debt before you could get moving again.`;
  } else if (scenarioTags.includes("entry_led") && worstEntry) {
    interpretationCopy = `Your bigger leakage came before starting stations, especially before ${stationLabel(worstEntry.stationKey)}. That points to setup, navigation or hesitation before the first rep.`;
  } else if (scenarioTags.includes("late_race_drift")) {
    interpretationCopy = "Your RoxZone execution slowed later in the race, so the issue is less pure logistics and more maintaining race flow under fatigue.";
  } else if (scenarioTags.includes("controlled_roxzone")) {
    interpretationCopy = "Your RoxZone execution was controlled: no station shows a major transition leak, so bigger gains are likely elsewhere.";
  } else if (scenarioTags.includes("high_total_roxzone")) {
    interpretationCopy = "This looks like systemic race-flow leakage rather than one isolated mistake: small delays around multiple stations can add up quickly.";
  }

  let actionCopy = "Rehearse station entry and exit inside compromised HYROX blocks: arrive, locate, hands on, go; then finish and move out without a full reset.";
  if (scenarioTags.includes("single_outlier") && worstCombined) {
    actionCopy = `Prioritise compromised ${station} practice, then rehearse leaving the station immediately so the station does not cost time twice.`;
  } else if (scenarioTags.includes("entry_led")) {
    actionCopy = "Use a simple station-entry script in training: enter, locate, hands on, first rep. The target is removing the pause before work starts.";
  } else if (scenarioTags.includes("exit_led")) {
    actionCopy = "Practise finishing stations and jogging out under high breathing load. The goal is to reduce the recovery pause after the final rep.";
  } else if (scenarioTags.includes("late_race_drift")) {
    actionCopy = "Put transition practice late in longer sessions, after 45-60 minutes of work, so race flow holds when fatigue is highest.";
  }

  const caveatCopy = Number.isFinite(roundingDifferenceSeconds)
    ? "Race Replay checkpoint rows are rounded before summing, so the station-by-station total may differ by a few seconds from the official RoxZone total."
    : null;

  return { summaryCopy, interpretationCopy, actionCopy, caveatCopy };
}

function buildRoxzoneNarrative({ entryExit, totalSeconds, percentile, timeGapToMedianSeconds }) {
  const stationOverhead = Array.isArray(entryExit.stationOverhead) ? entryExit.stationOverhead : [];
  if (!entryExit.entryExitAvailable || stationOverhead.length === 0) return null;
  const hasClockContamination = [...(entryExit.entryBreakdown ?? []), ...(entryExit.exitBreakdown ?? [])]
    .some((row) => row.seconds > MAX_REASONABLE_REPLAY_DIFF_SECONDS);
  if (hasClockContamination) {
    return {
      available: false,
      confidence: "low",
      reason: "clock_value_contamination",
    };
  }

  const replayTotalSeconds = stationOverhead.reduce((sum, row) => sum + row.totalSeconds, 0);
  const roundingDifferenceSeconds = Number.isFinite(totalSeconds) ? totalSeconds - replayTotalSeconds : null;
  const confidence = Math.abs(roundingDifferenceSeconds ?? 0) > 10 ? "partial" : "high";
  const rowsByStation = new Map(stationOverhead.map((row) => [row.stationKey, row]));
  const displayRows = DISPLAY_STATIONS.map((stationKey) => {
    const row = rowsByStation.get(stationKey);
    return {
      stationKey,
      label: stationLabel(stationKey),
      entrySeconds: row?.entrySeconds ?? null,
      exitSeconds: row?.exitSeconds ?? null,
      roxzoneSeconds: row?.totalSeconds ?? null,
      measurable: Boolean(row),
    };
  });
  const scenarioTags = buildScenarioTags({
    stationOverhead,
    entryBreakdown: entryExit.entryBreakdown ?? [],
    exitBreakdown: entryExit.exitBreakdown ?? [],
    entryTrend: entryExit.entryTrend,
    exitTrend: entryExit.exitTrend,
    percentile,
    timeGapToMedianSeconds,
  });
  const copy = buildNarrativeCopy({
    replayTotalSeconds,
    officialTotalSeconds: totalSeconds,
    roundingDifferenceSeconds,
    worstCombined: stationOverhead[0] ?? null,
    worstEntry: entryExit.worstEntry ?? null,
    worstExit: entryExit.worstExit ?? null,
    entryTrend: entryExit.entryTrend,
    exitTrend: entryExit.exitTrend,
    scenarioTags,
  });

  return {
    available: true,
    replayTotalSeconds,
    officialTotalSeconds: Number.isFinite(totalSeconds) ? totalSeconds : null,
    roundingDifferenceSeconds,
    measurableStationCount: stationOverhead.length,
    displayStationCount: DISPLAY_STATIONS.length,
    worstCombined: stationOverhead[0] ?? null,
    worstEntry: entryExit.worstEntry ?? null,
    worstExit: entryExit.worstExit ?? null,
    entryTrend: entryExit.entryTrend,
    exitTrend: entryExit.exitTrend,
    scenarioTags,
    confidence,
    displayRows,
    ...copy,
  };
}

function buildEntryExitAnalysis(normalisedSubmission) {
  const entryBreakdown = ENTRY_KEYS
    .map((key, index) => ({ stationKey: STATION_KEYS[index], stationIndex: index + 1, seconds: normalisedSubmission.splitMap?.get(key)?.timeSeconds ?? null }))
    .filter((entry) => entry.seconds !== null);
  const exitBreakdown = EXIT_KEYS
    .map((key, index) => ({ stationKey: STATION_KEYS[index], stationIndex: index + 1, seconds: normalisedSubmission.splitMap?.get(key)?.timeSeconds ?? null }))
    .filter((exit) => exit.seconds !== null);
  if (!entryBreakdown.length && !exitBreakdown.length) return { entryExitAvailable: false };
  const entrySlope = regressionSlope(entryBreakdown.map((entry) => ({ x: entry.stationIndex, y: entry.seconds })));
  const exitSlope = regressionSlope(exitBreakdown.map((exit) => ({ x: exit.stationIndex, y: exit.seconds })));
  const entryTrend = trendFromSlope(entrySlope);
  const exitTrend = trendFromSlope(exitSlope);
  const exitByStation = new Map(exitBreakdown.map((exit) => [exit.stationKey, exit]));
  const stationOverhead = entryBreakdown
    .map((entry) => {
      const exit = exitByStation.get(entry.stationKey);
      return exit ? { stationKey: entry.stationKey, stationIndex: entry.stationIndex, entrySeconds: entry.seconds, exitSeconds: exit.seconds, totalSeconds: entry.seconds + exit.seconds } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
  return {
    entryExitAvailable: true,
    entryBreakdown,
    exitBreakdown,
    entryTrend,
    exitTrend,
    worstEntry: [...entryBreakdown].sort((a, b) => b.seconds - a.seconds)[0] ?? null,
    worstExit: [...exitBreakdown].sort((a, b) => b.seconds - a.seconds)[0] ?? null,
    stationOverhead,
  };
}

export function analyseRoxzone(normalisedSubmission, benchmarkContext) {
  const entryExit = buildEntryExitAnalysis(normalisedSubmission);
  if (normalisedSubmission.roxzoneMode === "none" || !Number.isFinite(normalisedSubmission.roxzoneTimeSeconds)) {
    return { available: false, ...entryExit };
  }

  const aggregate = calculateSegmentStats(normalisedSubmission, benchmarkContext)
    .find((segment) => segment.segmentKey === "roxzone_time");
  const percentOfTotalTime = normalisedSubmission.race?.finishTimeSeconds
    ? normalisedSubmission.roxzoneTimeSeconds / normalisedSubmission.race.finishTimeSeconds
    : null;

  if (normalisedSubmission.roxzoneMode === "inferred_total") {
    const roxzoneNarrative = buildRoxzoneNarrative({
      entryExit,
      totalSeconds: normalisedSubmission.roxzoneTimeSeconds,
      percentile: aggregate?.percentile ?? null,
      timeGapToMedianSeconds: aggregate?.timeGapToMedianSeconds ?? null,
    });
    return {
      available: true,
      mode: "inferred_total",
      totalSeconds: normalisedSubmission.roxzoneTimeSeconds,
      percentOfTotalTime,
      percentile: aggregate?.percentile ?? null,
      timeGapToMedianSeconds: aggregate?.timeGapToMedianSeconds ?? null,
      segmentAnalysisAvailable: false,
      segmentBreakdown: null,
      worstTransition: null,
      roxzoneNarrative,
      ...entryExit,
    };
  }

  const breakdown = calculateSegmentStats(normalisedSubmission, benchmarkContext)
    .filter((segment) => ROXZONE_KEYS.includes(segment.segmentKey));
  const worstTransition = [...breakdown]
    .filter((segment) => Number.isFinite(segment.timeGapToMedianSeconds))
    .sort((a, b) => b.timeGapToMedianSeconds - a.timeGapToMedianSeconds)[0] ?? null;

  const roxzoneNarrative = buildRoxzoneNarrative({
    entryExit,
    totalSeconds: normalisedSubmission.roxzoneTimeSeconds,
    percentile: aggregate?.percentile ?? null,
    timeGapToMedianSeconds: aggregate?.timeGapToMedianSeconds ?? null,
  });

  return {
    available: true,
    mode: "explicit_splits",
    totalSeconds: normalisedSubmission.roxzoneTimeSeconds,
    percentOfTotalTime,
    percentile: aggregate?.percentile ?? null,
    timeGapToMedianSeconds: aggregate?.timeGapToMedianSeconds ?? null,
    segmentAnalysisAvailable: true,
    segmentBreakdown: breakdown,
    worstTransition,
    roxzoneNarrative,
    ...entryExit,
  };
}
