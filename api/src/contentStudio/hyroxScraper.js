const RESULTS_BASE = "https://results.hyrox.com/";
const FETCH_TIMEOUT_MS = 30000;

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// Build the event index URL (shows division picker in static HTML)
function buildIndexUrl(resultsPageKey, seasonNum) {
  const base = seasonNum ? `${RESULTS_BASE}season-${seasonNum}/` : RESULTS_BASE;
  return `${base}?event_main_group=${encodeURIComponent(resultsPageKey)}`;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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
async function postListForm(resultsPageKey, contestId, seasonNum, { sex = "", numResults = 50 } = {}) {
  const base = seasonNum ? `${RESULTS_BASE}season-${seasonNum}/` : RESULTS_BASE;
  const url = `${base}?pid=list&pidp=ranking_nav`;

  const body = new FormData();
  body.append("lang", "EN_CAP");
  body.append("startpage", "start_responsive");
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
  const optgroupMatch = selectMatch[1].match(optgroupRe);
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
function parseListRows(html) {
  const rows = [];
  const liRe = /<li class="[^"]*list-group-item row[^"]*">([\s\S]*?)(?=<li class="|<\/ul>)/gi;
  for (const liMatch of html.matchAll(liRe)) {
    const item = liMatch[1];

    const rankM = item.match(/place-primary numeric[^>]*>(\d+)<\/div>/i);
    if (!rankM) continue;
    const rank = parseInt(rankM[1], 10);
    if (!Number.isFinite(rank) || rank < 1) continue;

    const nameM = item.match(/type-fullname[^>]*><a[^>]*>([^<]+)<\/a>/i);
    const name = nameM ? nameM[1].trim() : null;
    if (!name) continue;

    // Time is the text node after the inner label div inside type-time
    const timeM = item.match(/type-time[^>]*>[\s\S]*?<\/div>\s*([\d:]+)\s*<\/div>/i);
    const time = timeM ? timeM[1].trim() : null;

    rows.push({ rank, name, time });
  }
  return rows;
}

// Parse time string "H:MM:SS" or "MM:SS" → seconds
function parseTime(str) {
  if (!str) return null;
  const long = str.match(/\b(\d{1,2}):([0-5]\d):([0-5]\d)\b/);
  if (long) return +long[1] * 3600 + +long[2] * 60 + +long[3];
  const short = str.match(/\b(\d{1,2}):([0-5]\d)\b/);
  if (short) return +short[1] * 60 + +short[2];
  return null;
}

function normaliseDivisionSex(label) {
  const lower = label.toLowerCase();
  if (lower.includes("women") || lower.includes("female") || lower.includes("woman")) return "female";
  return "male";
}

function normaliseDivisionType(label) {
  const lower = label.toLowerCase();
  if (lower.includes("pro") && lower.includes("double")) return "doubles_pro";
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
export async function scrapeLeaderboard(resultsPageKey, divisionLabel, limit = 50, season = null, contestId = null) {
  if (!contestId) {
    throw new Error("contestId is required — fetch divisions first to get the contest ID");
  }

  const sex = normaliseDivisionSex(divisionLabel);
  const divisionType = normaliseDivisionType(divisionLabel);

  const html = await postListForm(resultsPageKey, contestId, season, { numResults: Math.min(limit, 50) });
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
    division: divisionType,
    sex,
  }));
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
