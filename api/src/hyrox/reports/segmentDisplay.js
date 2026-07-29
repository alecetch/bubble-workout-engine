import { SEGMENT_MAP } from "../config/segmentMap.js";

const SEGMENT_LABELS = Object.freeze(Object.fromEntries(SEGMENT_MAP.map((segment) => [segment.segmentKey, segment.displayName])));

export function displaySegmentLabel(segmentOrKey = null, fallback = null) {
  const segmentKey = typeof segmentOrKey === "string" ? segmentOrKey : segmentOrKey?.segmentKey;
  const rawLabel = typeof segmentOrKey === "string" ? fallback : segmentOrKey?.label ?? fallback;
  if (segmentKey === "roxzone_time" || /total\s+roxzone\s+time/i.test(String(rawLabel ?? ""))) return "RoxZone";
  if (/^roxzone_\d+$/i.test(String(segmentKey ?? ""))) return String(rawLabel ?? "").replace(/\bRoxzone\b/gi, "RoxZone") || null;
  if (/\broxzone\b/i.test(String(rawLabel ?? ""))) return String(rawLabel).replace(/\bRoxzone\b/gi, "RoxZone");
  if (segmentKey && SEGMENT_LABELS[segmentKey]) return SEGMENT_LABELS[segmentKey];
  return rawLabel ?? null;
}

export function segmentVerb(segmentOrLabel = null) {
  const label = typeof segmentOrLabel === "string"
    ? segmentOrLabel
    : displaySegmentLabel(segmentOrLabel, segmentOrLabel?.label);
  return /^penalties$/i.test(String(label ?? "").trim()) ? "are" : "is";
}

const STATION_LABELS = new Set([
  "SkiErg",
  "Sled Push",
  "Sled Pull",
  "Burpee Broad Jump",
  "Row",
  "Farmers Carry",
  "Sandbag Lunges",
  "Wall Balls",
]);

export function segmentSubject(segmentOrLabel = null, fallback = null) {
  const label = typeof segmentOrLabel === "string"
    ? displaySegmentLabel(null, segmentOrLabel)
    : displaySegmentLabel(segmentOrLabel, segmentOrLabel?.label ?? fallback);
  if (!label) return "This split";
  if (STATION_LABELS.has(label)) return `The ${label} station`;
  return label;
}
