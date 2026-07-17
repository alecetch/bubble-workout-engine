import {
  DOUBLES_DIVISIONS,
  buildResultRow,
  discoverDoublesContestIds,
  enrichDoublesRows,
  insertResultsBatch,
  scrapeDoublesPage,
  validateAndFlagRow,
} from "./doublesScraper.js";

const INTER_DIVISION_DELAY_MS = Number(process.env.HYROX_DOUBLES_INTER_DIVISION_DELAY_MS || 60000);
const INTER_PAGE_DELAY_MS = Number(process.env.HYROX_DOUBLES_INTER_PAGE_DELAY_MS || 8000);
const RUNNER_INTERVAL_MS = Number(process.env.HYROX_DOUBLES_RUNNER_INTERVAL_MS || 10000);
const PAGE_SIZE = 50;
const PAGE_RETRY_BACKOFF_MS = [30000, 120000, 300000];
const RATE_LIMIT_COOLDOWN_MS = Number(process.env.HYROX_DOUBLES_RATE_LIMIT_COOLDOWN_MS || 4 * 60 * 60 * 1000);

class RateLimitCooldownError extends Error {
  constructor(message, cooldownMs = RATE_LIMIT_COOLDOWN_MS) {
    super(message);
    this.name = "RateLimitCooldownError";
    this.cooldownMs = cooldownMs;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const message = String(err?.message ?? err ?? "");
  return err?.status === 403 || err?.statusCode === 403 || /\bHTTP 403\b/i.test(message);
}

function isRateLimitCooldownError(err) {
  return err instanceof RateLimitCooldownError || err?.name === "RateLimitCooldownError";
}

function validateJobConfig({ selectedEventIds, selectedDivisions }) {
  if (!Array.isArray(selectedEventIds) || selectedEventIds.length === 0 || selectedEventIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return "selectedEventIds must be a non-empty array of positive integers";
  }
  if (!Array.isArray(selectedDivisions) || selectedDivisions.length === 0 || selectedDivisions.some((division) => !DOUBLES_DIVISIONS.includes(division))) {
    return `selectedDivisions must contain one or more of: ${DOUBLES_DIVISIONS.join(", ")}`;
  }
  return null;
}

export async function createJob(pool, {
  selectedEventIds,
  selectedDivisions,
  targetRecordCount = 15000,
  enrichSplits = false,
}) {
  const validationError = validateJobConfig({ selectedEventIds, selectedDivisions });
  if (validationError) return { error: validationError };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const jobResult = await client.query(
      `INSERT INTO hyrox_doubles_scrape_jobs
        (selected_event_ids, selected_divisions, target_record_count, enrich_splits)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [selectedEventIds, selectedDivisions, targetRecordCount, Boolean(enrichSplits)],
    );
    const jobId = jobResult.rows[0].id;
    let totalEvents = 0;
    for (const eventId of selectedEventIds) {
      for (const division of selectedDivisions) {
        await client.query(
          `INSERT INTO hyrox_doubles_scrape_job_events
            (job_id, hyrox_event_id, division_category)
           VALUES ($1, $2, $3)
           ON CONFLICT (job_id, hyrox_event_id, division_category) DO NOTHING`,
          [jobId, eventId, division],
        );
        totalEvents += 1;
      }
    }
    await client.query("UPDATE hyrox_doubles_scrape_jobs SET total_events = $2, updated_at = now() WHERE id = $1", [jobId, totalEvents]);
    await client.query("COMMIT");
    return { jobId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function pickNextJob(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT * FROM hyrox_doubles_scrape_jobs
       WHERE status IN ('queued', 'retrying')
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function releaseExpiredCooldownJobs(pool) {
  await pool.query(
    `UPDATE hyrox_doubles_scrape_jobs
     SET status='retrying',
         resumed_at=now(),
         cooldown_until=NULL,
         updated_at=now()
     WHERE status='paused'
       AND cooldown_until IS NOT NULL
       AND cooldown_until <= now()`,
  );
}

async function logScrapeError(pool, { jobId, jobEventId, hyroxEventId, divisionCategory, pageOffset, error, retryNumber = 0, errorType = "network" }) {
  await pool.query(
    `INSERT INTO hyrox_doubles_scrape_errors
      (job_id, job_event_id, hyrox_event_id, division_category, page_offset, error_type, error_message, retry_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [jobId, jobEventId, hyroxEventId, divisionCategory, pageOffset, errorType, error?.message ?? String(error), retryNumber],
  );
}

async function scrapePageWithRetry(pool, { jobId, unit, event, contestId, sexCode, pageOffset }) {
  let lastError = null;
  for (let attempt = 0; attempt <= PAGE_RETRY_BACKOFF_MS.length; attempt += 1) {
    try {
      return await scrapeDoublesPage(event.results_page_key, contestId, event.season, pageOffset, sexCode);
    } catch (err) {
      lastError = err;
      if (isRateLimitError(err)) {
        const cooldownMinutes = Math.max(1, Math.round(RATE_LIMIT_COOLDOWN_MS / 60000));
        const cooldownError = new RateLimitCooldownError(
          `HYROX returned HTTP 403; scraper paused for a ${cooldownMinutes} minute cooldown before retrying.`,
        );
        await logScrapeError(pool, {
          jobId,
          jobEventId: unit.id,
          hyroxEventId: unit.hyrox_event_id,
          divisionCategory: unit.division_category,
          pageOffset,
          error: cooldownError,
          retryNumber: attempt + 1,
          errorType: "rate_limited",
        });
        throw cooldownError;
      }
      await logScrapeError(pool, {
        jobId,
        jobEventId: unit.id,
        hyroxEventId: unit.hyrox_event_id,
        divisionCategory: unit.division_category,
        pageOffset,
        error: err,
        retryNumber: attempt + 1,
      });
      if (attempt >= PAGE_RETRY_BACKOFF_MS.length) break;
      await sleep(PAGE_RETRY_BACKOFF_MS[attempt]);
    }
  }
  throw lastError;
}

async function updateJobAggregates(pool, jobId) {
  await pool.query(
    `UPDATE hyrox_doubles_scrape_jobs j
     SET
       total_records_found = COALESCE(s.records_found, 0),
       total_records_saved = COALESCE(s.records_saved, 0),
       total_duplicates_skipped = COALESCE(s.duplicates_skipped, 0),
       events_completed = COALESCE(s.events_completed, 0),
       updated_at = now()
     FROM (
       SELECT
         job_id,
         SUM(records_found)::int AS records_found,
         SUM(records_saved)::int AS records_saved,
         SUM(duplicates_skipped)::int AS duplicates_skipped,
         COUNT(*) FILTER (WHERE status IN ('completed','skipped','failed'))::int AS events_completed
       FROM hyrox_doubles_scrape_job_events
       WHERE job_id = $1
       GROUP BY job_id
     ) s
     WHERE j.id = s.job_id`,
    [jobId],
  );
}

export async function finalizeJobStatus(pool, jobId, finalStatus, finalError) {
  await pool.query(
    `UPDATE hyrox_doubles_scrape_jobs
     SET status=$2,
         completed_at=CASE WHEN $2='completed' THEN now() ELSE completed_at END,
         failed_at=CASE WHEN $2='failed' THEN now() ELSE NULL END,
         total_errors=CASE WHEN $2='completed' THEN 0 ELSE total_errors END,
         last_error=CASE WHEN $2='completed' AND $3::text IS NOT NULL THEN $3::text WHEN $2='completed' THEN NULL ELSE COALESCE($3::text, last_error) END,
         last_error_at=CASE WHEN $2='completed' AND $3::text IS NOT NULL THEN now() WHEN $2='completed' THEN NULL WHEN $3::text IS NULL THEN last_error_at ELSE now() END,
         cooldown_until=NULL,
         updated_at=now()
     WHERE id=$1 AND status='running'`,
    [jobId, finalStatus, finalError],
  );
}

export async function runJob(jobId, pool) {
  await pool.query(
    `UPDATE hyrox_doubles_scrape_jobs
     SET status='running', started_at=COALESCE(started_at, now()), updated_at=now()
     WHERE id=$1`,
    [jobId],
  );
  await pool.query(
    `UPDATE hyrox_doubles_scrape_job_events
     SET status='pending',
         retry_count=retry_count + 1,
         last_error=COALESCE(last_error, 'Recovered stale running unit'),
         last_error_at=COALESCE(last_error_at, now())
     WHERE job_id=$1 AND status='running'`,
    [jobId],
  );

  const { rows: units } = await pool.query(
    `SELECT *
     FROM hyrox_doubles_scrape_job_events
     WHERE job_id=$1 AND status='pending'
     ORDER BY id ASC`,
    [jobId],
  );
  const jobConfig = await pool.query("SELECT enrich_splits FROM hyrox_doubles_scrape_jobs WHERE id=$1", [jobId]);
  const enrichSplits = Boolean(jobConfig.rows[0]?.enrich_splits);

  for (const unit of units) {
    const eventResult = await pool.query(
      `SELECT id, results_page_key, season, event_name, city, country, start_date, is_championship
       FROM hyrox_events
       WHERE id=$1`,
      [unit.hyrox_event_id],
    );
    const event = eventResult.rows[0];
    if (!event?.results_page_key) {
      await pool.query(
        "UPDATE hyrox_doubles_scrape_job_events SET status='skipped', completed_at=now(), last_error=$2 WHERE id=$1",
        [unit.id, "Event has no results_page_key"],
      );
      continue;
    }

    const discovered = await discoverDoublesContestIds(event.results_page_key, event.season, [unit.division_category]);
    const candidates = discovered.filter((candidate) => candidate.divisionCategory === unit.division_category);
    if (!candidates.length) {
      await pool.query(
        "UPDATE hyrox_doubles_scrape_job_events SET status='skipped', completed_at=now(), last_error=$2 WHERE id=$1",
        [unit.id, "No matching doubles contest found"],
      );
      continue;
    }

    await pool.query(
      `UPDATE hyrox_doubles_scrape_job_events
       SET contest_id=$2, status='running', started_at=COALESCE(started_at, now())
       WHERE id=$1`,
      [unit.id, candidates[0].contestId],
    );
    await pool.query(
      `UPDATE hyrox_doubles_scrape_jobs
       SET current_event_id=$2, current_division=$3, current_page_offset=0, updated_at=now()
       WHERE id=$1`,
      [jobId, unit.hyrox_event_id, unit.division_category],
    );

    let unitCompleted = false;
    let unitTerminalStatus = "completed";
    let unitTerminalError = null;
    let activePageOffset = unit.last_page_offset ?? 0;
    try {
      let totalYielded = 0;
      const emptyCandidates = [];

      for (const candidate of candidates) {
        const { contestId, sexCode } = candidate;
        let pageOffset = candidates.length === 1 ? activePageOffset : 0;
        let lastMaxRank = 0;
        let candidateYielded = 0;

        while (true) {
          activePageOffset = pageOffset;
          const pageRows = await scrapePageWithRetry(pool, { jobId, unit, event, contestId, sexCode, pageOffset });
          if (!pageRows.length) {
            if (candidateYielded === 0) {
              emptyCandidates.push(`contest ${contestId}${sexCode ? ` sex ${sexCode}` : ""}`);
            }
            break;
          }

          const maxRankOnPage = Math.max(...pageRows.map((row) => Number(row.rank ?? 0)));
          if (maxRankOnPage <= lastMaxRank) break;
          lastMaxRank = maxRankOnPage;

          const eventMeta = {
            eventName: event.event_name,
            city: event.city,
            country: event.country,
            startDate: event.start_date,
            season: event.season,
            isChampionship: event.is_championship,
          };
          let rows = pageRows
            .map((row) => buildResultRow(row, unit.hyrox_event_id, contestId, unit.division_category, jobId, eventMeta))
            .map(validateAndFlagRow);
          if (enrichSplits) {
            rows = await enrichDoublesRows(rows, contestId, event.season);
          }
          const { inserted, duplicates } = await insertResultsBatch(pool, rows);

          await pool.query(
            `UPDATE hyrox_doubles_scrape_job_events
             SET records_found = records_found + $2,
                 records_saved = records_saved + $3,
                 duplicates_skipped = duplicates_skipped + $4,
                 pages_scraped = pages_scraped + 1,
                 last_page_offset = $5,
                 last_success_at = now()
             WHERE id=$1`,
            [unit.id, rows.length, inserted, duplicates, pageOffset],
          );
          await pool.query(
            `UPDATE hyrox_doubles_scrape_jobs
             SET current_page_offset=$2, updated_at=now()
             WHERE id=$1`,
            [jobId, pageOffset],
          );
          await updateJobAggregates(pool, jobId);

          const statusResult = await pool.query("SELECT status FROM hyrox_doubles_scrape_jobs WHERE id=$1", [jobId]);
          if (["paused", "cancelled"].includes(statusResult.rows[0]?.status)) return;

          totalYielded += rows.length;
          candidateYielded += rows.length;
          if (rows.length < PAGE_SIZE || totalYielded >= Number.MAX_SAFE_INTEGER) break;
          pageOffset += PAGE_SIZE;
          await sleep(INTER_PAGE_DELAY_MS);
        }
      }

      if (totalYielded === 0) {
        unitTerminalStatus = "skipped";
        unitTerminalError = `No result rows found for ${emptyCandidates.join(", ")}`;
      }
      unitCompleted = true;

      if (unitCompleted) {
        await pool.query(
          "UPDATE hyrox_doubles_scrape_job_events SET status=$2, completed_at=now(), last_error=$3 WHERE id=$1 AND status='running'",
          [unit.id, unitTerminalStatus, unitTerminalError],
        );
      }
    } catch (err) {
      if (isRateLimitCooldownError(err) || isRateLimitError(err)) {
        const cooldownMinutes = Math.max(1, Math.round(RATE_LIMIT_COOLDOWN_MS / 60000));
        const cooldownError = isRateLimitCooldownError(err)
          ? err
          : new RateLimitCooldownError(`HYROX returned HTTP 403; scraper paused for a ${cooldownMinutes} minute cooldown before retrying.`);
        if (!isRateLimitCooldownError(err)) {
          await logScrapeError(pool, {
            jobId,
            jobEventId: unit.id,
            hyroxEventId: unit.hyrox_event_id,
            divisionCategory: unit.division_category,
            pageOffset: activePageOffset,
            error: cooldownError,
            retryNumber: 1,
            errorType: "rate_limited",
          });
        }
        await pool.query(
          `UPDATE hyrox_doubles_scrape_job_events
           SET status='pending',
               last_error=$2,
               last_error_at=now()
           WHERE id=$1`,
          [unit.id, cooldownError.message],
        );
        await pool.query(
          `UPDATE hyrox_doubles_scrape_jobs
           SET status='paused',
               paused_at=now(),
               cooldown_until=now() + ($3::int * interval '1 millisecond'),
               last_error=$2,
               last_error_at=now(),
               updated_at=now()
           WHERE id=$1`,
          [jobId, cooldownError.message, cooldownError.cooldownMs ?? RATE_LIMIT_COOLDOWN_MS],
        );
        await updateJobAggregates(pool, jobId);
        return;
      }
      await pool.query(
        `UPDATE hyrox_doubles_scrape_job_events
         SET status='failed', retry_count=retry_count + 1, last_error=$2, last_error_at=now()
         WHERE id=$1`,
        [unit.id, err.message],
      );
      await pool.query(
        `UPDATE hyrox_doubles_scrape_jobs
         SET total_errors=total_errors + 1, last_error=$2, last_error_at=now(), updated_at=now()
         WHERE id=$1`,
        [jobId, err.message],
      );
    }

    await updateJobAggregates(pool, jobId);
    const jobStatus = await pool.query("SELECT status FROM hyrox_doubles_scrape_jobs WHERE id=$1", [jobId]);
    if (["paused", "cancelled"].includes(jobStatus.rows[0]?.status)) return;
    await sleep(INTER_DIVISION_DELAY_MS);
  }

  const summary = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status='failed')::int AS failed_count,
       COUNT(*) FILTER (WHERE status='skipped')::int AS skipped_count,
       COALESCE(SUM(records_saved), 0)::int AS saved_count,
       COALESCE(SUM(records_found), 0)::int AS found_count,
       COALESCE(SUM(duplicates_skipped), 0)::int AS dupe_count
     FROM hyrox_doubles_scrape_job_events
     WHERE job_id=$1`,
    [jobId],
  );
  const hasFailed = Number(summary.rows[0]?.failed_count ?? 0) > 0;
  const foundCount = Number(summary.rows[0]?.found_count ?? 0);
  const dupeCount = Number(summary.rows[0]?.dupe_count ?? 0);
  const savedCount = Number(summary.rows[0]?.saved_count ?? 0);
  // Only treat skipped-with-no-records as a failure when nothing was found at all.
  // If records were found but all were duplicates (already in DB), the scrape completed correctly.
  const allSkippedWithNoRecords = Number(summary.rows[0]?.skipped_count ?? 0) > 0 && savedCount === 0 && foundCount === 0;
  const finalStatus = hasFailed || allSkippedWithNoRecords ? "failed" : "completed";
  const finalError = allSkippedWithNoRecords
    ? "No doubles records were saved for the selected event/divisions. Check job event details for missing contests or empty leaderboards."
    : (savedCount === 0 && dupeCount > 0)
      ? `All ${dupeCount} records found were already in the database — no new data for this scrape.`
      : null;
  await finalizeJobStatus(pool, jobId, finalStatus, finalError);
  await updateJobAggregates(pool, jobId);
}

export async function startJobRunnerLoop(pool) {
  const retryingJobs = await pool.query(
    `UPDATE hyrox_doubles_scrape_jobs
     SET status='retrying', updated_at=now()
     WHERE status='running'
     RETURNING id`,
  );
  const retryingJobIds = retryingJobs.rows.map((row) => row.id);
  if (retryingJobIds.length) {
    await pool.query(
      `UPDATE hyrox_doubles_scrape_job_events
       SET status='pending', retry_count=retry_count + 1, last_error='Recovered after runner restart', last_error_at=now()
       WHERE job_id = ANY($1::uuid[]) AND status='running'`,
      [retryingJobIds],
    );
  }

  async function tick() {
    try {
      await releaseExpiredCooldownJobs(pool);
      const job = await pickNextJob(pool);
      if (job) await runJob(job.id, pool);
    } catch (err) {
      console.error("[doublesJobRunner] tick error:", err.message);
    }
  }

  setInterval(tick, RUNNER_INTERVAL_MS);
}
