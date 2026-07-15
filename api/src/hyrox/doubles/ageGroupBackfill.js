import { fetchListPageByAgeClass, parseListResultCount, parseListRows } from "../../contentStudio/hyroxScraper.js";
import { HYROX_SCRAPER_DIVISIONS } from "./doublesScraper.js";

// Mika Timing filter codes → display values stored in the DB.
// Codes come from the search[age_class] dropdown on the HYROX results site.
export const AGE_CLASS_MAP = Object.freeze([
  { code: "U24", display: "16-24" },
  { code: "25",  display: "25-29" },
  { code: "30",  display: "30-34" },
  { code: "35",  display: "35-39" },
  { code: "40",  display: "40-44" },
  { code: "45",  display: "45-49" },
  { code: "50",  display: "50-54" },
  { code: "55",  display: "55-59" },
  { code: "60",  display: "60-64" },
  { code: "65",  display: "65-69" },
  { code: "70",  display: "70-74" },
  { code: "75",  display: "75-79" },
  { code: "80",  display: "80-84" },
  { code: "85",  display: "85-89" },
  { code: "90+", display: "90+"   },
]);

const PAGE_SIZE = 100;
const KNOWN_DIVISION_CATEGORIES = new Set(HYROX_SCRAPER_DIVISIONS);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function sexCodeForDivisionCategory(divisionCategory) {
  const category = String(divisionCategory ?? "").trim().toLowerCase();
  if (!KNOWN_DIVISION_CATEGORIES.has(category)) {
    throw new Error(`Unknown HYROX division category for age-group backfill: ${divisionCategory}`);
  }
  if (category.endsWith("_male")) return "M";
  if (category.endsWith("_female")) return "W";
  if (category.endsWith("_mixed")) return "X";
  throw new Error(`HYROX division category has no sex suffix for age-group backfill: ${divisionCategory}`);
}

export function buildAgeGroupBackfillPairs(rows = []) {
  const pairsByKey = new Map();
  for (const row of rows) {
    const sourceContestId = row.source_contest_id;
    const season = row.season;
    const sexCode = sexCodeForDivisionCategory(row.division_category);
    const key = `${sourceContestId ?? ""}\u0000${season ?? ""}\u0000${sexCode}`;
    if (!pairsByKey.has(key)) {
      pairsByKey.set(key, {
        source_contest_id: sourceContestId,
        season,
        sex_code: sexCode,
      });
    }
  }
  return [...pairsByKey.values()].sort((a, b) =>
    String(a.source_contest_id ?? "").localeCompare(String(b.source_contest_id ?? ""))
    || String(a.sex_code ?? "").localeCompare(String(b.sex_code ?? "")));
}

export async function getAgeGroupBackfillStatus(pool, jobId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int                                    AS total,
       COUNT(*) FILTER (WHERE age_group IS NULL)::int  AS missing
     FROM hyrox_doubles_scraped_results
     WHERE scrape_job_id = $1`,
    [jobId],
  );
  const row = rows[0] ?? {};
  return { total: Number(row.total ?? 0), missing: Number(row.missing ?? 0) };
}

export async function backfillAgeGroupsForJob(pool, jobId, {
  interPageDelayMs = 1500,
  interClassDelayMs = 500,
  interEventDelayMs = 2000,
} = {}) {
  // One row per (source_contest_id, sex) pair that still has records without age_group.
  // source_contest_id is the real Mika Timing key (e.g. HD_AMS26_OVERALL) — NOT results_page_key
  // which stores human-readable names and cannot be used in API URLs.
  const { rows: pairRows } = await pool.query(
    `SELECT DISTINCT
       r.source_contest_id,
       e.season,
       r.division_category
     FROM hyrox_doubles_scraped_results r
     JOIN hyrox_events e ON e.id = r.hyrox_event_id
     WHERE r.scrape_job_id = $1
       AND r.age_group IS NULL
     ORDER BY r.source_contest_id, r.division_category`,
    [jobId],
  );
  const pairs = buildAgeGroupBackfillPairs(pairRows);

  let totalUpdated = 0;

  for (let pairIdx = 0; pairIdx < pairs.length; pairIdx++) {
    const { source_contest_id, season, sex_code } = pairs[pairIdx];
    // Build a full athleteId → display age group map by sweeping every age class.
    const athleteMap = new Map();

    for (const { code, display } of AGE_CLASS_MAP) {
      let page = 1;
      let fetchedSoFar = 0;
      while (true) {
        const sexFilter = sex_code === "X" ? "%" : sex_code;
        const html = await fetchListPageByAgeClass(source_contest_id, season, sexFilter, code, {
          numResults: PAGE_SIZE,
          page,
        });
        const rows = parseListRows(html);
        if (!rows.length) break;

        fetchedSoFar += rows.length;
        for (const row of rows) {
          if (row.athleteId && !athleteMap.has(row.athleteId)) {
            athleteMap.set(row.athleteId, display);
          }
        }

        // Server may return fewer rows than PAGE_SIZE even mid-stream, so exhaust by
        // totalCount when available rather than by comparing rows.length to PAGE_SIZE.
        const totalCount = parseListResultCount(html);
        const exhausted = totalCount !== null
          ? fetchedSoFar >= totalCount
          : rows.length < PAGE_SIZE;
        if (exhausted) break;
        page++;
        if (interPageDelayMs > 0) await sleep(interPageDelayMs);
      }
      if (interClassDelayMs > 0) await sleep(interClassDelayMs);
    }

    if (athleteMap.size > 0) {
      const athleteIds = [...athleteMap.keys()];
      const ageGroups = athleteIds.map((id) => athleteMap.get(id));
      const result = await pool.query(
        `UPDATE hyrox_doubles_scraped_results
         SET age_group = updates.age_group, updated_at = now()
         FROM (
           SELECT unnest($1::text[]) AS source_athlete_id,
                  unnest($2::text[]) AS age_group
         ) updates
         WHERE hyrox_doubles_scraped_results.source_athlete_id = updates.source_athlete_id
           AND hyrox_doubles_scraped_results.source_contest_id = $3
           AND hyrox_doubles_scraped_results.scrape_job_id     = $4
           AND hyrox_doubles_scraped_results.age_group IS NULL`,
        [athleteIds, ageGroups, source_contest_id, jobId],
      );
      totalUpdated += result.rowCount;
    }

    if (pairIdx < pairs.length - 1 && interEventDelayMs > 0) await sleep(interEventDelayMs);
  }

  return { totalUpdated, pairsProcessed: pairs.length };
}
