import { formatGain, formatPercentile, formatTime } from "./copyFormatter.js";
import { SEGMENT_MAP } from "../config/segmentMap.js";
import { hasGoalGroup } from "./comparisonBasis.js";

const TRANSITION_TIPS = Object.freeze([
  "Ways to cut transition time without adding training load:",
  "1. Move directly from the run exit to your station mat - do not stop or slow down in the corridor.",
  "2. Memorise your station number before the race so you arrive with purpose, not searching.",
  "3. Begin station setup while still moving - gloves, chalk or straps should be grabbed in motion.",
  "4. Use the final 50m of each run to settle your breathing so you arrive at the station ready to work.",
  "5. In training, practise going straight into a station exercise at the end of a hard run effort.",
]);

const PRO_ROXZONE_NOTE = "For context, pro athletes typically complete all transitions in around 3-4 minutes — a reminder of how much headroom exists to improve through race rehearsal alone, without adding training load.";

const NEAR_MEDIAN_GAP_SECONDS = 30;
const SEGMENT_LABELS = new Map(SEGMENT_MAP.map((segment) => [segment.segmentKey, segment.displayName]));

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function percentOfTotal(rox) {
  return rox.percentOfTotalTime != null ? Math.round(rox.percentOfTotalTime * 100) : null;
}

function targetGapForRoxzone(rox, roxSegment) {
  return Number.isFinite(roxSegment?.timeGapToExactTargetSeconds)
    ? roxSegment.timeGapToExactTargetSeconds
    : rox.timeGapToMedianSeconds;
}

function stationLabel(stationKey) {
  return SEGMENT_LABELS.get(stationKey) ?? String(stationKey ?? "").replace(/_/g, " ");
}

function secondaryCombinedLine(combined, namedStationKey) {
  if (!combined || combined.stationKey === namedStationKey) return null;
  return `Separately, your biggest combined entry+exit overhead was at ${stationLabel(combined.stationKey)}: ${formatTime(combined.totalSeconds)} total (${formatTime(combined.entrySeconds)} in, ${formatTime(combined.exitSeconds)} out).`;
}

function entryExitLines(rox) {
  if (!rox.entryExitAvailable) return [];
  const lines = [];
  const combined = Array.isArray(rox.stationOverhead) ? rox.stationOverhead[0] : null;
  const scenarioTags = rox.roxzoneNarrative?.scenarioTags ?? [];
  const worstEntry = rox.worstEntry ?? null;
  const worstExit = rox.worstExit ?? null;

  // The interpretation copy names a specific station (worst single exit/entry) when
  // exit_led or entry_led fires — the illustrative number here must match that same
  // station, not silently default to the worst *combined* station, which can differ.
  if (scenarioTags.includes("exit_led") && worstExit) {
    lines.push(`${stationLabel(worstExit.stationKey)} exit: ${formatTime(worstExit.seconds)} — the slowest single exit of the race.`);
    const secondary = secondaryCombinedLine(combined, worstExit.stationKey);
    if (secondary) lines.push(secondary);
  } else if (scenarioTags.includes("entry_led") && worstEntry) {
    lines.push(`${stationLabel(worstEntry.stationKey)} entry: ${formatTime(worstEntry.seconds)} — the slowest single entry of the race.`);
    const secondary = secondaryCombinedLine(combined, worstEntry.stationKey);
    if (secondary) lines.push(secondary);
  } else if (combined) {
    lines.push(`${stationLabel(combined.stationKey)}: ${formatTime(combined.totalSeconds)} combined (${formatTime(combined.entrySeconds)} in, ${formatTime(combined.exitSeconds)} out).`);
  } else {
    if (worstEntry) lines.push(`Race replay detail: your slowest station entry was ${stationLabel(worstEntry.stationKey)} at ${formatTime(worstEntry.seconds)}.`);
    if (worstExit) lines.push(`Race replay detail: your slowest station exit was ${stationLabel(worstExit.stationKey)} at ${formatTime(worstExit.seconds)}.`);
  }

  if (rox.entryTrend === "rising") {
    lines.push("Station entries also got progressively slower as the race went on — typically a sign of setup friction or breathing reset under fatigue.");
  }
  return lines;
}

function buildNarrativeSection(rox, onBenchmarkNote = null) {
  const narrative = rox.roxzoneNarrative;
  if (!narrative?.available) return null;
  return [
    ...(onBenchmarkNote ? [onBenchmarkNote] : []),
    narrative.interpretationCopy,
    narrative.actionCopy,
    ...entryExitLines(rox),
    ...(narrative.caveatCopy ? [narrative.caveatCopy] : []),
    { __type: "roxzone_narrative", ...narrative },
  ];
}

function buildInferredSection(rox, roxSegment, onBenchmarkNote = null) {
  const narrativeSection = buildNarrativeSection(rox, onBenchmarkNote);
  if (narrativeSection) return narrativeSection;

  const percentile = finiteNumber(rox.percentile);
  const pctOfTotal = percentOfTotal(rox);
  const targetGap = targetGapForRoxzone(rox, roxSegment);
  const lines = [
    pctOfTotal != null
      ? `Your estimated transition time of ${formatTime(rox.totalSeconds)} is approximately ${pctOfTotal}% of your total race time.`
      : `Your estimated transition time is ${formatTime(rox.totalSeconds)}.`,
  ];

  if (percentile >= 55) {
    lines.push("Against comparable athletes this is efficient - your transitions are not a meaningful drag on your result.");
    lines.push(PRO_ROXZONE_NOTE);
  } else if (percentile >= 45) {
    lines.push("Against comparable athletes this is around the median transition time. Transitions are a no-training-load opportunity — consistent race rehearsal can move you well above the median here.");
    lines.push(PRO_ROXZONE_NOTE);
  } else if (percentile != null) {
    const isNearMedian = Number.isFinite(targetGap) && Math.abs(targetGap) < NEAR_MEDIAN_GAP_SECONDS;
    if (isNearMedian) {
      lines.push(`Against comparable athletes your transition time is right around the median — you are not meaningfully behind your benchmark band here.`);
      lines.push(`That said, transitions are a low-investment area where race rehearsal pays dividends. ${PRO_ROXZONE_NOTE}`);
    } else {
      lines.push(`Against comparable athletes this places you around the ${formatPercentile(percentile)}, approximately ${formatGain(targetGap)} above the median. Transitions are a low-risk efficiency opportunity — no extra training load required.`);
      lines.push(PRO_ROXZONE_NOTE);
    }
    lines.push(...TRANSITION_TIPS);
  } else {
    lines.push("A percentile comparison is not available for this result.");
  }

  if (!rox.entryExitAvailable) {
    lines.push("Note: transition time is estimated from unallocated race time - the engine cannot directly measure individual transitions.");
  }
  lines.push(...entryExitLines(rox));
  return lines;
}

function buildExplicitSection(rox, roxSegment, onBenchmarkNote = null) {
  const narrativeSection = buildNarrativeSection(rox, onBenchmarkNote);
  if (narrativeSection) return narrativeSection;

  const percentile = finiteNumber(rox.percentile);
  const pctOfTotal = percentOfTotal(rox);
  const targetGap = targetGapForRoxzone(rox, roxSegment);
  const lines = [
    pctOfTotal != null
      ? `Your total transition time was ${formatTime(rox.totalSeconds)} - ${pctOfTotal}% of your race time.`
      : `Your total transition time was ${formatTime(rox.totalSeconds)}.`,
  ];

  if (percentile >= 55) {
    lines.push(`Against comparable athletes your transitions are efficient - the ${formatPercentile(percentile)} shows this is a strength area.`);
    lines.push(PRO_ROXZONE_NOTE);
  } else if (percentile >= 45) {
    lines.push("Against comparable athletes this is around the median transition time. Transitions are a no-training-load opportunity — consistent race rehearsal can move you well above the median here.");
    lines.push(PRO_ROXZONE_NOTE);
  } else if (percentile != null) {
    const isNearMedian = Number.isFinite(targetGap) && Math.abs(targetGap) < NEAR_MEDIAN_GAP_SECONDS;
    if (isNearMedian) {
      lines.push(`Against comparable athletes your transition time is right around the median — you are not meaningfully behind your benchmark band here.`);
      lines.push(`That said, transitions are a low-investment area where race rehearsal pays dividends. ${PRO_ROXZONE_NOTE}`);
    } else {
      lines.push(`Against comparable athletes this places you at the ${formatPercentile(percentile)}, approximately ${formatGain(targetGap)} above the median.`);
      if (rox.worstTransition && finiteNumber(rox.worstTransition.timeGapToMedianSeconds) >= 20) {
        lines.push(`Your slowest individual transition was ${rox.worstTransition.label} - approximately ${formatGain(rox.worstTransition.timeGapToMedianSeconds)} above the median for that station.`);
      }
      lines.push(PRO_ROXZONE_NOTE);
    }
    lines.push(...TRANSITION_TIPS);
  } else {
    lines.push("A percentile comparison is not available for this result.");
  }

  lines.push(...entryExitLines(rox));
  return lines;
}

const ON_BENCHMARK_THRESHOLD_S = 30;

function targetModeForRoxzoneSection(analysisJson = {}, calculatorMode = null) {
  return calculatorMode === "target"
    || analysisJson.calculatorMode === "target"
    || hasGoalGroup(analysisJson);
}

function onBenchmarkNote(roxSegment, rox, isTargetMode = false) {
  const frameGap = finiteNumber(roxSegment?.frameGapSeconds) ?? finiteNumber(rox.timeGapToMedianSeconds);
  if (frameGap === null || Math.abs(frameGap) > ON_BENCHMARK_THRESHOLD_S) return null;
  if (isTargetMode) {
    return frameGap <= 0
      ? "Your overall transition time was ahead of target - the detail below is worth monitoring but did not cost you time here."
      : "Your overall transition time was on target - the detail below shows where time was distributed within that.";
  }
  return frameGap <= 0
    ? "Your overall transition time was ahead of the benchmark — the detail below is worth monitoring but did not cost you time here."
    : "Your overall transition time was on benchmark — the detail below shows where time was distributed within that.";
}

export function buildRoxzoneSection(analysisJson = {}, options = {}) {
  const rox = analysisJson.roxzoneAnalysis ?? {};
  const roxSegment = (analysisJson.segments ?? []).find((segment) => segment.segmentKey === "roxzone_time") ?? null;
  const isTargetMode = targetModeForRoxzoneSection(analysisJson, options.calculatorMode);

  if (!rox.available) {
    return "No transition time data was available for this result.";
  }

  const benchmarkNote = onBenchmarkNote(roxSegment, rox, isTargetMode);

  if (rox.mode === "inferred_total") {
    const content = buildInferredSection(rox, roxSegment, benchmarkNote);
    if (rox.roxzoneNarrative?.available) {
      return content;
    }
    const inferredNote = "RoxZone time shown is estimated from unallocated race time and should be treated as directional.";
    return Array.isArray(content) ? [inferredNote, ...content] : [inferredNote, content].filter(Boolean);
  }

  return buildExplicitSection(rox, roxSegment, benchmarkNote);
}
