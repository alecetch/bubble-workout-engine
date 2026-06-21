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

// Parse division links from static HTML.
// Rules:
//   - link has event_sub_group AND event_main_group === resultsPageKey  → include
//   - link has event_sub_group AND no event_main_group (relative link)  → include
//   - link has event_sub_group AND event_main_group for a DIFFERENT event → exclude
function parseDivisionsFromHtml(html, resultsPageKey) {
  const divisions = new Set();

  const hrefRe = /href="([^"]+)"/gi;
  for (const hrefMatch of html.matchAll(hrefRe)) {
    const href = hrefMatch[1];
    if (!href.includes("event_sub_group=")) continue;

    const mainGroupMatch = href.match(/event_main_group=([^"&\s]+)/);
    if (mainGroupMatch) {
      const mainGroup = decodeURIComponent(mainGroupMatch[1].replace(/\+/g, " ")).trim();
      if (mainGroup !== resultsPageKey) continue; // explicitly a different event
    }
    // No event_main_group in href → relative link, accept it

    const subGroupMatch = href.match(/event_sub_group=([^"&\s]+)/);
    if (!subGroupMatch) continue;
    const value = decodeURIComponent(subGroupMatch[1].replace(/\+/g, " ")).trim();
    if (value) divisions.add(value);
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

// Debug helper — loads a URL and returns page structure so we can identify selectors
export async function debugPage(url) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(PUPPETEER_TIMEOUT_MS);
    page.on("pageerror", () => {});
    await page.goto(url, { waitUntil: "networkidle2", timeout: PUPPETEER_TIMEOUT_MS }).catch(() => {});
    // Give JS a bit more time after network idle
    await new Promise((r) => setTimeout(r, 3000));
    return await page.evaluate(() => {
      const links = [...document.querySelectorAll("a[href]")]
        .map((a) => a.href)
        .filter((h) => h.includes("event_sub_group") || h.includes("event_main_group"));
      const selects = [...document.querySelectorAll("select")].map((s) => ({
        name: s.name, id: s.id, className: s.className,
        options: [...s.options].map((o) => ({ value: o.value, text: o.textContent.trim() })),
      }));
      const buttons = [...document.querySelectorAll("button, [role=button], [onclick]")]
        .slice(0, 30)
        .map((b) => ({ tag: b.tagName, text: b.textContent.trim().slice(0, 80), onclick: b.getAttribute("onclick") }));
      // Grab all text nodes that look like division names
      const bodyText = document.body.innerText.slice(0, 3000);
      return { url: location.href, title: document.title, links, selects, buttons, bodyText };
    });
  } finally {
    await browser.close();
  }
}

export async function fetchDivisions(resultsPageKey, season = null) {
  // Always use the root URL with event_main_group — the season-index page (/season-N/)
  // lists all events and contaminates the results with other events' sub-groups.
  const url = buildEventUrl(resultsPageKey, null, null);

  // Fast path: plain HTTP fetch + HTML parse
  try {
    const html = await fetchHtml(url);
    const divisions = parseDivisionsFromHtml(html, resultsPageKey);
    if (divisions.length > 0) return divisions;
  } catch {
    // fall through to puppeteer
  }

  // Slow path: puppeteer (handles JS-rendered content)
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(PUPPETEER_TIMEOUT_MS);
    page.on("pageerror", () => {});

    // networkidle2 waits for the page's AJAX calls to settle before we try to read links
    await page.goto(url, { waitUntil: "networkidle2", timeout: PUPPETEER_TIMEOUT_MS }).catch(() => {});

    // After network settles, wait up to 15 s for division links or a contest select to appear
    await Promise.race([
      page.waitForFunction(
        (rpk) => {
          return [...document.querySelectorAll("a[href]")].some((a) => {
            try {
              const u = new URL(a.href, location.href);
              const mainGroup = u.searchParams.get("event_main_group");
              const subGroup = u.searchParams.get("event_sub_group");
              return subGroup && (mainGroup === null || mainGroup === rpk);
            } catch { return false; }
          });
        },
        { timeout: 15000 },
        resultsPageKey,
      ),
      page.waitForFunction(
        () => {
          const sel = document.querySelector('select[name="event_sub_group"], select[name="contest_id"], select.contest-select');
          return sel && sel.options.length > 1;
        },
        { timeout: 15000 },
      ),
    ]).catch(() => {});

    const divisions = await page.evaluate((rpk) => {
      const results = new Set();

      // Strategy 1: links with event_sub_group that either match our event or are relative
      document.querySelectorAll("a[href]").forEach((a) => {
        try {
          const u = new URL(a.href, location.href);
          const mainGroup = u.searchParams.get("event_main_group");
          const subGroup = u.searchParams.get("event_sub_group");
          if (!subGroup) return;
          // Accept if: no event_main_group (relative), or explicitly our event
          if (mainGroup === null || mainGroup === rpk) results.add(subGroup);
        } catch { /* ignore malformed hrefs */ }
      });

      // Strategy 2: a <select> dedicated to contest/division selection (already scoped to the event)
      const selectSelectors = [
        'select[name="event_sub_group"]',
        'select[name="contest_id"]',
        'select[name="contest"]',
        "select.contest-select",
        "select.division-select",
      ];
      for (const sel of selectSelectors) {
        document.querySelectorAll(`${sel} option`).forEach((opt) => {
          const t = (opt.textContent || "").trim();
          const v = (opt.value || "").trim();
          if (t && t.length > 2 && !/^[-–]+$/.test(t)) results.add(t);
          else if (v && !/^\d+$/.test(v)) results.add(v);
        });
      }

      return [...results];
    }, resultsPageKey);

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
