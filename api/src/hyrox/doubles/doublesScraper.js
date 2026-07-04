import {
  buildDetailUrl,
  fetchDivisions,
  fetchDetailPage,
  fetchListPage,
  parseListResultCount,
  parseListRows,
  parseRaceReplay,
  parseTime,
  parseWorkoutSummary,
} from "../../contentStudio/hyroxScraper.js";

export const HYROX_SCRAPER_DIVISIONS = Object.freeze([
  "open_male",
  "open_female",
  "pro_male",
  "pro_female",
  "doubles_male",
  "doubles_female",
  "doubles_mixed",
  "pro_doubles_male",
  "pro_doubles_female",
  "pro_doubles_mixed",
  "team_relay_male",
  "team_relay_female",
  "team_relay_mixed",
]);
export const DOUBLES_DIVISIONS = HYROX_SCRAPER_DIVISIONS;

const PAGE_SIZE = 50;
const HYROX_DOUBLES_NUM_RESULTS = 100;
const ENRICH_BATCH_SIZE = Number(process.env.HYROX_DOUBLES_ENRICH_BATCH_SIZE || 2);
const ENRICH_BATCH_DELAY_MS = Number(process.env.HYROX_DOUBLES_ENRICH_BATCH_DELAY_MS || 3000);
const DETAIL_FETCH_TIMEOUT_MS = Number(process.env.HYROX_DOUBLES_DETAIL_TIMEOUT_MS || 10000);

const RUN_SPLIT_COLUMNS = Object.freeze({
  run_1: "split_run_1",
  run_2: "split_run_2",
  run_3: "split_run_3",
  run_4: "split_run_4",
  run_5: "split_run_5",
  run_6: "split_run_6",
  run_7: "split_run_7",
  run_8: "split_run_8",
});

const STATION_SPLIT_COLUMNS = Object.freeze({
  skierg: "split_skierg",
  sled_push: "split_sled_push",
  sled_pull: "split_sled_pull",
  burpee_bj: "split_burpee_bj",
  row: "split_row",
  farmers_carry: "split_farmers_carry",
  sandbag_lunge: "split_sandbag_lunge",
  wall_balls: "split_wall_balls",
});

const ROXZONE_COLUMNS = Object.freeze({
  skierg_rox_in: "rox_skierg_in",
  skierg_rox_out: "rox_skierg_out",
  sled_push_rox_in: "rox_sled_push_in",
  sled_push_rox_out: "rox_sled_push_out",
  sled_pull_rox_in: "rox_sled_pull_in",
  sled_pull_rox_out: "rox_sled_pull_out",
  burpee_bj_rox_in: "rox_burpee_bj_in",
  burpee_bj_rox_out: "rox_burpee_bj_out",
  row_rox_in: "rox_row_in",
  row_rox_out: "rox_row_out",
  farmers_carry_rox_in: "rox_farmers_carry_in",
  farmers_carry_rox_out: "rox_farmers_carry_out",
  sandbag_lunge_rox_in: "rox_sandbag_lunge_in",
  sandbag_lunge_rox_out: "rox_sandbag_lunge_out",
});

const ENRICHMENT_COLUMNS = Object.freeze([
  "athlete_1_name",
  "athlete_2_name",
  "run_total_seconds",
  "station_total_seconds",
  "roxzone_total_seconds",
  ...Object.values(RUN_SPLIT_COLUMNS),
  ...Object.values(STATION_SPLIT_COLUMNS),
  ...Object.values(ROXZONE_COLUMNS),
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const message = String(err?.message ?? err ?? "");
  return err?.status === 403 || err?.statusCode === 403 || /\bHTTP 403\b/i.test(message);
}

function categoriesFromDivisionLabel(label) {
  const text = String(label ?? "").toUpperCase();
  const isPro = text.includes("PRO");
  const isDoubles = text.includes("DOUBLES") || text.includes("DOUBLE");
  const isRelay = text.includes("RELAY");
  const sexCategories = [];

  if (text.includes("MIXED")) sexCategories.push({ suffix: "mixed", sexCode: "X" });
  else if (text.includes("WOMEN") || text.includes("FEMALE")) sexCategories.push({ suffix: "female", sexCode: "W" });
  else if (text.includes("MEN") || text.includes("MALE")) sexCategories.push({ suffix: "male", sexCode: "M" });
  else if (isDoubles || isRelay) {
    sexCategories.push(
      { suffix: "male", sexCode: "M" },
      { suffix: "female", sexCode: "W" },
      { suffix: "mixed", sexCode: "X" },
    );
  } else {
    sexCategories.push(
      { suffix: "male", sexCode: "M" },
      { suffix: "female", sexCode: "W" },
    );
  }

  if (isRelay) {
    return sexCategories.map((category) => ({
      divisionCategory: `team_relay_${category.suffix}`,
      sexCode: category.sexCode,
    }));
  }
  if (isDoubles) {
    const prefix = isPro ? "pro_doubles" : "doubles";
    return sexCategories.map((category) => ({
      divisionCategory: `${prefix}_${category.suffix}`,
      sexCode: category.sexCode,
    }));
  }
  if (isPro) {
    return sexCategories
      .filter((category) => category.suffix !== "mixed")
      .map((category) => ({
        divisionCategory: `pro_${category.suffix}`,
        sexCode: category.sexCode,
      }));
  }
  if (text.includes("HYROX") || text.includes("OPEN")) {
    return sexCategories
      .filter((category) => category.suffix !== "mixed")
      .map((category) => ({
        divisionCategory: `open_${category.suffix}`,
        sexCode: category.sexCode,
      }));
  }
  return [];
}

export async function discoverDoublesContestIds(resultsPageKey, season, selectedDivisions = DOUBLES_DIVISIONS, fetcher = fetchDivisions) {
  const allowed = new Set(selectedDivisions);
  const selectionRank = new Map(selectedDivisions.map((division, index) => [division, index]));
  const divisions = await fetcher(resultsPageKey, season);
  return divisions
    .flatMap((division) => {
      const isPro = String(division.label ?? "").toUpperCase().includes("PRO");
      const isDoubles = String(division.label ?? "").toUpperCase().includes("DOUBLE");
      const isRelay = String(division.label ?? "").toUpperCase().includes("RELAY");
      return categoriesFromDivisionLabel(division.label).map((category) => ({
        contestId: division.contestId,
        divisionCategory: category.divisionCategory,
        sexCode: category.sexCode,
        label: division.label,
        isPro,
        isDoubles,
        isRelay,
        selectionRank: selectionRank.get(category.divisionCategory) ?? Number.MAX_SAFE_INTEGER,
        isOverall: String(division.label ?? "").toUpperCase().includes("OVERALL"),
      }));
    })
    .filter((division) => allowed.has(division.divisionCategory))
    .sort((a, b) =>
      a.selectionRank - b.selectionRank
      || Number(a.isPro) - Number(b.isPro)
      || Number(a.isRelay) - Number(b.isRelay)
      || Number(a.isDoubles) - Number(b.isDoubles)
      || Number(b.isOverall) - Number(a.isOverall)
      || String(a.label ?? "").localeCompare(String(b.label ?? "")));
}

export async function scrapeDoublesPage(resultsPageKey, contestId, seasonNum, pageOffset = 0, sexCode = "") {
  const html = await fetchListPage(resultsPageKey, contestId, seasonNum, {
    sex: sexCode,
    numResults: HYROX_DOUBLES_NUM_RESULTS,
    page: Math.floor(pageOffset / PAGE_SIZE) + 1,
  });
  return parseListRows(html);
}

export async function* scrapeAllDoublesPages(resultsPageKey, contestId, seasonNum, {
  maxRecords = Infinity,
  interPageDelayMs = 1500,
  sexCode = "",
} = {}) {
  let offset = 0;
  let totalYielded = 0;
  let lastMaxRank = 0;

  while (totalYielded < maxRecords) {
    const rows = await scrapeDoublesPage(resultsPageKey, contestId, seasonNum, offset, sexCode);
    if (!rows.length) break;

    const maxRankOnPage = Math.max(...rows.map((row) => Number(row.rank ?? 0)));
    if (maxRankOnPage <= lastMaxRank) break;
    lastMaxRank = maxRankOnPage;

    yield { rows, pageOffset: offset };
    totalYielded += rows.length;

    if (rows.length < PAGE_SIZE || totalYielded >= maxRecords) break;
    offset += PAGE_SIZE;
    await sleep(interPageDelayMs);
  }
}

export async function countAvailableDoublesRecords(resultsPageKey, seasonNum, selectedDivisions = DOUBLES_DIVISIONS, {
  maxRecords = Infinity,
  interPageDelayMs = 250,
  divisionFetcher = fetchDivisions,
  pageScraper = scrapeDoublesPage,
  pageFetcher = fetchListPage,
} = {}) {
  const contests = await discoverDoublesContestIds(resultsPageKey, seasonNum, selectedDivisions, divisionFetcher);
  const divisions = [];

  for (const divisionCategory of selectedDivisions) {
    const contest = contests.find((candidate) => candidate.divisionCategory === divisionCategory);
    if (!contest) {
      divisions.push({
        divisionCategory,
        contestId: null,
        label: null,
        sexCode: null,
        recordsAvailable: 0,
        pages: 0,
        status: "no_contest",
      });
      continue;
    }

    let recordsAvailable = 0;
    let pages = 0;

    const firstPageHtml = await pageFetcher(resultsPageKey, contest.contestId, seasonNum, {
      sex: contest.sexCode,
      numResults: HYROX_DOUBLES_NUM_RESULTS,
      page: 1,
    });
    const resultCount = parseListResultCount(firstPageHtml);
    if (resultCount !== null) {
      recordsAvailable = Math.min(resultCount, maxRecords);
      pages = recordsAvailable > 0 ? Math.ceil(recordsAvailable / PAGE_SIZE) : 0;
    } else {
      let offset = 0;
      let lastMaxRank = 0;
      while (recordsAvailable < maxRecords) {
        const rows = await pageScraper(resultsPageKey, contest.contestId, seasonNum, offset, contest.sexCode);
        if (!rows.length) break;

        const maxRankOnPage = Math.max(...rows.map((row) => Number(row.rank ?? 0)));
        if (maxRankOnPage <= lastMaxRank) break;
        lastMaxRank = maxRankOnPage;

        recordsAvailable += rows.length;
        pages += 1;

        if (rows.length < PAGE_SIZE || recordsAvailable >= maxRecords) break;
        offset += PAGE_SIZE;
        await sleep(interPageDelayMs);
      }
    }

    divisions.push({
      divisionCategory,
      contestId: contest.contestId,
      label: contest.label,
      sexCode: contest.sexCode,
      recordsAvailable,
      pages,
      status: recordsAvailable > 0 ? "available" : "empty",
    });
  }

  return {
    totalRecordsAvailable: divisions.reduce((sum, division) => sum + Number(division.recordsAvailable ?? 0), 0),
    divisions,
    checkedAt: new Date().toISOString(),
  };
}

export function buildResultRow(rawRow, hyroxEventId, contestId, divisionCategory, jobId = null, eventMeta = {}) {
  const sourceAthleteId = rawRow.athleteId ?? null;
  return {
    hyrox_event_id: hyroxEventId,
    source_contest_id: contestId,
    source_athlete_id: sourceAthleteId,
    source_url: rawRow.sourceUrl ?? (sourceAthleteId ? buildDetailUrl(sourceAthleteId, contestId, eventMeta.season ?? null) : null),
    event_name: eventMeta.eventName ?? eventMeta.event_name ?? null,
    event_city: eventMeta.city ?? eventMeta.eventCity ?? null,
    event_country: eventMeta.country ?? eventMeta.eventCountry ?? null,
    event_date: eventMeta.startDate ?? eventMeta.eventDate ?? null,
    season: eventMeta.season ?? null,
    is_championship: Boolean(eventMeta.isChampionship ?? eventMeta.is_championship ?? false),
    division_category: divisionCategory,
    team_name: rawRow.name ?? null,
    overall_rank: rawRow.rank ?? null,
    overall_time_seconds: parseTime(rawRow.time),
    overall_time_raw: rawRow.time ?? null,
    data_quality_status: "pending",
    data_quality_flags: [],
    split_coverage_score: 0,
    raw_payload_json: rawRow,
    scrape_job_id: jobId,
  };
}

function uniqueTeamNames(teamName) {
  const names = String(teamName ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return [...new Set(names)];
}

function athleteNamesForRow(row) {
  const teamName = String(row.team_name ?? "").trim();
  const divisionCategory = String(row.division_category ?? "");
  if (!teamName) return [];
  if (divisionCategory.startsWith("open_") || (divisionCategory.startsWith("pro_") && !divisionCategory.startsWith("pro_doubles_"))) {
    return [teamName];
  }
  return uniqueTeamNames(teamName);
}

function sumValues(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) : null;
}

function splitCoverageScore(row) {
  const expectedColumns = [
    "run_total_seconds",
    "station_total_seconds",
    "roxzone_total_seconds",
    ...Object.values(RUN_SPLIT_COLUMNS),
    ...Object.values(STATION_SPLIT_COLUMNS),
    ...Object.values(ROXZONE_COLUMNS),
  ];
  const present = expectedColumns.filter((column) => Number.isFinite(row[column])).length;
  return Number((present / expectedColumns.length).toFixed(2));
}

export function enrichResultRowFromDetail(row, detailHtml) {
  const summary = parseWorkoutSummary(detailHtml);
  const roxzoneSplits = parseRaceReplay(detailHtml);
  const enriched = { ...row };
  const teamNames = athleteNamesForRow(row);
  enriched.athlete_1_name = teamNames[0] ?? null;
  enriched.athlete_2_name = teamNames[1] ?? null;

  for (const [splitKey, column] of Object.entries(RUN_SPLIT_COLUMNS)) {
    enriched[column] = summary.splits?.[splitKey] ?? null;
  }
  for (const [splitKey, column] of Object.entries(STATION_SPLIT_COLUMNS)) {
    enriched[column] = summary.splits?.[splitKey] ?? null;
  }
  for (const [splitKey, column] of Object.entries(ROXZONE_COLUMNS)) {
    enriched[column] = roxzoneSplits?.[splitKey] ?? null;
  }

  enriched.run_total_seconds = summary.runTotalSeconds ?? sumValues(Object.values(RUN_SPLIT_COLUMNS).map((column) => enriched[column]));
  enriched.station_total_seconds = sumValues(Object.values(STATION_SPLIT_COLUMNS).map((column) => enriched[column]));
  enriched.roxzone_total_seconds = summary.roxzoneSeconds ?? null;
  enriched.split_coverage_score = splitCoverageScore(enriched);
  enriched.raw_payload_json = {
    ...(row.raw_payload_json ?? {}),
    detail: {
      splits: summary.splits ?? {},
      splitRanks: summary.splitRanks ?? {},
      runTotalSeconds: summary.runTotalSeconds ?? null,
      bestRunLapSeconds: summary.bestRunLapSeconds ?? null,
      roxzoneSeconds: summary.roxzoneSeconds ?? null,
      roxzoneSplits,
    },
  };
  return enriched;
}

export async function enrichDoublesRows(rows, contestId, seasonNum, detailFetcher = fetchDetailPage) {
  const enriched = [...rows];
  const enrichable = enriched.filter((row) => row.source_athlete_id);

  for (let i = 0; i < enrichable.length; i += ENRICH_BATCH_SIZE) {
    const batch = enrichable.slice(i, i + ENRICH_BATCH_SIZE);
    await Promise.all(batch.map(async (row) => {
      const index = enriched.findIndex((candidate) => candidate.source_athlete_id === row.source_athlete_id);
      if (index === -1) return;
      try {
        const html = await detailFetcher(row.source_athlete_id, contestId, seasonNum, { timeoutMs: DETAIL_FETCH_TIMEOUT_MS });
        enriched[index] = enrichResultRowFromDetail(row, html);
      } catch (err) {
        if (isRateLimitError(err)) throw err;
        const flags = new Set(row.data_quality_flags ?? []);
        flags.add("detail_enrichment_failed");
        enriched[index] = {
          ...row,
          data_quality_status: row.data_quality_status === "invalid" ? "invalid" : "partial",
          data_quality_flags: [...flags],
          raw_payload_json: {
            ...(row.raw_payload_json ?? {}),
            detailError: err?.message ?? String(err),
          },
        };
      }
    }));
    if (i + ENRICH_BATCH_SIZE < enrichable.length) await sleep(ENRICH_BATCH_DELAY_MS);
  }

  return enriched;
}

export function validateAndFlagRow(row) {
  const criticalFlags = [];
  const warningFlags = [];

  if (!row.hyrox_event_id) criticalFlags.push("missing_event_id");
  if (!DOUBLES_DIVISIONS.includes(row.division_category)) criticalFlags.push("invalid_division");
  if (!row.overall_time_seconds || row.overall_time_seconds <= 0) criticalFlags.push("invalid_overall_time");
  if (!row.overall_rank || row.overall_rank < 1) warningFlags.push("invalid_rank");
  if (!row.source_athlete_id) warningFlags.push("no_athlete_id");
  if (!row.team_name) warningFlags.push("no_team_name");
  if (row.overall_time_seconds < 2400 || row.overall_time_seconds > 14400) warningFlags.push("implausible_time");

  const flags = [...criticalFlags, ...warningFlags];
  const data_quality_status = criticalFlags.length ? "invalid" : warningFlags.length ? "partial" : "valid";
  return { ...row, data_quality_status, data_quality_flags: flags };
}

const INSERT_COLUMNS = [
  "hyrox_event_id",
  "source_contest_id",
  "source_athlete_id",
  "source_url",
  "event_name",
  "event_city",
  "event_country",
  "event_date",
  "season",
  "is_championship",
  "division_category",
  "team_name",
  "athlete_1_name",
  "athlete_2_name",
  "overall_rank",
  "overall_time_seconds",
  "overall_time_raw",
  "run_total_seconds",
  "station_total_seconds",
  "roxzone_total_seconds",
  ...Object.values(RUN_SPLIT_COLUMNS),
  ...Object.values(STATION_SPLIT_COLUMNS),
  ...Object.values(ROXZONE_COLUMNS),
  "data_quality_status",
  "data_quality_flags",
  "split_coverage_score",
  "raw_payload_json",
  "scrape_job_id",
];

function valueForColumn(row, column) {
  if (column === "source_athlete_id") {
    return row.source_athlete_id ?? `missing:${row.overall_rank ?? "unknown"}:${row.team_name ?? "team"}`;
  }
  if (column === "data_quality_flags" || column === "raw_payload_json") {
    return JSON.stringify(row[column] ?? (column === "data_quality_flags" ? [] : {}));
  }
  return row[column] ?? null;
}

export async function insertResultsBatch(pool, rows) {
  if (!rows.length) return { inserted: 0, duplicates: 0 };

  const values = [];
  const placeholders = rows.map((row, rowIndex) => {
    const base = rowIndex * INSERT_COLUMNS.length;
    INSERT_COLUMNS.forEach((column) => values.push(valueForColumn(row, column)));
    return `(${INSERT_COLUMNS.map((_, colIndex) => `$${base + colIndex + 1}`).join(", ")})`;
  });

  const updatableColumns = [
    "source_url",
    "event_name",
    "event_city",
    "event_country",
    "event_date",
    "season",
    "is_championship",
    "team_name",
    ...ENRICHMENT_COLUMNS,
    "overall_rank",
    "overall_time_seconds",
    "overall_time_raw",
    "data_quality_status",
    "data_quality_flags",
    "split_coverage_score",
    "raw_payload_json",
    "scrape_job_id",
  ];
  const updateClause = updatableColumns
    .map((column) => `${column}=COALESCE(EXCLUDED.${column}, hyrox_doubles_scraped_results.${column})`)
    .join(", ");

  const result = await pool.query(
    `INSERT INTO hyrox_doubles_scraped_results (${INSERT_COLUMNS.join(", ")})
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (hyrox_event_id, source_contest_id, source_athlete_id) DO UPDATE
     SET ${updateClause},
         updated_at=now()
     RETURNING (xmax = 0) AS inserted`,
    values,
  );
  const inserted = result.rows.filter((row) => row.inserted).length;
  return { inserted, duplicates: rows.length - inserted };
}

export { parseRaceReplay, parseWorkoutSummary };
