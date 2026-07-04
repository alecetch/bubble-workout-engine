import express from "express";
import { pool as defaultPool } from "../db.js";
import { countAvailableDoublesRecords, DOUBLES_DIVISIONS } from "../hyrox/doubles/doublesScraper.js";
import { createJob } from "../hyrox/doubles/doublesJobRunner.js";

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
        COUNT(r.id)::int AS doubles_record_count,
        COUNT(r.id) > 0 AS doubles_already_scraped
       FROM hyrox_events e
       LEFT JOIN hyrox_doubles_scraped_results r ON r.hyrox_event_id = e.id
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
    return res.json({
      ok: true,
      event: toCamelRow(event),
      availability,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/hyrox-doubles/jobs", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM hyrox_doubles_scrape_jobs ORDER BY created_at DESC LIMIT 50");
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
