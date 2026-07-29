import { formatSecondsToTime } from "../ingestion/timeParser.js";

const FORBIDDEN_REPLACEMENTS = Object.freeze([
  [/\bTotal Roxzone Time\b/gi, "RoxZone"],
  [/\bRoxzone\b/gi, "RoxZone"],
  [/\bweakness\b/g, "limiter"],
  [/\bfailure\b/gi, "setback"],
  [/\bguaranteed\b/gi, "estimated"],
  [/\bbad performance\b/gi, "challenging result"],
  [/\byou are poor at\b/gi, "your opportunity is"],
]);

export function formatTime(seconds) {
  const n = Number(seconds);
  return Number.isFinite(n) && n >= 0 ? formatSecondsToTime(Math.round(n)) : null;
}

export function formatTimeDiff(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return null;
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${formatTime(Math.abs(n))}`;
}

export function formatPercent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.round(n * 10) / 10}%` : null;
}

function ordinalSuffix(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  const mod10 = n % 10;
  if (mod10 === 1) return "st";
  if (mod10 === 2) return "nd";
  if (mod10 === 3) return "rd";
  return "th";
}

export function formatOrdinal(n) {
  if (n === null || n === undefined || n === "") return null;
  const value = Number(n);
  if (!Number.isFinite(value)) return null;
  const abs = Math.abs(Math.round(value));
  return `${abs}${ordinalSuffix(abs)}`;
}

export function formatPercentile(p) {
  return formatPerformancePercentile(p);
}

export function formatPercentileRank(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return `${formatOrdinal(rounded)} percentile`;
}

export function formatOverallStanding(p) {
  return formatPerformancePercentile(p, { scope: "overall" });
}

export function formatPerformancePercentile(p, { scope = "", uppercase = false } = {}) {
  if (p == null) return null;
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.max(1, Math.min(99, Math.round(n)));
  let text;
  if (n >= 60) {
    text = `Top ${Math.max(1, Math.round(100 - n))}%`;
  } else if (n <= 10) {
    text = `Bottom ${rounded}%`;
  } else if (n >= 40) {
    text = `around the ${formatOrdinal(rounded)} percentile`;
  } else {
    text = `${formatOrdinal(rounded)} percentile`;
  }
  if (scope) text = `${text} ${scope}`;
  return uppercase ? text.toUpperCase() : text;
}

export function bandScoreLabel(gapSeconds, comparisonSeconds = null) {
  if (gapSeconds === null || gapSeconds === undefined || gapSeconds === "") return null;
  const gap = Number(gapSeconds);
  if (!Number.isFinite(gap)) return null;

  const comparison = Number(comparisonSeconds);
  if (Number.isFinite(comparison) && comparison > 0) {
    // Segment difficulty is judged by seconds lost/gained relative to that split's own
    // comparison time. This keeps split labels seconds-based without treating a 20s
    // station gap the same as a 20s aggregate/run gap.
    const ratio = gap / comparison;
    if (ratio <= -0.05) return "Strength";
    if (ratio <= -0.02) return "Good";
    if (ratio <= 0.05) return "On benchmark";
    if (ratio <= 0.15) return "Opportunity";
    return "Priority";
  }

  if (gap <= -30) return "Strength";
  if (gap <= -10) return "Good";
  if (gap <= 30) return "On benchmark";
  if (gap <= 90) return "Opportunity";
  return "Priority";
}

export function bandScoreColor(bsLabel) {
  if (bsLabel === "Priority") return "#e53e3e";
  if (bsLabel === "Strength") return "#16a34a";
  if (bsLabel === "Good") return "#22c55e";
  return "#64748b";
}

export function formatGain(seconds) {
  const n = Math.abs(Number(seconds));
  return Number.isFinite(n) ? formatTime(n) : null;
}

export function label(value) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function enforceTone(text) {
  let output = String(text ?? "");
  for (const [pattern, replacement] of FORBIDDEN_REPLACEMENTS) {
    if (pattern.test(output)) {
      console.warn("[hyrox] forbidden report wording replaced");
      output = output.replace(pattern, replacement);
    }
  }
  return output.replace(/\byou will save\b/gi, "you could save");
}

export function deepEnforceTone(value) {
  if (typeof value === "string") return enforceTone(value);
  if (Array.isArray(value)) return value.map(deepEnforceTone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, deepEnforceTone(child)]));
  }
  return value;
}

export function regionalContextLine(analysisJson) {
  const regional = analysisJson?.benchmarkContext?.regionalBenchmark;
  if (!regional?.available || !Number.isFinite(Number(regional.fieldPercentile))) return null;

  const overall = (analysisJson.segments ?? []).find((segment) => segment.segmentKey === "total_time");
  const globalPct = Number(overall?.fieldPercentile ?? overall?.percentile ?? NaN);
  const regionalPct = Number(regional.fieldPercentile);

  if (!Number.isFinite(globalPct) || !Number.isFinite(regionalPct)) return null;

  const gap = Math.abs(globalPct - regionalPct);
  if (gap < 5) return null;

  const regionLabel = String(regional.regionLabel ?? regional.region ?? "").trim();
  const regionalLabel = formatPerformancePercentile(regionalPct);
  const globalLabel = formatPerformancePercentile(globalPct);

  if (regionalPct < globalPct) {
    return `${regionLabel} events attract a stronger-than-average field - locally, this time ranks ${regionalLabel}.`;
  }

  return `Globally, where fields include more established athletes, you'd rank ${globalLabel}.`;
}

export function ageGroupContextLine(analysisJson) {
  const age = analysisJson?.benchmarkContext?.ageBenchmark;
  if (!age?.available || age.fieldPercentile == null) return null;
  const fieldPercentile = Number(age.fieldPercentile);
  if (!Number.isFinite(fieldPercentile)) return null;
  const group = String(age.ageGroup ?? "").trim();
  if (!group) return null;
  return formatPerformancePercentile(fieldPercentile, { scope: `in your ${group} age group` });
}
