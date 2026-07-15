const SPLITS_SCHEMA = [
  { segmentKey: "run_1",           label: "Run 1",             type: "run",     index: 1,  cls: "f-time_01" },
  { segmentKey: "ski_erg",         label: "SkiErg",            type: "station", index: 2,  cls: "f-time_11" },
  { segmentKey: "run_2",           label: "Run 2",             type: "run",     index: 3,  cls: "f-time_02" },
  { segmentKey: "sled_push",       label: "Sled Push",         type: "station", index: 4,  cls: "f-time_12" },
  { segmentKey: "run_3",           label: "Run 3",             type: "run",     index: 5,  cls: "f-time_03" },
  { segmentKey: "sled_pull",       label: "Sled Pull",         type: "station", index: 6,  cls: "f-time_13" },
  { segmentKey: "run_4",           label: "Run 4",             type: "run",     index: 7,  cls: "f-time_04" },
  { segmentKey: "burpee_broad_jump", label: "Burpee Broad Jump", type: "station", index: 8, cls: "f-time_14" },
  { segmentKey: "run_5",           label: "Run 5",             type: "run",     index: 9,  cls: "f-time_05" },
  { segmentKey: "row",             label: "Row",               type: "station", index: 10, cls: "f-time_15" },
  { segmentKey: "run_6",           label: "Run 6",             type: "run",     index: 11, cls: "f-time_06" },
  { segmentKey: "farmers_carry",   label: "Farmers Carry",     type: "station", index: 12, cls: "f-time_16" },
  { segmentKey: "run_7",           label: "Run 7",             type: "run",     index: 13, cls: "f-time_07" },
  { segmentKey: "sandbag_lunges",  label: "Sandbag Lunges",    type: "station", index: 14, cls: "f-time_17" },
  { segmentKey: "run_8",           label: "Run 8",             type: "run",     index: 15, cls: "f-time_08" },
  { segmentKey: "wall_balls",      label: "Wall Balls",        type: "station", index: 16, cls: "f-time_18" },
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

function extractByClass(html, cls) {
  const safe = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<td[^>]+class="(?:[^"]*\\s)?${safe}(?:\\s[^"]*|)"[^>]*>([^<]*)<\\/td>`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function extractAllByClass(html, cls) {
  const safe = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<(?:td|th|span|div|li|a)[^>]+class="(?:[^"]*\\s)?${safe}(?:\\s[^"]*|)"[^>]*>([^<]*)<\\/(?:td|th|span|div|li|a)>`, "gi");
  return [...String(html ?? "").matchAll(re)].map((m) => m[1].trim()).filter(Boolean);
}

function extractMemberNames(html) {
  const names = [];
  for (const row of String(html ?? "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = row[1];
    if (!/Member\s+\d+/i.test(rowHtml)) continue;
    const tdMatch = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
    if (!tdMatch) continue;
    const raw = stripTags(tdMatch[1]).replace(/\s*\([^)]+\)\s*$/, "").trim();
    if (raw) names.push(raw);
  }
  return names;
}

function extractRowByClass(html, cls) {
  const safe = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<tr[^>]*class="[^"]*${safe}[^"]*"[^>]*>([\\s\\S]*?)<\\/tr>`, "i");
  return html.match(re)?.[1] ?? null;
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&ndash;|&#8211;/g, "-")
    .replace(/&mdash;|&#8212;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeEntities(value).replace(/<[^>]*>/g, "").trim();
}

function parseRankFromRow(rowHtml) {
  if (!rowHtml) return null;
  const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => stripTags(match[1]));
  const last = cells[cells.length - 1] ?? "";
  const n = Number(last.replace(/[^\d]/g, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseHms(value) {
  if (!value) return null;
  const long = value.match(/\b(\d{1,2}):([0-5]\d):([0-5]\d)\b/);
  if (long) return Number(long[1]) * 3600 + Number(long[2]) * 60 + Number(long[3]);
  const short = value.match(/\b(\d{1,2}):([0-5]\d)\b/);
  if (short) return Number(short[1]) * 60 + Number(short[2]);
  return null;
}

function timeMatches(value) {
  return [...String(value ?? "").matchAll(/\b\d{1,2}:[0-5]\d(?::[0-5]\d)?\b/g)]
    .map((match) => ({ index: match.index ?? -1, value: match[0] }))
    .filter((match) => match.index >= 0);
}

function onlyTimeValue(value) {
  const line = String(value ?? "").trim();
  const matches = timeMatches(line);
  if (matches.length !== 1) return null;
  return line.replace(matches[0].value, "").trim() ? null : parseHms(matches[0].value);
}

function parsePenaltyText(raw) {
  if (!raw || /^[-–—\s]*$/.test(raw)) return null;
  const secondsMatch = raw.match(/\((\d+)\s*s\)/i);
  if (!secondsMatch) return null;
  const penaltySeconds = Number(secondsMatch[1]);
  if (!penaltySeconds) return null;
  const run = raw.match(/\bRUN\s*(\d)\b/i);
  if (run) return { segmentKey: `run_${run[1]}`, penaltySeconds, rawText: raw.trim() };
  const station = raw.match(/\bSTATION\s*(\d)\b/i);
  if (station) return { segmentKey: STATION_BY_NUMBER[Number(station[1]) - 1] ?? "unknown", penaltySeconds, rawText: raw.trim() };
  return { segmentKey: "unknown", penaltySeconds, rawText: raw.trim() };
}

function emptyResult() {
  return { success: false, confidence: "low", splits: [], roxzoneSeconds: null, finishTimeSeconds: null, penalties: [], raceReplay: [], athleteName: null, athleteAge: null, ageGroup: null, raceName: null, division: "open", warnings: [] };
}

function parseAge(value) {
  const match = String(value ?? "").match(/\b([1-9]\d?)\b/);
  const age = Number(match?.[1]);
  return Number.isInteger(age) && age >= 16 && age <= 80 ? age : null;
}

function extractAge(html) {
  const direct = extractByClass(html, "f-__age")
    ?? extractByClass(html, "f-_age")
    ?? extractByClass(html, "f-age");
  const directAge = parseAge(direct);
  if (directAge !== null) return directAge;

  const labelled = String(html ?? "").match(/<tr[^>]*>[\s\S]*?<th[^>]*>\s*Age\s*<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/i);
  return parseAge(stripTags(labelled?.[1] ?? ""));
}

function normaliseReplayLabel(value) {
  return stripTags(value)
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(?:1000|200|100|80|50)\s*m\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function replayTextLines(html) {
  return decodeEntities(html)
    .replace(/<\/(?:tr|td|th|div|li|p)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractReplayRowsFromText(html) {
  const lines = replayTextLines(html);
  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const matches = timeMatches(line);
    const sameLineTime = matches.length > 0 ? parseHms(matches[matches.length - 1].value) : null;
    if (sameLineTime !== null && /(?:\brox\s+(?:in|out)\b|\b(?:in|out)\b)/i.test(line)) {
      rows.push({ label: normaliseReplayLabel(line.slice(0, matches[0].index)), timeSeconds: sameLineTime });
      continue;
    }

    if (/(?:\brox\s+(?:in|out)\b|\b(?:in|out)\b)/i.test(line)) {
      const followingTimes = [];
      let j = i + 1;
      while (j < lines.length) {
        const time = onlyTimeValue(lines[j]);
        if (time === null) break;
        followingTimes.push(time);
        j += 1;
      }
      if (followingTimes.length > 0) {
        rows.push({ label: normaliseReplayLabel(line), timeSeconds: followingTimes[followingTimes.length - 1] });
        i = j - 1;
      }
    }
  }
  return rows;
}

function extractReplayRows(html) {
  const htmlRows = [...String(html ?? "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => {
      const rowHtml = match[1];
      const label = stripTags(rowHtml.match(/<th[^>]*class=["'][^"']*desc[^"']*["'][^>]*>([\s\S]*?)<\/th>/i)?.[1] ?? "");
      const cellTimes = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map((cell) => parseHms(stripTags(cell[1])))
        .filter((time) => time !== null);
      return { label, timeSeconds: cellTimes[cellTimes.length - 1] ?? null };
    })
    .filter((row) =>
      row.label
      && row.timeSeconds !== null
      && /(?:\brox\s+(?:in|out)\b|\b(?:in|out)\b)/i.test(row.label)
    );
  return htmlRows.length > 0 ? htmlRows : extractReplayRowsFromText(html);
}

function parseRaceReplay(html) {
  const rows = extractReplayRows(html).map((row) => ({ ...row, label: normaliseReplayLabel(row.label) }));
  if (rows.length === 0) return [];

  return REPLAY_STATIONS.map((station) => {
    const labels = station.labels.map(normaliseReplayLabel);
    const entryIndex = rows.findIndex((row) => labels.some((label) => row.label === `${label} in` || row.label.endsWith(` ${label} in`)));
    const exitIndex = entryIndex >= 0
      ? rows.findIndex((row, rowIndex) => rowIndex > entryIndex && row.label.toLowerCase() === "rox out")
      : -1;
    return {
      station: station.station,
      entrySeconds: entryIndex >= 0 ? rows[entryIndex].timeSeconds : null,
      exitSeconds: exitIndex >= 0 ? rows[exitIndex].timeSeconds : null,
    };
  }).filter((row) => row.entrySeconds !== null && row.exitSeconds !== null);
}

export function parseHyroxResultsHtml(html) {
  try {
    const splits = [];
    for (const def of SPLITS_SCHEMA) {
      const timeSeconds = parseHms(extractByClass(html, def.cls));
      if (timeSeconds !== null) {
        const fieldRank = def.type === "station" ? parseRankFromRow(extractRowByClass(html, def.cls)) : null;
        splits.push({ segmentKey: def.segmentKey, label: def.label, type: def.type, index: def.index, timeSeconds, fieldRank });
      }
    }

    const finishTimeSeconds = parseHms(extractByClass(html, "f-time_finish_netto"));
    const runTotalSeconds = parseHms(extractByClass(html, "f-time_49"));
    const roxzoneSeconds = parseHms(extractByClass(html, "f-time_60"));
    if (runTotalSeconds !== null) {
      splits.push({ segmentKey: "run_time", label: "Total Run Time", type: "aggregate", index: 49, timeSeconds: runTotalSeconds, fieldRank: null });
    }
    if (roxzoneSeconds !== null) {
      splits.push({ segmentKey: "roxzone_time", label: "Total Roxzone Time", type: "aggregate", index: 60, timeSeconds: roxzoneSeconds, fieldRank: null });
    }
    const singleNames = extractAllByClass(html, "f-__fullname");
    const allNames = singleNames.length > 0 ? singleNames : extractMemberNames(html);
    const seenLower = new Set();
    const uniqueNames = allNames.filter((n) => { const k = n.toLowerCase(); return seenLower.has(k) ? false : seenLower.add(k); }).slice(0, 2);
    const athleteName = uniqueNames.length > 1 ? uniqueNames.join(" & ") : (uniqueNames[0] ?? null);
    const athleteAge = extractAge(html);
    const ageGroup = extractByClass(html, "f-_type_age_class") || null;
    const raceName = extractByClass(html, "f-__meeting") || null;

    const divisionRaw = (extractByClass(html, "f-__event") ?? "").toLowerCase();
    let division = "open";
    const hasDouble = divisionRaw.includes("double") || divisionRaw.includes("mixed");
    const hasPro = divisionRaw.includes("pro");
    if (hasDouble && hasPro) division = "pro_doubles";
    else if (hasDouble) division = "doubles";
    else if (hasPro) division = "pro";
    else if (divisionRaw.includes("relay")) division = "relay";

    const penalties = [];
    for (let i = 0; i <= 5; i++) {
      const penalty = parsePenaltyText(extractByClass(html, `f-gimmick_0${i}`) ?? "");
      if (penalty) penalties.push(penalty);
    }

    const raceReplay = parseRaceReplay(html);
    const roxzoneFieldRank = parseRankFromRow(extractRowByClass(html, "f-time_60"));
    const runTotalFieldRank = parseRankFromRow(extractRowByClass(html, "f-time_49"));
    const bestRunLapFieldRank = parseRankFromRow(extractRowByClass(html, "f-time_50"));

    const warnings = [];
    if (division === "pro") warnings.push("division_pro_not_yet_benchmarked");
    if (division === "relay") warnings.push("division_doubles_not_supported");
    if (roxzoneSeconds === null) warnings.push("roxzone_not_found");
    if (finishTimeSeconds === null) warnings.push("finish_time_not_found");

    const count = splits.filter((split) => split.type !== "aggregate").length;
    const confidence = count === 16 ? "high" : count >= 8 ? "partial" : "low";
    if (count >= 8 && count < 16) warnings.push(`partial_splits_${count}_found`);

    return { success: count >= 8, confidence, splits, runTotalSeconds, roxzoneSeconds, roxzoneFieldRank, runTotalFieldRank, bestRunLapFieldRank, finishTimeSeconds, penalties, raceReplay, athleteName, athleteAge, ageGroup, raceName, division, warnings };
  } catch {
    return emptyResult();
  }
}
