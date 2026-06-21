const RESULTS_BASE = "https://results.hyrox.com/";
const FETCH_TIMEOUT_MS = 15000;
const PUPPETEER_TIMEOUT_MS = 45000;
const BROWSER_ARGS = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"];

// Use encodeURIComponent (not URLSearchParams) so spaces become %20, not +
function buildEventUrl(resultsPageKey, division = null, seasonNum = null) {
  const base = seasonNum ? `${RESULTS_BASE}season-${seasonNum}/` : RESULTS_BASE;
  let url = `${base}?event_main_group=${encodeURIComponent(resultsPageKey)}`;
  if (division) url += `&event_sub_group=${encodeURIComponent(division)}`;
  return url;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Parse division links from the static HTML the Raceresult platform renders
function parseDivisionsFromHtml(html) {
  const divisions = new Set();

  // Pattern 1: query param links — href="?event_main_group=X&event_sub_group=DIVISION"
  const linkRe = /event_sub_group=([^"&\s]+)/gi;
  for (const match of html.matchAll(linkRe)) {
    const value = decodeURIComponent(match[1].replace(/\+/g, " ")).trim();
    if (value) divisions.add(value);
  }

  // Pattern 2: <option value="DIVISION">
  const optionRe = /<option[^>]+value="([^"]+)"[^>]*>([^<]+)<\/option>/gi;
  for (const match of html.matchAll(optionRe)) {
    const value = match[1].trim();
    // Filter out numeric contest IDs and empty values; keep human-readable division names
    if (value && !/^\d+$/.test(value) && value.length < 120) {
      divisions.add(value);
    }
  }

  return [...divisions].filter((d) => /hyrox|open|pro|double|mixed|relay|women|men/i.test(d));
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

function normaliseDivisionSex(divisionLabel) {
  const lower = divisionLabel.toLowerCase();
  if (lower.includes("women") || lower.includes("female")) return "female";
  return "male";
}

function normaliseDivisionType(divisionLabel) {
  const lower = divisionLabel.toLowerCase();
  if (lower.includes("pro")) return "pro";
  if (lower.includes("double") && lower.includes("mixed")) return "doubles_mixed";
  if (lower.includes("double") && (lower.includes("women") || lower.includes("female"))) return "doubles_women";
  if (lower.includes("double")) return "doubles_men";
  if (lower.includes("relay")) return "relay";
  return "open";
}

// ─── Puppeteer scraping ────────────────────────────────────────────────────────

async function launchBrowser() {
  const { default: puppeteer } = await import("puppeteer");
  return puppeteer.launch({ headless: "new", args: BROWSER_ARGS });
}

export async function fetchDivisions(resultsPageKey, season = null) {
  // Try season-path URL first (e.g. /season-8/?event_main_group=…), then root URL
  const urlsToTry = season
    ? [buildEventUrl(resultsPageKey, null, season), buildEventUrl(resultsPageKey, null, null)]
    : [buildEventUrl(resultsPageKey, null, null)];

  // Fast path: plain HTTP fetch + HTML parse (works if Raceresult pre-renders division links)
  for (const url of urlsToTry) {
    try {
      const html = await fetchHtml(url);
      const divisions = parseDivisionsFromHtml(html);
      if (divisions.length > 0) return divisions;
    } catch {
      // try next URL or fall through to puppeteer
    }
  }

  // Slow path: puppeteer (handles JS-rendered content)
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(PUPPETEER_TIMEOUT_MS);

    // Suppress non-critical errors from ad/tracking scripts
    page.on("pageerror", () => {});

    await page.goto(urlsToTry[0], { waitUntil: "domcontentloaded", timeout: PUPPETEER_TIMEOUT_MS });

    // Wait for the contest/division selector to appear — Raceresult renders this as a <select>
    // or as a list of anchor tags. We check for either.
    await Promise.race([
      page.waitForFunction(
        () => {
          const sel = document.querySelector(
            'select[name="event_sub_group"], select[name="contest_id"], select.contest-select',
          );
          return sel && sel.options.length > 1;
        },
        { timeout: PUPPETEER_TIMEOUT_MS },
      ),
      page.waitForSelector('a[href*="event_sub_group"]', { timeout: PUPPETEER_TIMEOUT_MS }),
      // Extra wait for any network activity to settle after domcontentloaded
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]).catch(() => {});

    const divisions = await page.evaluate(() => {
      const results = new Set();

      // Strategy 1: <select> whose name/class hints at contest/division selection
      const selectors = [
        'select[name="event_sub_group"]',
        'select[name="contest_id"]',
        'select[name="contest"]',
        "select.contest-select",
        "select.division-select",
      ];
      for (const sel of selectors) {
        document.querySelectorAll(`${sel} option`).forEach((opt) => {
          const v = (opt.value || "").trim();
          const t = (opt.textContent || "").trim();
          // Raceresult sometimes uses numeric IDs as values; prefer label text
          if (t && t.length > 2 && !/^-+$/.test(t)) results.add(t);
          else if (v && !/^\d+$/.test(v)) results.add(v);
        });
      }

      // Strategy 2: any <a> href containing event_sub_group
      document.querySelectorAll("a[href]").forEach((a) => {
        const m = a.href.match(/event_sub_group=([^&]+)/);
        if (m) results.add(decodeURIComponent(m[1].replace(/\+/g, " ")));
      });

      // Strategy 3: buttons/tabs with data-contest or similar
      document.querySelectorAll("[data-contest], [data-division], .contest-item, .division-tab").forEach((el) => {
        const v = (el.dataset.contest ?? el.dataset.division ?? el.textContent ?? "").trim();
        if (v && v.length > 2) results.add(v);
      });

      return [...results];
    });

    return divisions.filter((d) => /hyrox|open|pro|double|mixed|relay|women|men/i.test(d));
  } finally {
    await browser.close();
  }
}

export async function scrapeLeaderboard(resultsPageKey, division, limit = 50, season = null) {
  const url = buildEventUrl(resultsPageKey, division, season);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setDefaultTimeout(PUPPETEER_TIMEOUT_MS);
    await page.goto(url, { waitUntil: "networkidle2" });

    // Wait for results to appear — try several common Raceresult selectors
    await Promise.race([
      page.waitForSelector("table.list tbody tr", { timeout: PUPPETEER_TIMEOUT_MS }),
      page.waitForSelector(".list-row", { timeout: PUPPETEER_TIMEOUT_MS }),
      page.waitForSelector("tr.list-row", { timeout: PUPPETEER_TIMEOUT_MS }),
      page.waitForSelector(".f-__pos", { timeout: PUPPETEER_TIMEOUT_MS }),
    ]).catch(() => {});

    const rows = await page.evaluate((maxRows) => {
      function cellText(el) {
        return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
      }

      // Strategy 1: Raceresult standard list table — rows with f- class cells
      const fRows = document.querySelectorAll("tr");
      const results = [];
      for (const row of fRows) {
        if (results.length >= maxRows) break;
        const posEl = row.querySelector("[class*='f-__pos'], td.pos, td:first-child");
        const nameEl = row.querySelector("[class*='f-__fullname'], td.name, [class*='f-name']");
        const timeEl = row.querySelector("[class*='f-time_finish'], td.finish, [class*='f-finish']");
        if (!posEl || !nameEl || !timeEl) continue;
        const rank = parseInt(cellText(posEl), 10);
        const name = cellText(nameEl);
        const time = cellText(timeEl);
        if (!rank || !name || !time || name === "Name") continue;
        results.push({ rank, name, time });
      }
      if (results.length > 0) return results;

      // Strategy 2: Generic table — first table on the page with rank, name, time columns
      const tables = document.querySelectorAll("table");
      for (const table of tables) {
        const rows2 = table.querySelectorAll("tbody tr");
        if (rows2.length < 3) continue;
        for (const row of rows2) {
          if (results.length >= maxRows) break;
          const cells = [...row.querySelectorAll("td")].map(cellText);
          if (cells.length < 3) continue;
          const rank = parseInt(cells[0], 10);
          if (!Number.isInteger(rank) || rank < 1) continue;
          // Heuristic: look for a cell with H:MM:SS or MM:SS format
          const timeCell = cells.find((c) => /^\d{1,2}:\d{2}(:\d{2})?$/.test(c));
          const nameCell = cells.find((c, i) => i > 0 && c.length > 3 && !/^\d/.test(c) && !c.includes(":"));
          if (!timeCell || !nameCell) continue;
          results.push({ rank, name: nameCell, time: timeCell });
        }
        if (results.length > 0) break;
      }
      return results;
    }, limit);

    if (rows.length === 0) {
      throw new Error("No results found on page — the division may not exist or the page did not load correctly");
    }

    const sex = normaliseDivisionSex(division);
    const divisionType = normaliseDivisionType(division);

    return rows.slice(0, limit).map((row) => ({
      rank: row.rank,
      name: row.name,
      instagramHandle: null,
      finishTimeSeconds: parseTime(row.time),
      roxzoneSeconds: null,
      splits: {},
      division: divisionType,
      sex,
    }));
  } finally {
    await browser.close();
  }
}
