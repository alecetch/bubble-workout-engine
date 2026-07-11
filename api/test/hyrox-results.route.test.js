import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createAdminHyroxResultsRouter } from "../src/routes/adminHyroxResults.js";

function buildPool() {
  const state = {
    jobs: [],
    events: [],
    jobEvents: [],
  };
  const pool = {
    state,
    async query(sql, params = []) {
      if (/FROM hyrox_doubles_scrape_jobs j/i.test(sql)) return { rows: state.jobs };
      if (/SELECT \* FROM hyrox_doubles_scrape_jobs ORDER BY/i.test(sql)) return { rows: state.jobs };
      if (/SELECT \* FROM hyrox_doubles_scrape_jobs WHERE id=\$1/i.test(sql)) {
        return { rows: state.jobs.filter((job) => job.id === params[0]) };
      }
      if (/SELECT \* FROM hyrox_doubles_scrape_job_events WHERE job_id=\$1/i.test(sql)) {
        return { rows: state.jobEvents.filter((event) => event.job_id === params[0]) };
      }
      if (/FROM hyrox_events\s+WHERE id=\$1/i.test(sql)) {
        return { rows: state.events.filter((event) => event.id === params[0]) };
      }
      if (/status='paused'.*status='running'/is.test(sql)) {
        const job = state.jobs.find((candidate) => candidate.id === params[0] && candidate.status === "running");
        if (!job) return { rows: [] };
        job.status = "paused";
        return { rows: [{ id: job.id, status: job.status }] };
      }
      if (/status='queued'.*status='paused'/is.test(sql)) {
        const job = state.jobs.find((candidate) => candidate.id === params[0] && candidate.status === "paused");
        if (!job) return { rows: [] };
        job.status = "queued";
        return { rows: [{ id: job.id, status: job.status }] };
      }
      if (/status='cancelled'/is.test(sql)) {
        const job = state.jobs.find((candidate) => candidate.id === params[0] && ["queued", "running", "paused", "retrying"].includes(candidate.status));
        if (!job) return { rows: [] };
        job.status = "cancelled";
        return { rows: [{ id: job.id, status: job.status }] };
      }
      if (/FROM hyrox_events e/i.test(sql)) return { rows: state.events };
      if (/GROUP BY division_category/i.test(sql)) return { rows: [] };
      if (/MAX\(scraped_at\)/i.test(sql)) return { rows: [{ total_records: 0, events_covered: 0, last_scraped_at: null }] };
      if (/FROM hyrox_doubles_scrape_errors/i.test(sql)) return { rows: [] };
      return { rows: [] };
    },
    async connect() {
      const client = {
        async query(sql, params = []) {
          if (/^BEGIN|^COMMIT|^ROLLBACK/i.test(sql)) return { rows: [] };
          if (/INSERT INTO hyrox_doubles_scrape_jobs/i.test(sql)) {
            const job = {
              id: "11111111-1111-4111-8111-111111111111",
              status: "queued",
              selected_event_ids: params[0],
              selected_divisions: params[1],
            };
            state.jobs.push(job);
            return { rows: [{ id: job.id }] };
          }
          if (/INSERT INTO hyrox_doubles_scrape_job_events/i.test(sql)) {
            state.jobEvents.push({
              id: `event-${state.jobEvents.length + 1}`,
              job_id: params[0],
              hyrox_event_id: params[1],
              division_category: params[2],
              status: "pending",
            });
            return { rows: [] };
          }
          if (/UPDATE hyrox_doubles_scrape_jobs SET total_events/i.test(sql)) {
            const job = state.jobs.find((candidate) => candidate.id === params[0]);
            if (job) job.total_events = params[1];
            return { rows: [] };
          }
          return { rows: [] };
        },
        release() {},
      };
      return client;
    },
  };
  return pool;
}

function buildApp(pool = buildPool(), options = {}) {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", createAdminHyroxResultsRouter(pool, options));
  return { app, pool };
}

async function request(app, path, options = {}) {
  const server = app.listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      headers: { "content-type": "application/json", ...(options.headers ?? {}) },
      ...options,
    });
    const body = await response.json();
    return { response, body };
  } finally {
    server.close();
  }
}

test("POST /admin/hyrox-results/jobs creates a job", async () => {
  const { app } = buildApp();
  const { response, body } = await request(app, "/api/admin/hyrox-results/jobs", {
    method: "POST",
    body: JSON.stringify({ selectedEventIds: [1], selectedDivisions: ["doubles_male"] }),
  });

  assert.equal(response.status, 201);
  assert.equal(body.ok, true);
  assert.match(body.jobId, /^[0-9a-f-]{36}$/i);
});

test("POST /admin/hyrox-results/jobs validates body", async () => {
  const { app } = buildApp();
  const missingEvents = await request(app, "/api/admin/hyrox-results/jobs", {
    method: "POST",
    body: JSON.stringify({ selectedDivisions: ["doubles_male"] }),
  });
  assert.equal(missingEvents.response.status, 400);

  const emptyDivisions = await request(app, "/api/admin/hyrox-results/jobs", {
    method: "POST",
    body: JSON.stringify({ selectedEventIds: [1], selectedDivisions: [] }),
  });
  assert.equal(emptyDivisions.response.status, 400);

  const invalidDivision = await request(app, "/api/admin/hyrox-results/jobs", {
    method: "POST",
    body: JSON.stringify({ selectedEventIds: [1], selectedDivisions: ["doubles"] }),
  });
  assert.equal(invalidDivision.response.status, 400);
});

test("GET /admin/hyrox-results/jobs lists jobs and detail", async () => {
  const { app, pool } = buildApp();
  pool.state.jobs.push({
    id: "job-1",
    status: "queued",
    total_records_available: 120,
    location_summary: [
      {
        eventId: 1,
        eventName: "HYROX London",
        city: "London",
        country: "UK",
        divisions: ["doubles_male"],
        recordsAvailable: 120,
        recordsFound: 80,
        recordsSaved: 20,
      },
    ],
  });
  pool.state.jobEvents.push({ id: "event-1", job_id: "job-1", status: "pending" });

  const list = await request(app, "/api/admin/hyrox-results/jobs");
  assert.equal(list.response.status, 200);
  assert.equal(list.body.ok, true);
  assert.equal(list.body.jobs.length, 1);
  assert.equal(list.body.jobs[0].totalRecordsAvailable, 120);
  assert.equal(list.body.jobs[0].locationSummary[0].eventName, "HYROX London");
  assert.equal(list.body.jobs[0].locationSummary[0].recordsAvailable, 120);

  const detail = await request(app, "/api/admin/hyrox-results/jobs/job-1");
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.events.length, 1);

  const missing = await request(app, "/api/admin/hyrox-results/jobs/missing");
  assert.equal(missing.response.status, 404);
});

test("GET /admin/hyrox-results/benchmark-readiness returns ok and source", async () => {
  const previousSource = process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
  delete process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
  try {
    const { app } = buildApp();
    const result = await request(app, "/api/admin/hyrox-results/benchmark-readiness");

    assert.equal(result.response.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.source, "legacy");
    assert.deepEqual(result.body.divisions, []);
  } finally {
    if (previousSource === undefined) delete process.env.HYROX_DOUBLES_BENCHMARK_SOURCE;
    else process.env.HYROX_DOUBLES_BENCHMARK_SOURCE = previousSource;
  }
});

test("pause, resume and cancel job lifecycle routes", async () => {
  const { app, pool } = buildApp();
  pool.state.jobs.push({ id: "job-1", status: "running" });

  const paused = await request(app, "/api/admin/hyrox-results/jobs/job-1/pause", { method: "PATCH" });
  assert.equal(paused.response.status, 200);
  assert.equal(paused.body.status, "paused");

  const pauseAgain = await request(app, "/api/admin/hyrox-results/jobs/job-1/pause", { method: "PATCH" });
  assert.equal(pauseAgain.response.status, 400);

  const resumed = await request(app, "/api/admin/hyrox-results/jobs/job-1/resume", { method: "PATCH" });
  assert.equal(resumed.response.status, 200);
  assert.equal(resumed.body.status, "queued");

  const cancelled = await request(app, "/api/admin/hyrox-results/jobs/job-1/cancel", { method: "PATCH" });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.body.status, "cancelled");
});

test("stats and events endpoints return expected shapes", async () => {
  const { app, pool } = buildApp();
	pool.state.events.push({
	  id: 1,
	  event_name: "HYROX London",
	  has_results: true,
	  results_page_key: "HYROX London",
	  doubles_record_count: 125,
	  doubles_already_scraped: true,
	  doubles_record_counts_by_category: { doubles_male: 50, doubles_female: 75 },
	});

  const stats = await request(app, "/api/admin/hyrox-results/stats");
  assert.equal(stats.response.status, 200);
  assert.equal(stats.body.ok, true);
  assert.equal(stats.body.totalRecords, 0);

  const events = await request(app, "/api/admin/hyrox-results/events");
	assert.equal(events.response.status, 200);
	assert.equal(events.body.events.length, 1);
	assert.equal(events.body.events[0].eventName, "HYROX London");
	assert.deepEqual(events.body.events[0].doublesRecordCountsByCategory, { doubles_male: 50, doubles_female: 75 });
});

test("POST /admin/hyrox-results/events/:id/availability counts live records without scraping", async () => {
  const availabilityCounterCalls = [];
  const availabilityCounter = async (...args) => {
    availabilityCounterCalls.push(args);
    return {
      totalRecordsAvailable: 123,
      checkedAt: "2026-07-02T12:00:00.000Z",
      divisions: [
        { divisionCategory: "doubles_male", recordsAvailable: 50, pages: 1, status: "available" },
        { divisionCategory: "doubles_female", recordsAvailable: 73, pages: 2, status: "available" },
      ],
    };
  };
  const { app, pool } = buildApp(buildPool(), { availabilityCounter });
  pool.state.events.push({
    id: 7,
    season: 9,
    event_name: "HYROX Manchester",
    results_page_key: "HYROX Manchester",
  });

  const result = await request(app, "/api/admin/hyrox-results/events/7/availability", {
    method: "POST",
    body: JSON.stringify({ selectedDivisions: ["doubles_male", "doubles_female"] }),
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.availability.totalRecordsAvailable, 123);
  assert.deepEqual(availabilityCounterCalls[0].slice(0, 3), ["HYROX Manchester", 9, ["doubles_male", "doubles_female"]]);
});
