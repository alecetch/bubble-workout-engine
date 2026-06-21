export interface HyroxImportPenalty {
  segmentKey: string;
  penaltySeconds: number;
  rawText: string;
}

export interface HyroxImportSplit {
  segmentKey: string;
  label: string;
  type: "run" | "station";
  index: number;
  timeSeconds: number;
}

export interface HyroxParseResult {
  success: boolean;
  confidence: "high" | "partial" | "low";
  splits: HyroxImportSplit[];
  roxzoneSeconds: number | null;
  finishTimeSeconds: number | null;
  penalties: HyroxImportPenalty[];
  raceReplay?: Array<{
    station: string;
    entrySeconds: number | null;
    exitSeconds: number | null;
  }>;
  athleteName: string | null;
  athleteAge: number | null;
  ageGroup: string | null;
  raceName: string | null;
  division: "open" | "pro" | "doubles" | "relay" | null;
  warnings: string[];
}

const SPLITS: Array<Omit<HyroxImportSplit, "timeSeconds"> & { patterns: RegExp[] }> = [
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
const REPLAY_STATIONS = [
  { station: "ski_erg", labels: ["SkiErg", "Ski Erg", "Ski-Erg"] },
  { station: "sled_push", labels: ["Sled Push"] },
  { station: "sled_pull", labels: ["Sled Pull"] },
  { station: "burpee_broad_jump", labels: ["Burpee Broad Jump"] },
  { station: "row", labels: ["Row", "Rowing"] },
  { station: "farmers_carry", labels: ["Farmers Carry", "Farmer's Carry"] },
  { station: "sandbag_lunges", labels: ["Sandbag Lunges"] },
  { station: "wall_balls", labels: ["Wall Balls"] },
];

function emptyResult(): HyroxParseResult {
  return {
    success: false,
    confidence: "low",
    splits: [],
    roxzoneSeconds: null,
    finishTimeSeconds: null,
    penalties: [],
    raceReplay: [],
    athleteName: null,
    athleteAge: null,
    ageGroup: null,
    raceName: null,
    division: null,
    warnings: [],
  };
}

function parseHms(value: string): number | null {
  const long = value.match(/\b(\d{1,2}):([0-5]\d):([0-5]\d)\b/);
  if (long) return Number(long[1]) * 3600 + Number(long[2]) * 60 + Number(long[3]);
  // MM:SS fallback — results.hyrox.com shows split times as "4:52" not "0:04:52"
  const short = value.match(/\b(\d{1,2}):([0-5]\d)\b/);
  if (short) return Number(short[1]) * 60 + Number(short[2]);
  return null;
}

function findTimeIndex(line: string): number {
  const longIdx = line.search(/\b\d{1,2}:[0-5]\d:[0-5]\d\b/);
  if (longIdx >= 0) return longIdx;
  return line.search(/\b\d{1,2}:[0-5]\d\b/);
}

function timeMatches(line: string): Array<{ index: number; value: string }> {
  return [...line.matchAll(/\b\d{1,2}:[0-5]\d(?::[0-5]\d)?\b/g)]
    .map((match) => ({ index: match.index ?? -1, value: match[0] }))
    .filter((match) => match.index >= 0);
}

function onlyTimeValue(line: string): string | null {
  const matches = timeMatches(line.trim());
  if (matches.length !== 1) return null;
  return line.replace(matches[0].value, "").trim() ? null : matches[0].value;
}

function cleanLabel(value: string): string {
  return value
    .replace(/\([^)]*\)/g, "")           // strip "(1,000 m)", "(100 reps)", "(300s)" etc.
    .replace(/\b(?:1000|200|100|80|50)m\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lineValue(line: string): string {
  const parts = line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(" ") : line.replace(/^[^:]+:\s*/, "").trim();
}

function matchSplit(line: string): HyroxImportSplit | null {
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

function parseDivision(raw: string | null): HyroxParseResult["division"] {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value || value === "hyrox" || value.includes("open")) return "open";
  if (value.includes("pro")) return "pro";
  if (value.includes("double") || value.includes("mixed")) return "doubles";
  if (value.includes("relay")) return "relay";
  return null;
}

function parsePenaltyText(rawText: string): HyroxImportPenalty | null {
  if (!rawText || /(?:^|\s)[-–—](?:\s|$)/.test(rawText)) return null;
  const secondsMatch = rawText.match(/\((\d+)\s*s\)|\b(\d+)\s*s\b/i);
  const penaltySeconds = Number(secondsMatch?.[1] ?? secondsMatch?.[2]);
  if (!Number.isFinite(penaltySeconds) || penaltySeconds <= 0) return null;
  const run = rawText.match(/\bRUN\s*(\d)\b/i);
  if (run) return { segmentKey: `run_${run[1]}`, penaltySeconds, rawText: rawText.trim() };
  const station = rawText.match(/\bSTATION\s*(\d)\b/i);
  if (station) {
    const key = STATION_BY_NUMBER[Number(station[1]) - 1] ?? "unknown";
    return { segmentKey: key, penaltySeconds, rawText: rawText.trim() };
  }
  return { segmentKey: "unknown", penaltySeconds, rawText: rawText.trim() };
}

function parsePenalties(lines: string[]): HyroxImportPenalty[] {
  const penalties: HyroxImportPenalty[] = [];
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

function parseAge(value: string): number | null {
  const match = String(value ?? "").match(/\b([1-9]\d?)\b/);
  const age = Number(match?.[1]);
  return Number.isInteger(age) && age >= 16 && age <= 80 ? age : null;
}

function normaliseReplayLabel(value: string): string {
  return value
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(?:1000|200|100|80|50)\s*m\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseRaceReplay(lines: string[]): HyroxParseResult["raceReplay"] {
  const replayRows = lines
    .map((line) => {
      const matches = timeMatches(line);
      if (matches.length === 0) return null;
      const label = normaliseReplayLabel(line.slice(0, matches[0].index));
      const timeSeconds = parseHms(matches[matches.length - 1].value);
      return label && timeSeconds !== null ? { label, timeSeconds } : null;
    })
    .filter((row): row is { label: string; timeSeconds: number } => Boolean(row));

  const hasReplayMarkers = replayRows.some((row) => /\brox\s+(in|out)\b/.test(row.label) || /\b(in|out)\b$/.test(row.label));
  if (!hasReplayMarkers) return [];

  return REPLAY_STATIONS.map((station) => {
    const stationLabels = station.labels.map(normaliseReplayLabel);
    const entryIndex = replayRows.findIndex((row) =>
      stationLabels.some((label) => row.label === `${label} in` || row.label.endsWith(` ${label} in`)),
    );
    const roxOutIndex = entryIndex >= 0
      ? replayRows.findIndex((row, index) => index > entryIndex && row.label === "rox out")
      : -1;
    return {
      station: station.station,
      entrySeconds: entryIndex >= 0 ? replayRows[entryIndex].timeSeconds : null,
      exitSeconds: roxOutIndex >= 0 ? replayRows[roxOutIndex].timeSeconds : null,
    };
  }).filter((row) => row.entrySeconds !== null && row.exitSeconds !== null);
}

export function pairLabelWithTime(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (findTimeIndex(line) < 0 && i + 1 < lines.length) {
      const next = lines[i + 1];
      const nextTimeIdx = findTimeIndex(next);
      if (nextTimeIdx >= 0 && !next.slice(0, nextTimeIdx).trim()) {
        // Next line is a bare time with nothing before it — merge label + time
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

function pairLabelWithReplayDiffTime(lines: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (findTimeIndex(line) < 0 && i + 1 < lines.length) {
      const followingTimes: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const time = onlyTimeValue(lines[j]);
        if (!time) break;
        followingTimes.push(time);
        j += 1;
      }
      if (followingTimes.length > 0) {
        out.push(line + "\t" + followingTimes[followingTimes.length - 1]);
        i = j;
        continue;
      }
    }
    out.push(line);
    i++;
  }
  return out;
}

export function parseHyroxResults(rawText: string): HyroxParseResult {
  try {
    const result = emptyResult();
    const rawLines = String(rawText ?? "").replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
    const lines = pairLabelWithReplayDiffTime(rawLines);
    const splitsByKey = new Map<string, HyroxImportSplit>();

    for (const line of lines) {
      const split = matchSplit(line);
      if (split) splitsByKey.set(split.segmentKey, split);
      if (/^name\b/i.test(line)) result.athleteName = lineValue(line) || null;
      if (/^age\b(?!\s+group\b)/i.test(line)) result.athleteAge = parseAge(lineValue(line));
      if (/^age\s+group\b/i.test(line)) result.ageGroup = lineValue(line) || null;
      if (/^race\b/i.test(line)) result.raceName = lineValue(line) || null;
      if (/^division\b/i.test(line)) result.division = parseDivision(lineValue(line));
      if (/overall\s+time/i.test(line)) result.finishTimeSeconds = parseHms(line);
      if (/roxzone\s+time/i.test(line)) result.roxzoneSeconds = parseHms(line);
    }

    result.splits = Array.from(splitsByKey.values()).sort((a, b) => a.index - b.index);
    result.penalties = parsePenalties(lines);
    result.raceReplay = parseRaceReplay(lines);
    if (!result.division) result.division = parseDivision(null);

    if (result.division === "pro") result.warnings.push("division_pro_not_yet_benchmarked");
    if (result.division === "doubles" || result.division === "relay") result.warnings.push("division_doubles_not_supported");
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
