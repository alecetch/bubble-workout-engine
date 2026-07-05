const SPLITS = [
  { segmentKey: "run_1", label: "Run 1", type: "run", index: 1, patterns: [/^(running|run)\s*1$/i] },
  { segmentKey: "ski_erg", label: "SkiErg", type: "station", index: 2, patterns: [/^ski\s*-?\s*erg$/i] },
  { segmentKey: "run_2", label: "Run 2", type: "run", index: 3, patterns: [/^(running|run)\s*2$/i] },
  { segmentKey: "sled_push", label: "Sled Push", type: "station", index: 4, patterns: [/^sled\s+push$/i] },
  { segmentKey: "run_3", label: "Run 3", type: "run", index: 5, patterns: [/^(running|run)\s*3$/i] },
  { segmentKey: "sled_pull", label: "Sled Pull", type: "station", index: 6, patterns: [/^sled\s+pull$/i] },
  { segmentKey: "run_4", label: "Run 4", type: "run", index: 7, patterns: [/^(running|run)\s*4$/i] },
  { segmentKey: "burpee_broad_jump", label: "Burpee Broad Jump", type: "station", index: 8, patterns: [/^burpee\s+broad\s+jump$/i] },
  { segmentKey: "run_5", label: "Run 5", type: "run", index: 9, patterns: [/^(running|run)\s*5$/i] },
  { segmentKey: "row", label: "Row", type: "station", index: 10, patterns: [/^row(ing)?$/i] },
  { segmentKey: "run_6", label: "Run 6", type: "run", index: 11, patterns: [/^(running|run)\s*6$/i] },
  { segmentKey: "farmers_carry", label: "Farmers Carry", type: "station", index: 12, patterns: [/^farmers?\s+carry$/i] },
  { segmentKey: "run_7", label: "Run 7", type: "run", index: 13, patterns: [/^(running|run)\s*7$/i] },
  { segmentKey: "sandbag_lunges", label: "Sandbag Lunges", type: "station", index: 14, patterns: [/^sandbag\s+lunges$/i] },
  { segmentKey: "run_8", label: "Run 8", type: "run", index: 15, patterns: [/^(running|run)\s*8$/i] },
  { segmentKey: "wall_balls", label: "Wall Balls", type: "station", index: 16, patterns: [/^(wall\s+balls|100\s+wall\s+balls)$/i] },
];

const STATION_BY_NUMBER = ["ski_erg", "sled_push", "sled_pull", "burpee_broad_jump", "row", "farmers_carry", "sandbag_lunges", "wall_balls"];

function emptyResult() {
  return { success: false, confidence: "low", splits: [], roxzoneSeconds: null, finishTimeSeconds: null, penalties: [], athleteName: null, ageGroup: null, raceName: null, division: null, warnings: [] };
}

function parseHms(value) {
  const str = String(value ?? "");
  // H:MM:SS or HH:MM:SS
  const long = str.match(/\b(\d{1,2}):([0-5]\d):([0-5]\d)\b/);
  if (long) return Number(long[1]) * 3600 + Number(long[2]) * 60 + Number(long[3]);
  // MM:SS fallback (results.hyrox.com shows split times without leading 0: e.g. "4:52")
  const short = str.match(/\b(\d{1,2}):([0-5]\d)\b/);
  if (short) return Number(short[1]) * 60 + Number(short[2]);
  return null;
}

function findTimeIndex(line) {
  const longIdx = line.search(/\b\d{1,2}:[0-5]\d:[0-5]\d\b/);
  if (longIdx >= 0) return longIdx;
  return line.search(/\b\d{1,2}:[0-5]\d\b/);
}

function cleanLabel(value) {
  return String(value ?? "")
    .replace(/\([^)]*\)/g, "")           // strip "(1,000 m)", "(100 reps)", "(300s)" etc.
    .replace(/\b(?:1000|200|100|80|50)m\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lineValue(line) {
  const parts = line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" ") : line.replace(/^[^:]+:\s*/, "").trim();
}

function matchSplit(line) {
  if (/roxzone\s+time|run\s+total|best\s+run\s+lap/i.test(line)) return null;
  const timeIdx = findTimeIndex(line);
  if (timeIdx < 0) return null;
  const time = parseHms(line.slice(timeIdx));
  if (time === null) return null;
  const beforeTime = line.slice(0, timeIdx);
  const label = cleanLabel(beforeTime.replace(/\t+$/g, ""));
  const def = SPLITS.find((split) => split.patterns.some((pattern) => pattern.test(label)));
  return def ? { segmentKey: def.segmentKey, label: def.label, type: def.type, index: def.index, timeSeconds: time } : null;
}

function parseDivision(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value || value === "hyrox" || value.includes("open")) return "open";
  if (value.includes("pro")) return "pro";
  if (value.includes("double") || value.includes("mixed")) return "doubles";
  if (value.includes("relay")) return "relay";
  return null;
}

function parsePenaltyText(rawText) {
  if (!rawText || /(?:^|\s)[-–—](?:\s|$)/.test(rawText)) return null;
  const secondsMatch = rawText.match(/\((\d+)\s*s\)|\b(\d+)\s*s\b/i);
  const penaltySeconds = Number(secondsMatch?.[1] ?? secondsMatch?.[2]);
  if (!Number.isFinite(penaltySeconds) || penaltySeconds <= 0) return null;
  const run = rawText.match(/\bRUN\s*(\d)\b/i);
  if (run) return { segmentKey: `run_${run[1]}`, penaltySeconds, rawText: rawText.trim() };
  const station = rawText.match(/\bSTATION\s*(\d)\b/i);
  if (station) return { segmentKey: STATION_BY_NUMBER[Number(station[1]) - 1] ?? "unknown", penaltySeconds, rawText: rawText.trim() };
  return { segmentKey: "unknown", penaltySeconds, rawText: rawText.trim() };
}

function parsePenalties(lines) {
  const penalties = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/penalty/i.test(line)) continue;
    const sameLine = line.replace(/^\*?\s*penalty\s*:?\s*/i, "").trim();
    const nextLine = lines.slice(i + 1).find((candidate) => candidate.trim());
    const penalty = parsePenaltyText(sameLine) ?? parsePenaltyText(nextLine ?? "");
    if (penalty) penalties.push(penalty);
  }
  return penalties;
}

function pairLabelWithTime(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (findTimeIndex(line) < 0 && i + 1 < lines.length) {
      const next = lines[i + 1];
      const nextTimeIdx = findTimeIndex(next);
      if (nextTimeIdx >= 0 && !next.slice(0, nextTimeIdx).trim()) {
        out.push(line + "\t" + next);
        i += 2;
        continue;
      }
    }
    out.push(line);
    i++;
  }
  return out;
}

export function parseHyroxResultsText(rawText) {
  try {
    const result = emptyResult();
    const rawLines = String(rawText ?? "").replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
    const lines = pairLabelWithTime(rawLines);
    const splitsByKey = new Map();
    const athleteNames = [];
    for (const line of lines) {
      const split = matchSplit(line);
      if (split) splitsByKey.set(split.segmentKey, split);
      if (/^name\b/i.test(line)) { const n = lineValue(line); if (n) athleteNames.push(n); }
      if (/^age\s+group\b/i.test(line)) result.ageGroup = lineValue(line) || null;
      if (/^race\b/i.test(line)) result.raceName = lineValue(line) || null;
      if (/^division\b/i.test(line)) result.division = parseDivision(lineValue(line));
      if (/overall\s+time/i.test(line)) result.finishTimeSeconds = parseHms(line);
      if (/roxzone\s+time/i.test(line)) result.roxzoneSeconds = parseHms(line);
    }
    const seenLower = new Set();
    const uniqueNames = athleteNames.filter((n) => { const k = n.toLowerCase(); return seenLower.has(k) ? false : seenLower.add(k); }).slice(0, 2);
    result.athleteName = uniqueNames.length > 1 ? uniqueNames.join(" & ") : (uniqueNames[0] ?? null);
    result.splits = Array.from(splitsByKey.values()).sort((a, b) => a.index - b.index);
    result.penalties = parsePenalties(lines);
    if (!result.division) result.division = parseDivision(null);
    if (result.division === "pro") result.warnings.push("division_pro_not_yet_benchmarked");
    if (result.division === "relay") result.warnings.push("division_doubles_not_supported");
    if (result.roxzoneSeconds === null) result.warnings.push("roxzone_not_found");
    if (result.finishTimeSeconds === null) result.warnings.push("finish_time_not_found");
    const count = result.splits.length;
    if (count === 16) {
      result.success = true;
      result.confidence = "high";
    } else if (count >= 8) {
      result.success = true;
      result.confidence = "partial";
      result.warnings.push(`partial_splits_${count}_found`);
    }
    return result;
  } catch {
    return emptyResult();
  }
}
