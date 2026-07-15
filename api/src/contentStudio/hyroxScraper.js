const RESULTS_BASE = "https://results.hyrox.com/";
const FETCH_TIMEOUT_MS = 30000;

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Referer": "https://results.hyrox.com/",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Sec-Ch-Ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Upgrade-Insecure-Requests": "1",
};

// Build the event index URL (shows division picker in static HTML)
function buildIndexUrl(resultsPageKey, seasonNum) {
  const base = seasonNum ? `${RESULTS_BASE}season-${seasonNum}/` : RESULTS_BASE;
  return `${base}?event_main_group=${encodeURIComponent(resultsPageKey)}`;
}

async function fetchHtml(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// POST multipart form to get the leaderboard HTML.
// The Mika Timing list page renders server-side only when submitted via POST form.
export async function postListForm(resultsPageKey, contestId, seasonNum, { sex = "", numResults = 50, startpage = "start_responsive" } = {}) {
  const base = seasonNum ? `${RESULTS_BASE}season-${seasonNum}/` : RESULTS_BASE;
  const url = `${base}?pid=list&pidp=ranking_nav`;

  const body = new FormData();
  body.append("lang", "EN_CAP");
  body.append("startpage", startpage);
  body.append("startpage_type", "lists");
  body.append("event_main_group", resultsPageKey);
  body.append("event", contestId);
  body.append("ranking", "time_finish_netto");
  body.append("search[age_class]", "%");
  if (sex) body.append("search[sex]", sex);
  body.append("num_results", String(numResults));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...FETCH_HEADERS,
        "Referer": buildIndexUrl(resultsPageKey, seasonNum),
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Fetches a list page filtered by a specific age class code (e.g. "30" for 30-34, "U24" for 16-24).
// Uses the overall event key as both `event` and `search_event` — this is the only URL format
// the HYROX results site accepts for the age_class filter to work.
export async function fetchListPageByAgeClass(resultsPageKey, seasonNum, sex, ageClassCode, { numResults = 100, page = 1 } = {}) {
  const base = seasonNum ? `${RESULTS_BASE}season-${seasonNum}/` : RESULTS_BASE;
  const url = new URL(base);
  url.searchParams.set("pid", "list");
  url.searchParams.set("fpid", "list");
  url.searchParams.set("lang", "EN_CAP");
  url.searchParams.set("event", resultsPageKey);
  url.searchParams.set("pidp", "ranking_nav");
  url.searchParams.set("ranking", "time_finish_netto");
  url.searchParams.set("search[sex]", sex);
  url.searchParams.set("search[nation]", "%");
  url.searchParams.set("search_event", resultsPageKey);
  url.searchParams.set("num_results", String(numResults));
  url.searchParams.set("page", String(page));
  url.searchParams.set("search[age_class]", ageClassCode);
  return fetchHtml(url.toString());
}

export async function fetchListPage(resultsPageKey, contestId, seasonNum, { sex = "", numResults = 50, page = 1 } = {}) {
  const base = seasonNum ? `${RESULTS_BASE}season-${seasonNum}/` : RESULTS_BASE;
  const url = new URL(base);
  url.searchParams.set("event", contestId);
  url.searchParams.set("event_main_group", resultsPageKey);
  url.searchParams.set("num_results", String(numResults));
  url.searchParams.set("page", String(page));
  url.searchParams.set("pid", "list");
  url.searchParams.set("pidp", "ranking_nav");
  url.searchParams.set("ranking", "time_finish_netto");
  url.searchParams.set("search[age_class]", "%");
  if (sex) url.searchParams.set("search[sex]", sex);
  return fetchHtml(url.toString());
}

// Parse the Mika Timing event index page to extract divisions for a specific event.
// The static HTML contains:
//   <select id="default-lists-event" name="event">
//     <optgroup label="2026 Buenos Aires">
//       <option value="HPRO_LR3MS4JI1682">HYROX PRO</option>
//       ...
//     </optgroup>
//   </select>
function parseDivisionsFromHtml(html, resultsPageKey) {
  const divisions = [];

  const selectRe = /<select[^>]+(?:id="default-lists-event"|name="event")[^>]*>([\s\S]*?)<\/select>/i;
  const selectMatch = html.match(selectRe);
  if (!selectMatch) return [];

  const escapedKey = resultsPageKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const optgroupRe = new RegExp(
    `<optgroup[^>]+label="${escapedKey}"[^>]*>([\\s\\S]*?)<\\/optgroup>`,
    "i",
  );
  // Single-day events render label="--" rather than the event name — fall back to first optgroup.
  const fallbackRe = /<optgroup[^>]*>([\s\S]*?)<\/optgroup>/i;
  const optgroupMatch = selectMatch[1].match(optgroupRe) ?? selectMatch[1].match(fallbackRe);
  if (!optgroupMatch) return [];

  const optionRe = /<option[^>]+value="([^"]+)"[^>]*>([^<]+)<\/option>/gi;
  let m;
  while ((m = optionRe.exec(optgroupMatch[1])) !== null) {
    const contestId = m[1].trim();
    const label = m[2].trim();
    if (contestId && label) divisions.push({ label, contestId });
  }

  return divisions;
}

// Parse a Mika Timing list HTML page.
// The list uses <ul>/<li> structure, NOT <table>/<tr>.
// Each athlete row is: <li class="... list-group-item row ...">
// Rank:  <div class="... place-primary numeric ...">1</div>
// Name:  <h4 class="... type-fullname ..."><a ...>Lastname, Firstname</a></h4>
// Time:  <div class="... type-time ..."><div class="...">Total</div>00:57:01</div>
export function parseListRows(html) {
  const rows = [];
  const seen = new Set();
  const liRe = /<li\b(?=[^>]*\blist-group-item\b)(?=[^>]*\brow\b)[^>]*>([\s\S]*?)(?=<li\b[^>]*\blist-group-item\b|<\/ul>)/gi;
  for (const liMatch of html.matchAll(liRe)) {
    const item = liMatch[1];

    const rankM = item.match(/(?:place-primary|field-place_all)[^>]*>\s*(\d+)\s*<\/div>/i);
    if (!rankM) continue;
    const rank = parseInt(rankM[1], 10);
    if (!Number.isFinite(rank) || rank < 1) continue;

    const nameM = item.match(/(?:type-fullname|type-relay_member)[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
    const name = nameM ? nameM[1].trim() : null;
    if (!name) continue;

    // Time is the text node after the inner label div inside type-time
    const timeM = item.match(/type-time[^>]*>[\s\S]*?<\/div>\s*([\d:]+)\s*<\/div>/i);
    const time = timeM ? timeM[1].trim() : null;

    // idp can contain underscores (e.g. LR3MS4JI4F6779_CWL) and href uses &amp; in HTML
    const idpM = item.match(/(?:type-fullname|type-relay_member)[^>]*>[\s\S]*?<a[^>]+href="[^"]*(?:[?&]|&amp;)idp=([A-Za-z0-9_]+)/i);
    const athleteId = idpM ? idpM[1].trim() : null;

    const dedupeKey = `${rank}|${athleteId ?? ""}|${time ?? ""}|${name}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    rows.push({ rank, name, time, athleteId });
  }
  return rows;
}

// Parse time string "H:MM:SS" or "MM:SS" → seconds
export function parseListResultCount(html) {
  const match = html.match(/class="[^"]*\bstr_num\b[^"]*"[^>]*>\s*([\d,.]+)/i);
  if (!match) return null;
  const count = Number(match[1].replace(/[,.]/g, ""));
  return Number.isFinite(count) ? count : null;
}

export function parseTime(str) {
  if (!str) return null;
  const long = str.match(/\b(\d{1,2}):([0-5]\d):([0-5]\d)\b/);
  if (long) return +long[1] * 3600 + +long[2] * 60 + +long[3];
  const short = str.match(/\b(\d{1,2}):([0-5]\d)\b/);
  if (short) return +short[1] * 60 + +short[2];
  return null;
}

export function normaliseDivisionSex(label) {
  const lower = label.toLowerCase();
  if (lower.includes("women") || lower.includes("female") || lower.includes("woman")) return "female";
  return "male";
}

export function normaliseDivisionType(label) {
  const lower = label.toLowerCase();
  if (lower.includes("pro") && lower.includes("double")) return "pro_doubles";
  if (lower.includes("pro")) return "pro";
  if (lower.includes("double") && lower.includes("mixed")) return "doubles_mixed";
  if (lower.includes("double")) return "doubles";
  if (lower.includes("relay") || lower.includes("team relay")) return "relay";
  if (lower.includes("adaptive")) return "adaptive";
  return "open";
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Returns [{ label: "HYROX PRO", contestId: "HPRO_LR3MS4JI1682" }, ...]
export async function fetchDivisions(resultsPageKey, season = null) {
  const url = buildIndexUrl(resultsPageKey, season);
  const html = await fetchHtml(url);
  return parseDivisionsFromHtml(html, resultsPageKey);
}

// Scrapes the leaderboard via POST to the Mika Timing list form.
// Returns athlete rows ready for analyseRaceEvent.
export async function scrapeLeaderboard(resultsPageKey, divisionLabel, limit = 50, season = null, contestId = null, sex = null) {
  if (!contestId) {
    throw new Error("contestId is required — fetch divisions first to get the contest ID");
  }

  const normalisedSex = sex ?? normaliseDivisionSex(divisionLabel);
  const divisionType = normaliseDivisionType(divisionLabel);
  const sexCode = normalisedSex === "male" ? "M" : normalisedSex === "female" ? "W" : "";

  const html = await postListForm(resultsPageKey, contestId, season, { sex: sexCode, numResults: Math.min(limit, 50) });
  const rawRows = parseListRows(html);

  if (rawRows.length === 0) {
    throw new Error("No results found — the leaderboard may not be available yet or the contest ID is incorrect");
  }

  return rawRows.slice(0, limit).map((row) => ({
    rank: row.rank,
    name: row.name,
    instagramHandle: null,
    finishTimeSeconds: parseTime(row.time),
    roxzoneSeconds: null,
    splits: {},
    athleteId: row.athleteId,
    division: divisionType,
    sex: normalisedSex,
  }));
}

export function buildDetailUrl(athleteId, contestId, seasonNum) {
  const base = seasonNum ? `${RESULTS_BASE}season-${seasonNum}/` : RESULTS_BASE;
  return `${base}?content=detail&fpid=list&pid=list&idp=${athleteId}&lang=EN_CAP&event=${contestId}&pidp=ranking_nav`;
}

export async function fetchDetailPage(athleteId, contestId, seasonNum, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  return fetchHtml(buildDetailUrl(athleteId, contestId, seasonNum), timeoutMs);
}

const WORKOUT_SUMMARY_MAP = {
  "f-time_01": "run_1",
  "f-time_02": "run_2",
  "f-time_03": "run_3",
  "f-time_04": "run_4",
  "f-time_05": "run_5",
  "f-time_06": "run_6",
  "f-time_07": "run_7",
  "f-time_08": "run_8",
  "f-time_11": "skierg",
  "f-time_12": "sled_push",
  "f-time_13": "sled_pull",
  "f-time_14": "burpee_bj",
  "f-time_15": "row",
  "f-time_16": "farmers_carry",
  "f-time_17": "sandbag_lunge",
  "f-time_18": "wall_balls",
};

const WORKOUT_TOTALS_MAP = {
  "f-time_49": "runTotalSeconds",
  "f-time_50": "bestRunLapSeconds",
  "f-time_60": "roxzoneSeconds",
};

export function parseWorkoutSummary(html) {
  const splits = {};
  const splitRanks = {};
  const totals = {};
  const boxMatch = html.match(/<div[^>]+id="detail-box-other"[^>]*>([\s\S]*?)<\/div>\s*(?=<div|$)/i)
    ?? html.match(/<div[^>]+id="detail-box-other"[^>]*>([\s\S]*)<\/div>/i);
  if (!boxMatch) return { splits, splitRanks, ...totals };

  const section = boxMatch[1];
  const rowRe = /<tr[^>]*class="([^"]*f-time_\d+[^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const m of section.matchAll(rowRe)) {
    const classM = m[1].match(/\bf-time_(\d+)\b/);
    if (!classM) continue;
    const key = `f-time_${classM[1]}`;
    const inner = m[2];
    const timeM = inner.match(/<td[^>]*class="[^"]*f-time_\d+[^"]*"[^>]*>\s*([\d:]+)\s*<\/td>/i)
      ?? inner.match(/<td[^>]*>\s*([\d:]+)\s*<\/td>/i);
    const seconds = timeM ? parseTime(timeM[1]) : null;
    const placeM = inner.match(/<td[^>]*class="\s*last\s*"[^>]*>\s*(\d+|â€“|–|-)\s*<\/td>/i);
    const place = placeM && /^\d+$/.test(placeM[1].trim()) ? parseInt(placeM[1], 10) : null;

    if (WORKOUT_SUMMARY_MAP[key] && seconds !== null) {
      splits[WORKOUT_SUMMARY_MAP[key]] = seconds;
      if (place !== null) splitRanks[WORKOUT_SUMMARY_MAP[key]] = place;
    } else if (WORKOUT_TOTALS_MAP[key] && seconds !== null) {
      totals[WORKOUT_TOTALS_MAP[key]] = seconds;
    }
  }

  return { splits, splitRanks, ...totals };
}

// Per-station roxzone transitions. Each station has 4 race-replay rows:
//   Rox In (f-time_84+4n):     Diff = run leg time to reach corral — NOT a transition, skip
//   Station In (f-time_85+4n): Diff = seconds from corral entry to starting the machine = rox_in
//   Station Out (f-time_51+n): Diff = exercise time — captured in WORKOUT_SUMMARY_MAP, skip
//   Rox Out (f-time_86+4n):    Diff = seconds from finishing machine to exiting corral = rox_out
const RACE_REPLAY_MAP = {
  "f-time_85": "skierg_rox_in",
  "f-time_86": "skierg_rox_out",
  "f-time_88": "sled_push_rox_in",
  "f-time_89": "sled_push_rox_out",
  "f-time_91": "sled_pull_rox_in",
  "f-time_92": "sled_pull_rox_out",
  "f-time_94": "burpee_bj_rox_in",
  "f-time_95": "burpee_bj_rox_out",
  "f-time_97": "row_rox_in",
  "f-time_98": "row_rox_out",
  "f-time_100": "farmers_carry_rox_in",
  "f-time_101": "farmers_carry_rox_out",
  "f-time_103": "sandbag_lunge_rox_in",
  "f-time_104": "sandbag_lunge_rox_out",
};

export function parseRaceReplay(html) {
  const roxzoneSplits = {};
  const boxMatch = html.match(/<div[^>]+id="detail-box-splits"[^>]*>([\s\S]*?)<\/div>\s*(?=<div|$)/i)
    ?? html.match(/<div[^>]+id="detail-box-splits"[^>]*>([\s\S]*)<\/div>/i);
  if (!boxMatch) return roxzoneSplits;

  const section = boxMatch[1];
  const rowRe = /<tr[^>]*class="([^"]*f-time_\d+[^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi;
  for (const m of section.matchAll(rowRe)) {
    const classM = m[1].match(/\bf-time_(\d+)\b/);
    if (!classM) continue;
    const key = `f-time_${classM[1]}`;
    if (!RACE_REPLAY_MAP[key]) continue;
    const tds = [...m[2].matchAll(/<td[^>]*>\s*([^<]*)\s*<\/td>/gi)].map((td) => td[1].trim());
    const seconds = parseTime(tds[tds.length - 1]);
    if (seconds !== null) roxzoneSplits[RACE_REPLAY_MAP[key]] = seconds;
  }
  return roxzoneSplits;
}

// Extracts the athlete's age group from a Mika Timing detail page.
// HYROX uses the CSS class "f-_type_age_class" on both the <tr> and the value <td>.
// Falls back to an "Age Group" or "Age Class" label row for older season variants.
export function parseAthleteAgeGroup(html) {
  const classMatch = html.match(/class="[^"]*\bf-_type_age_class\b[^"]*"[^>]*>\s*([^<]{1,20}?)\s*<\//i);
  if (classMatch) {
    const text = classMatch[1].trim();
    if (text) return text;
  }
  const labelMatch = html.match(/age\s+(?:group|class)[^<]*<\/t[hd]>\s*<td[^>]*>\s*([^<]{1,20}?)\s*<\/td>/i);
  if (labelMatch) {
    const text = labelMatch[1].trim();
    if (text) return text;
  }
  return null;
}

export function parseInstagramHandle(html) {
  const m = html.match(
    /href=["']https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{1,30})\/?["']/i,
  );
  if (!m) return null;
  const handle = m[1].trim();
  if (!handle || handle === "p" || handle === "reel" || handle === "explore" || handle === "accounts") {
    return null;
  }
  return `@${handle}`;
}

const ENRICH_BATCH_SIZE = 5;
const ENRICH_BATCH_DELAY_MS = 300;

export async function enrichAthleteSplits(athletes, _resultsPageKey, contestId, season) {
  const enrichable = athletes.filter((athlete) => athlete.athleteId);
  const enriched = [...athletes];

  for (let i = 0; i < enrichable.length; i += ENRICH_BATCH_SIZE) {
    const batch = enrichable.slice(i, i + ENRICH_BATCH_SIZE);
    await Promise.all(batch.map(async (athlete) => {
      try {
        const html = await fetchDetailPage(athlete.athleteId, contestId, season);
        const summary = parseWorkoutSummary(html);
        const roxzoneSplits = parseRaceReplay(html);
        const instagramHandle = parseInstagramHandle(html);
        const idx = enriched.findIndex((candidate) => candidate.athleteId === athlete.athleteId);
        if (idx !== -1) {
          enriched[idx] = {
            ...enriched[idx],
            splits: summary.splits,
            splitRanks: summary.splitRanks ?? {},
            roxzoneSplits,
            runTotalSeconds: summary.runTotalSeconds ?? null,
            bestRunLapSeconds: summary.bestRunLapSeconds ?? null,
            ...(summary.roxzoneSeconds != null ? { roxzoneSeconds: summary.roxzoneSeconds } : {}),
            ...(instagramHandle ? { instagramHandle } : {}),
          };
        }
      } catch {
        // Best-effort enrichment: keep sparse leaderboard data if detail parsing fails.
      }
    }));
    if (i + ENRICH_BATCH_SIZE < enrichable.length) {
      await new Promise((resolve) => setTimeout(resolve, ENRICH_BATCH_DELAY_MS));
    }
  }

  return enriched;
}

// Debug helper
export async function debugPage(targetUrl) {
  const parsed = new URL(targetUrl);
  const mainGroup = parsed.searchParams.get("event_main_group");
  const seasonNum = parsed.pathname.match(/season-(\d+)/)?.[1] ?? "8";
  const url = buildIndexUrl(mainGroup, seasonNum);
  const html = await fetchHtml(url);
  const divisions = parseDivisionsFromHtml(html, mainGroup);
  return { url, htmlLength: html.length, divisions };
}
