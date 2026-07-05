import express from "express";
import { pool as defaultPool } from "../db.js";
import { countAvailableDoublesRecords, DOUBLES_DIVISIONS } from "../hyrox/doubles/doublesScraper.js";
import { createJob } from "../hyrox/doubles/doublesJobRunner.js";
import { buildDoublesBenchmarks } from "../hyrox/scripts/buildDoublesBenchmarks.js";

function toCamelRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, chr) => chr.toUpperCase()),
      value,
    ]),
  );
}

export function createAdminHyroxDoublesRouter(pool = defaultPool, options = {}) {
  const availabilityCounter = options.availabilityCounter ?? countAvailableDoublesRecords;
  const router = express.Router();

function validateJobBody(body = {}) {
  const selectedEventIds = body.selectedEventIds ?? body.selected_event_ids;
  const selectedDivisions = body.selectedDivisions ?? body.selected_divisions;
  if (!Array.isArray(selectedEventIds) || selectedEventIds.length === 0 || selectedEventIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return "selectedEventIds must be a non-empty array of positive integers";
  }
  if (!Array.isArray(selectedDivisions) || selectedDivisions.length === 0 || selectedDivisions.some((division) => !DOUBLES_DIVISIONS.includes(division))) {
    return `selectedDivisions must contain one or more of: ${DOUBLES_DIVISIONS.join(", ")}`;
  }
  return null;
}

router.get("/hyrox-doubles/events", async (_req, res) => {
  try {
    const { rows } = await pool.query(
	      `SELECT
	        e.id, e.season, e.event_name, e.city, e.country,
	        e.start_date, e.results_page_key, e.is_championship,
	        e.doubles_availability_json, e.doubles_availability_checked_at,
	        COALESCE(SUM(r.division_count), 0)::int AS doubles_record_count,
	        COALESCE(SUM(r.division_count), 0) > 0 AS doubles_already_scraped,
	        COALESCE(
	          jsonb_object_agg(r.division_category, r.division_count) FILTER (WHERE r.division_category IS NOT NULL),
	          '{}'::jsonb
	        ) AS doubles_record_counts_by_category
	       FROM hyrox_events e
	       LEFT JOIN (
	         SELECT hyrox_event_id, division_category, COUNT(*)::int AS division_count
	         FROM hyrox_doubles_scraped_results
	         GROUP BY hyrox_event_id, division_category
	       ) r ON r.hyrox_event_id = e.id
	       WHERE e.has_results = true AND e.results_page_key IS NOT NULL
	       GROUP BY e.id
       ORDER BY e.start_date DESC NULLS LAST, e.season DESC, e.event_name`,
    );
    return res.json({ ok: true, events: rows.map(toCamelRow) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/hyrox-doubles/stats", async (_req, res) => {
  try {
    const byDivision = await pool.query(
      `SELECT
        division_category,
        COUNT(*)::int AS total_records,
        COUNT(*) FILTER (WHERE data_quality_status = 'valid')::int AS valid_records,
        COUNT(*) FILTER (WHERE data_quality_status = 'partial')::int AS partial_records,
        COUNT(*) FILTER (WHERE data_quality_status = 'invalid')::int AS invalid_records,
        COUNT(DISTINCT hyrox_event_id)::int AS events_covered
       FROM hyrox_doubles_scraped_results
       GROUP BY division_category
       ORDER BY division_category`,
    );
    const totals = await pool.query(
      `SELECT
        COUNT(*)::int AS total_records,
        COUNT(DISTINCT hyrox_event_id)::int AS events_covered,
        MAX(scraped_at) AS last_scraped_at
       FROM hyrox_doubles_scraped_results`,
    );
    const total = totals.rows[0] ?? {};
    return res.json({
      ok: true,
      byDivision: byDivision.rows.map(toCamelRow),
      totalRecords: Number(total.total_records ?? 0),
      eventsCovered: Number(total.events_covered ?? 0),
      lastScrapedAt: total.last_scraped_at ?? null,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/hyrox-doubles/events/:id/availability", async (req, res) => {
  const selectedDivisions = req.body?.selectedDivisions ?? req.body?.selected_divisions ?? DOUBLES_DIVISIONS;
  if (!Array.isArray(selectedDivisions) || selectedDivisions.length === 0 || selectedDivisions.some((division) => !DOUBLES_DIVISIONS.includes(division))) {
    return res.status(400).json({ ok: false, error: `selectedDivisions must contain one or more of: ${DOUBLES_DIVISIONS.join(", ")}` });
  }

  try {
    const eventResult = await pool.query(
      `SELECT id, season, event_name, city, country, start_date, results_page_key
       FROM hyrox_events
       WHERE id=$1`,
      [Number(req.params.id)],
    );
    if (!eventResult.rows.length) return res.status(404).json({ ok: false, error: "Event not found" });

    const event = eventResult.rows[0];
    if (!event.results_page_key) return res.status(400).json({ ok: false, error: "Event has no results page key" });

	    const availability = await availabilityCounter(event.results_page_key, event.season, selectedDivisions, {
	      interPageDelayMs: 250,
	    });
	    const checkedAt = new Date().toISOString();
	    const cachedAvailability = { ...availability, checkedAt };
	    await pool.query(
	      `UPDATE hyrox_events
	       SET doubles_availability_json=$2::jsonb,
	           doubles_availability_checked_at=$3::timestamptz
	       WHERE id=$1`,
	      [event.id, JSON.stringify(cachedAvailability), checkedAt],
	    );
	    return res.json({
	      ok: true,
	      event: toCamelRow(event),
	      availability: cachedAvailability,
	    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/hyrox-doubles/jobs", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         j.*,
         current_event.event_name AS current_event_name,
         current_event.city AS current_event_city,
         current_event.country AS current_event_country,
         location_summary.records_available AS total_records_available,
         COALESCE(location_summary.locations, '[]'::jsonb) AS location_summary
       FROM hyrox_doubles_scrape_jobs j
       LEFT JOIN hyrox_events current_event ON current_event.id = j.current_event_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(
           jsonb_build_object(
             'eventId', grouped.hyrox_event_id,
             'eventName', grouped.event_name,
             'city', grouped.city,
             'country', grouped.country,
             'startDate', grouped.start_date,
             'divisions', grouped.divisions,
             'recordsAvailable', grouped.records_available,
             'recordsFound', grouped.records_found,
             'recordsSaved', grouped.records_saved,
             'duplicatesSkipped', grouped.duplicates_skipped,
             'statuses', grouped.statuses
           )
           ORDER BY grouped.start_date DESC NULLS LAST, grouped.event_name
         ) AS locations,
         SUM(grouped.records_available)::int AS records_available
         FROM (
           SELECT
             je.hyrox_event_id,
             e.event_name,
             e.city,
             e.country,
             e.start_date,
             array_agg(je.division_category ORDER BY je.division_category) AS divisions,
             SUM(NULLIF(availability_division.value->>'recordsAvailable', '')::int)::int AS records_available,
             COALESCE(SUM(je.records_found), 0)::int AS records_found,
             COALESCE(SUM(je.records_saved), 0)::int AS records_saved,
             COALESCE(SUM(je.duplicates_skipped), 0)::int AS duplicates_skipped,
             jsonb_object_agg(je.division_category, je.status ORDER BY je.division_category) AS statuses
           FROM hyrox_doubles_scrape_job_events je
           JOIN hyrox_events e ON e.id = je.hyrox_event_id
           LEFT JOIN LATERAL jsonb_array_elements(COALESCE(e.doubles_availability_json->'divisions', '[]'::jsonb)) availability_division(value)
             ON availability_division.value->>'divisionCategory' = je.division_category
           WHERE je.job_id = j.id
           GROUP BY je.hyrox_event_id, e.event_name, e.city, e.country, e.start_date
         ) grouped
       ) location_summary ON TRUE
       ORDER BY j.created_at DESC
       LIMIT 50`,
    );
    return res.json({ ok: true, jobs: rows.map(toCamelRow) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/hyrox-doubles/jobs", async (req, res) => {
  const validationError = validateJobBody(req.body);
  if (validationError) return res.status(400).json({ ok: false, error: validationError });
  try {
    const result = await createJob(pool, {
      selectedEventIds: req.body.selectedEventIds ?? req.body.selected_event_ids,
      selectedDivisions: req.body.selectedDivisions ?? req.body.selected_divisions,
      enrichSplits: req.body.enrichSplits ?? req.body.enrich_splits ?? false,
      targetRecordCount: req.body.targetRecordCount ?? req.body.target_record_count ?? 15000,
    });
    if (result.error) return res.status(400).json({ ok: false, error: result.error });
    return res.status(201).json({ ok: true, jobId: result.jobId });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/hyrox-doubles/jobs/:id", async (req, res) => {
  try {
    const job = await pool.query("SELECT * FROM hyrox_doubles_scrape_jobs WHERE id=$1", [req.params.id]);
    if (!job.rows.length) return res.status(404).json({ ok: false, error: "Job not found" });
    const events = await pool.query(
      "SELECT * FROM hyrox_doubles_scrape_job_events WHERE job_id=$1 ORDER BY id",
      [req.params.id],
    );
    return res.json({ ok: true, job: toCamelRow(job.rows[0]), events: events.rows.map(toCamelRow) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/hyrox-doubles/benchmark-readiness", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
        g.division,
        g.sample_size AS sample_size,
        g.created_at AS built_at,
        COUNT(m.metric_key)::int AS metric_count,
        ARRAY_AGG(m.metric_key ORDER BY m.metric_key) FILTER (WHERE m.metric_key IS NOT NULL) AS metrics_available
      FROM hyrox_benchmark_groups g
      LEFT JOIN hyrox_benchmark_metrics m ON m.group_key = g.group_key
      WHERE g.dataset_version = 'doubles_v1'
      GROUP BY g.division, g.sample_size, g.created_at
      ORDER BY g.division`,
    );

    const source = process.env.HYROX_DOUBLES_BENCHMARK_SOURCE ?? (process.env.USE_DOUBLES_BENCHMARK_DATASET === "true" ? "enriched" : "legacy");
    return res.json({
      ok: true,
      source,
      divisions: rows.map((row) => ({
        division: row.division,
        sampleSize: Number(row.sample_size),
        metricCount: row.metric_count,
        metricsAvailable: row.metrics_available ?? [],
        builtAt: row.built_at,
        isReady: Number(row.sample_size) >= 100,
      })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/hyrox-doubles/benchmarks/build", async (_req, res) => {
  try {
    const summary = await buildDoublesBenchmarks();
    return res.json({ ok: true, ...summary });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

async function transitionJob(req, res, sql, errorMessage) {
  try {
    const result = await pool.query(sql, [req.params.id]);
    if (!result.rows.length) return res.status(400).json({ ok: false, error: errorMessage });
    return res.json({ ok: true, jobId: result.rows[0].id, status: result.rows[0].status });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

router.patch("/hyrox-doubles/jobs/:id/pause", async (req, res) => {
  await transitionJob(
    req,
    res,
    `UPDATE hyrox_doubles_scrape_jobs
     SET status='paused', paused_at=now(), cooldown_until=NULL, updated_at=now()
     WHERE id=$1 AND status='running'
     RETURNING id, status`,
    "Can only pause a running job",
  );
});

router.patch("/hyrox-doubles/jobs/:id/resume", async (req, res) => {
  await transitionJob(
    req,
    res,
    `UPDATE hyrox_doubles_scrape_jobs
     SET status='queued', resumed_at=now(), cooldown_until=NULL, updated_at=now()
     WHERE id=$1 AND status='paused'
     RETURNING id, status`,
    "Can only resume a paused job",
  );
});

router.patch("/hyrox-doubles/jobs/:id/cancel", async (req, res) => {
  await transitionJob(
    req,
    res,
    `UPDATE hyrox_doubles_scrape_jobs
     SET status='cancelled', cancelled_at=now(), cooldown_until=NULL, updated_at=now()
     WHERE id=$1 AND status IN ('queued','running','paused','retrying')
     RETURNING id, status`,
    "Can only cancel an active job",
  );
});

router.patch("/hyrox-doubles/jobs/:id/retry-failed", async (req, res) => {
  try {
    const reset = await pool.query(
      `UPDATE hyrox_doubles_scrape_job_events
       SET status='pending', retry_count=0, last_error=NULL, last_error_at=NULL
       WHERE job_id=$1 AND status='failed'`,
      [req.params.id],
    );
    const job = await pool.query(
      `UPDATE hyrox_doubles_scrape_jobs
       SET status='retrying',
           total_errors=0,
           failed_at=NULL,
           completed_at=NULL,
           last_error=NULL,
           last_error_at=NULL,
           cooldown_until=NULL,
           updated_at=now()
       WHERE id=$1
       RETURNING id, status`,
      [req.params.id],
    );
    if (!job.rows.length) return res.status(404).json({ ok: false, error: "Job not found" });
    return res.json({ ok: true, jobId: job.rows[0].id, status: job.rows[0].status, resetCount: reset.rowCount });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/hyrox-doubles/jobs/:id/errors", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM hyrox_doubles_scrape_errors WHERE job_id=$1 ORDER BY occurred_at DESC LIMIT 100",
      [req.params.id],
    );
    return res.json({ ok: true, errors: rows.map(toCamelRow) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

  return router;
}

export const adminHyroxDoublesRouter = createAdminHyroxDoublesRouter(defaultPool);
