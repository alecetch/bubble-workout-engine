import { formatSecondsToTime } from "../ingestion/timeParser.js";

const FORBIDDEN_REPLACEMENTS = Object.freeze([
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
  const abs = Math.abs(Math.round(Number(n)));
  if (!Number.isFinite(abs)) return null;
  const teens = abs % 100;
  if (teens >= 11 && teens <= 13) return `${abs}th`;
  const remainder = abs % 10;
  const suffix = remainder === 1 ? "st" : remainder === 2 ? "nd" : remainder === 3 ? "rd" : "th";
  return `${abs}${suffix}`;
}

export function formatPercentile(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  if (n >= 50) return `Top ${Math.max(1, Math.round(100 - n))}%`;
  const rounded = Math.round(n);
  return `${rounded}${ordinalSuffix(rounded)} percentile`;
}

export function formatPercentileRank(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return `${rounded}${ordinalSuffix(rounded)} percentile`;
}

export function formatOverallStanding(p) {
  if (p == null) return null;
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  const topPct = Math.max(1, Math.round(100 - n));
  return `Top ${topPct}% overall`;
}

export function bandScoreLabel(percentile) {
  if (!Number.isFinite(Number(percentile))) return null;
  const n = Number(percentile);
  if (n >= 80) return "Strength";
  if (n >= 60) return "Good";
  if (n >= 40) return "On benchmark";
  if (n >= 20) return "Opportunity";
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
  const topPercent = (pct) => Math.max(1, Math.round(100 - pct));

  if (regionalPct < globalPct) {
    return `${regionLabel} events attract a stronger-than-average field - locally, this time ranks you top ${topPercent(regionalPct)}%.`;
  }

  return `Globally, where fields include more established athletes, you'd rank top ${topPercent(globalPct)}%.`;
}
