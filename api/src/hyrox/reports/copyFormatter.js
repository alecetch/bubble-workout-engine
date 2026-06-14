import { formatSecondsToTime } from "../ingestion/timeParser.js";

const FORBIDDEN_REPLACEMENTS = Object.freeze([
  [/\bweakness\b/gi, "limiter"],
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

export function formatPercentile(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return null;
  if (n >= 50) return `Top ${Math.max(1, Math.round(100 - n))}%`;
  return `${Math.round(n)}nd percentile`;
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
