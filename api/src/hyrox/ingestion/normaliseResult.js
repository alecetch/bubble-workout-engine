import { SEGMENT_MAP } from "../config/segmentMap.js";
import { parseTimeToSeconds } from "./timeParser.js";

const AGGREGATE_TIME_FIELDS = Object.freeze(["total_time", "work_time", "roxzone_time", "run_time"]);

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null") return null;
  return text;
}

function normaliseGender(value) {
  const text = cleanText(value)?.toLowerCase();
  if (["m", "male", "men", "mens", "man"].includes(text)) return "male";
  if (["f", "female", "women", "womens", "woman"].includes(text)) return "female";
  return "unknown";
}

function normaliseDivision(value) {
  const text = cleanText(value)?.toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  if (["open", "individual_open", "single_open"].includes(text)) return "open";
  if (["pro", "professional", "individual_pro", "single_pro"].includes(text)) return "pro";
  if (["doubles", "double", "mens_doubles", "womens_doubles"].includes(text)) return "doubles";
  if (["mixed", "mixed_doubles", "mixed_double"].includes(text)) return "mixed_doubles";
  if (["relay", "team_relay"].includes(text)) return "relay";
  if (["goruck", "go_ruck"].includes(text)) return "goruck";
  if (["goruck_doubles", "go_ruck_doubles", "goruck_double"].includes(text)) return "goruck_doubles";
  return "unknown";
}

function normaliseAgeGroup(value) {
  const text = cleanText(value);
  if (!text) return "unknown";
  const lower = text.toLowerCase().replace(/\s+/g, "").replace(/[–—]/g, "-");

  const broad = new Map([
    ["30-39", "broad_30_39"],
    ["40-49", "broad_40_49"],
    ["50-59", "broad_50_59"],
    ["under40", "broad_under_40"],
    ["u40", "broad_under_40"],
    ["<40", "broad_under_40"],
    ["40+", "broad_40_plus"],
  ]);
  if (broad.has(lower)) return broad.get(lower);

  if (/^(16|17|18|19|20|21|22|23|24)$/.test(lower)) return "16-24";
  const match = lower.match(/^(\d{2})-(\d{2})$/);
  if (match) {
    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2], 10);
    if (start === 16 && end === 24) return "16-24";
    if (start >= 25 && start <= 65 && end === start + 4) return `${start}-${end}`;
  }
  if (lower === "70+" || lower === "70plus" || lower === "70") return "70+";
  return "unknown";
}

export function normaliseResult(rawRow, options = {}) {
  const parsedTimes = {};
  for (const field of AGGREGATE_TIME_FIELDS) {
    parsedTimes[field] = parseTimeToSeconds(rawRow?.[field]);
  }

  const segments = {};
  for (const segment of SEGMENT_MAP) {
    segments[segment.segmentKey] = {
      rawField: segment.rawField,
      segmentKey: segment.segmentKey,
      type: segment.type,
      displayName: segment.displayName,
      raceOrder: segment.raceOrder,
      seconds: parseTimeToSeconds(rawRow?.[segment.rawField]),
    };
  }

  return {
    rowNumber: options.rowNumber ?? null,
    sourceFile: options.sourceFile ?? null,
    raw: rawRow,
    event_id: cleanText(rawRow?.event_id),
    event_name: cleanText(rawRow?.event_name),
    gender: normaliseGender(rawRow?.gender),
    raw_gender: cleanText(rawRow?.gender),
    nationality: cleanText(rawRow?.nationality),
    age_group: normaliseAgeGroup(rawRow?.age_group),
    raw_age_group: cleanText(rawRow?.age_group),
    division: normaliseDivision(rawRow?.division),
    raw_division: cleanText(rawRow?.division),
    total_time_seconds: parsedTimes.total_time,
    run_time_seconds: parsedTimes.run_time,
    work_time_seconds: parsedTimes.work_time,
    roxzone_time_seconds: parsedTimes.roxzone_time,
    segments,
    parsedTimes,
  };
}

export const normaliseCanonicalFields = Object.freeze({
  normaliseGender,
  normaliseDivision,
  normaliseAgeGroup,
});
