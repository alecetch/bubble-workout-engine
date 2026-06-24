import { parse } from "csv-parse/sync";

export const SPLIT_KEYS = [
  "run_1",
  "skierg",
  "run_2",
  "sled_push",
  "run_3",
  "sled_pull",
  "run_4",
  "burpee_bj",
  "run_5",
  "row",
  "run_6",
  "farmers_carry",
  "run_7",
  "sandbag_lunge",
  "run_8",
  "wall_balls",
];

const REQUIRED_COLUMNS = ["rank", "athlete_name", "finish_time"];

function parseTime(str) {
  const text = String(str ?? "").trim();
  if (!text) return null;
  const parts = text.split(":").map((part) => part.trim());
  if (![2, 3].includes(parts.length)) return null;
  if (!parts.every((part) => /^\d+$/.test(part))) return null;
  const nums = parts.map(Number);
  if (parts.length === 2) {
    const [m, s] = nums;
    if (s > 59) return null;
    return m * 60 + s;
  }
  const [h, m, s] = nums;
  if (m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
}

function normaliseHandle(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  return text.startsWith("@") ? text : `@${text}`;
}

function validateTimeRange(label, seconds, warnings, rowNumber) {
  if (seconds != null && (seconds < 30 || seconds > 1800)) {
    warnings.push(`Row ${rowNumber}: ${label} time ${seconds}s is outside 30s-1800s`);
  }
}

export function parseRaceResultsCsv(csvText, division = "open", sex = "male") {
  const warnings = [];
  const records = parse(csvText, {
    columns: (headers) => headers.map((header) => String(header).trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });
  const columns = records.length ? Object.keys(records[0]) : parse(csvText, { to_line: 1, trim: true, bom: true })[0]?.map((h) => String(h).trim().toLowerCase()) ?? [];
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(", ")}`);

  const seenRanks = new Set();
  const rows = records.map((record, index) => {
    const rowNumber = index + 2;
    const rank = Number.parseInt(String(record.rank ?? "").trim(), 10);
    const hasRank = Number.isFinite(rank);
    if (hasRank) {
      if (seenRanks.has(rank)) warnings.push(`Duplicate rank: ${rank}`);
      seenRanks.add(rank);
    }

    const finishTimeSeconds = parseTime(record.finish_time);
    if (hasRank && finishTimeSeconds == null) {
      throw new Error(`Row ${rowNumber}: finish_time is unparseable`);
    }

    const roxzoneSeconds = parseTime(record.roxzone_time);
    if (record.roxzone_time && roxzoneSeconds == null) warnings.push(`Row ${rowNumber}: roxzone_time is unparseable`);
    validateTimeRange("roxzone_time", roxzoneSeconds, warnings, rowNumber);

    const splits = {};
    for (const key of SPLIT_KEYS) {
      const raw = record[key];
      const parsed = parseTime(raw);
      if (raw && parsed == null) warnings.push(`Row ${rowNumber}: ${key} is unparseable`);
      validateTimeRange(key, parsed, warnings, rowNumber);
      splits[key] = parsed;
    }

    const splitSum = Object.values(splits).reduce((sum, value) => sum + (value ?? 0), roxzoneSeconds ?? 0);
    if (finishTimeSeconds != null && splitSum > finishTimeSeconds) {
      warnings.push(`Row ${rowNumber}: split sum exceeds finish time`);
    }

    return {
      rank,
      name: String(record.athlete_name ?? "").trim(),
      instagramHandle: normaliseHandle(record.instagram_handle),
      finishTimeSeconds,
      roxzoneSeconds,
      splits,
      division,
      sex,
    };
  });

  return { rows, warnings };
}

export const __testables = { parseTime };
