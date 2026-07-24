import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import test from "node:test";
import { pool } from "../../src/db.js";
import { requireInternalToken } from "../../src/middleware/auth.js";
import { createAdminHyroxTestHarnessRouter } from "../../src/routes/adminHyroxTestHarness.js";

const nativeInternalToken = process.env.INTERNAL_API_TOKEN;
const nativeRetentionDays = process.env.HYROX_EMAIL_AUDIT_RETENTION_DAYS;

function app(db = pool) {
  const instance = express();
  instance.use(express.json());
  instance.use("/api/admin", requireInternalToken, createAdminHyroxTestHarnessRouter(db));
  return instance;
}

async function request(instance, path, options = {}) {
  const server = instance.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const headers = { ...(options.headers ?? {}) };
    if (options.token !== false) headers["x-internal-token"] = options.token ?? "email-audit-token";
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      ...options,
      headers,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    return { response, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

let dbReadyCache = null;

async function dbReady(t) {
  if (dbReadyCache?.ready) return true;
  if (dbReadyCache?.reason) {
    t.skip(dbReadyCache.reason);
    return false;
  }
  if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
    dbReadyCache = { ready: false, reason: "Postgres credentials are not configured for HYROX email audit tests." };
    t.skip(dbReadyCache.reason);
    return false;
  }
  try {
    await pool.query("SELECT 1");
    const tables = await pool.query(`
      SELECT to_regclass('public.hyrox_submissions') AS submissions,
             to_regclass('public.hyrox_analyses') AS analyses
    `);
    const row = tables.rows[0] ?? {};
    if (!row.submissions || !row.analyses) {
      dbReadyCache = { ready: false, reason: "HYROX V100-V101 migrations are not applied in this database." };
      t.skip(dbReadyCache.reason);
      return false;
    }
    dbReadyCache = { ready: true };
    return true;
  } catch (err) {
    dbReadyCache = { ready: false, reason: `Postgres unavailable for HYROX email audit test: ${err?.code || err?.message}` };
    t.skip(dbReadyCache.reason);
    return false;
  }
}

async function withTransaction(t, fn) {
  if (!await dbReady(t)) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await fn(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function seedSubmission(db, overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.query(
    `INSERT INTO hyrox_submissions (
      id, email, display_name, sex, division, finish_time_seconds, source, splits_json, roxzone_mode
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
    [
      id,
      overrides.email ?? `${id}@example.com`,
      overrides.displayName ?? "Audit Athlete",
      overrides.sex ?? "male",
      overrides.division ?? "open",
      overrides.finishTimeSeconds ?? 4800,
      overrides.source ?? "test",
      JSON.stringify(overrides.splits ?? []),
      overrides.roxzoneMode ?? "none",
    ],
  );
  return id;
}

async function seedAnalysis(db, submissionId, overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  await db.query(
    `INSERT INTO hyrox_analyses (
      id, submission_id, created_at, analysis_version, analysis_scope, analysis_json,
      benchmark_group_key, confidence, selected_insights_json, report_json, carousel_a_json, carousel_b_json
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb)`,
    [
      id,
      submissionId,
      overrides.createdAt ?? new Date(),
      overrides.analysisVersion ?? "test",
      overrides.analysisScope ?? "full",
      JSON.stringify(overrides.analysisJson ?? { analysisVersion: "test", marker: id }),
      overrides.benchmarkGroupKey ?? null,
      overrides.confidence ?? "high",
      JSON.stringify(overrides.selectedInsights ?? [{ id: "insight" }]),
      overrides.reportJson === undefined ? JSON.stringify({ emailHtml: "<html><body>Audit Email</body></html>" }) : JSON.stringify(overrides.reportJson),
      JSON.stringify(overrides.carouselA ?? { slides: ["a"] }),
      JSON.stringify(overrides.carouselB ?? { slides: ["b"] }),
    ],
  );
  return id;
}

test.beforeEach(() => {
  process.env.INTERNAL_API_TOKEN = "email-audit-token";
});

test.afterEach(() => {
  if (nativeInternalToken === undefined) {
    delete process.env.INTERNAL_API_TOKEN;
  } else {
    process.env.INTERNAL_API_TOKEN = nativeInternalToken;
  }
  if (nativeRetentionDays === undefined) {
    delete process.env.HYROX_EMAIL_AUDIT_RETENTION_DAYS;
  } else {
    process.env.HYROX_EMAIL_AUDIT_RETENTION_DAYS = nativeRetentionDays;
  }
});

test.after(async () => {
  await pool.end();
});

test("GET stored HYROX email returns exact persisted HTML", async (t) => {
  await withTransaction(t, async (client) => {
    const submissionId = await seedSubmission(client);
    const html = "<!doctype html><html><body><h1>Exact sent email</h1></body></html>";
    await seedAnalysis(client, submissionId, { reportJson: { emailHtml: html } });

    const { response, body } = await request(app(client), `/api/admin/hyrox/test-harness/submission/${submissionId}/email`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(body, html);
  });
});

test("GET stored HYROX email returns downloadable attachment when requested", async (t) => {
  await withTransaction(t, async (client) => {
    const submissionId = await seedSubmission(client);
    const html = "<html><body>Download me</body></html>";
    await seedAnalysis(client, submissionId, { reportJson: { emailHtml: html } });

    const { response, body } = await request(app(client), `/api/admin/hyrox/test-harness/submission/${submissionId}/email/download`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-disposition"), `attachment; filename="hyrox-email-${submissionId}.html"`);
    assert.equal(body, html);
  });
});

test("GET stored HYROX email returns 404 when no analysis exists", async (t) => {
  await withTransaction(t, async (client) => {
    const submissionId = await seedSubmission(client);

    const { response, body } = await request(app(client), `/api/admin/hyrox/test-harness/submission/${submissionId}/email`);

    assert.equal(response.status, 404);
    assert.equal(body.error, "not_found");
  });
});

test("GET stored HYROX email returns 404 when report_json is null", async (t) => {
  await withTransaction(t, async (client) => {
    const submissionId = await seedSubmission(client);
    await seedAnalysis(client, submissionId, { reportJson: null });

    const { response, body } = await request(app(client), `/api/admin/hyrox/test-harness/submission/${submissionId}/email`);

    assert.equal(response.status, 404);
    assert.equal(body.error, "not_found");
  });
});

test("stored HYROX email route requires internal token", async () => {
  const db = { async query() { throw new Error("auth should run before DB access"); } };
  const submissionId = crypto.randomUUID();

  const missing = await request(app(db), `/api/admin/hyrox/test-harness/submission/${submissionId}/email`, { token: false });
  const wrong = await request(app(db), `/api/admin/hyrox/test-harness/submission/${submissionId}/email`, { token: "wrong-token" });

  assert.equal(missing.response.status, 401);
  assert.equal(wrong.response.status, 401);
});

test("GET stored HYROX email returns most recent analysis for a submission", async (t) => {
  await withTransaction(t, async (client) => {
    const submissionId = await seedSubmission(client);
    await seedAnalysis(client, submissionId, {
      createdAt: "2026-07-20T10:00:00.000Z",
      reportJson: { emailHtml: "<html><body>Old email</body></html>" },
    });
    await seedAnalysis(client, submissionId, {
      createdAt: "2026-07-21T10:00:00.000Z",
      reportJson: { emailHtml: "<html><body>New email</body></html>" },
    });

    const { response, body } = await request(app(client), `/api/admin/hyrox/test-harness/submission/${submissionId}/email`);

    assert.equal(response.status, 200);
    assert.equal(body, "<html><body>New email</body></html>");
  });
});

test("email audit purge without retention configured returns 400 and leaves rows unchanged", async (t) => {
  await withTransaction(t, async (client) => {
    delete process.env.HYROX_EMAIL_AUDIT_RETENTION_DAYS;
    const submissionId = await seedSubmission(client);
    await seedAnalysis(client, submissionId, {
      createdAt: "2026-07-20T10:00:00.000Z",
      reportJson: { emailHtml: "<html><body>Keep</body></html>" },
    });

    const { response, body } = await request(app(client), "/api/admin/hyrox/test-harness/email-audit/purge", { method: "POST" });
    const rows = await client.query("SELECT report_json FROM hyrox_analyses WHERE submission_id = $1", [submissionId]);

    assert.equal(response.status, 400);
    assert.equal(body.error, "retention_not_configured");
    assert.equal(rows.rows[0].report_json.emailHtml, "<html><body>Keep</body></html>");
  });
});

test("email audit purge clears only old report_json and preserves other analysis columns", async (t) => {
  await withTransaction(t, async (client) => {
    process.env.HYROX_EMAIL_AUDIT_RETENTION_DAYS = "1";
    const oldSubmissionId = await seedSubmission(client);
    const newSubmissionId = await seedSubmission(client);
    const oldAnalysisId = await seedAnalysis(client, oldSubmissionId, {
      createdAt: "2000-01-01T10:00:00.000Z",
      analysisJson: { marker: "old-analysis" },
      selectedInsights: [{ key: "old-insight" }],
      reportJson: { emailHtml: "<html><body>Old</body></html>" },
      carouselA: { old: "a" },
      carouselB: { old: "b" },
    });
    const newAnalysisId = await seedAnalysis(client, newSubmissionId, {
      createdAt: new Date(),
      analysisJson: { marker: "new-analysis" },
      selectedInsights: [{ key: "new-insight" }],
      reportJson: { emailHtml: "<html><body>New</body></html>" },
      carouselA: { new: "a" },
      carouselB: { new: "b" },
    });

    const { response, body } = await request(app(client), "/api/admin/hyrox/test-harness/email-audit/purge", { method: "POST" });
    const rows = await client.query(
      `SELECT id, analysis_json, selected_insights_json, report_json, carousel_a_json, carousel_b_json
       FROM hyrox_analyses
       WHERE id = ANY($1::uuid[])
       ORDER BY id`,
      [[oldAnalysisId, newAnalysisId]],
    );
    const oldRow = rows.rows.find((row) => row.id === oldAnalysisId);
    const newRow = rows.rows.find((row) => row.id === newAnalysisId);

    assert.equal(response.status, 200);
    // The purge is a deliberate table-wide sweep (see spec), not scoped to this test's rows,
    // so a shared dev DB with other old analyses can legitimately clear more than just these two.
    assert.ok(body.clearedCount >= 1);
    assert.equal(oldRow.report_json, null);
    assert.deepEqual(oldRow.analysis_json, { marker: "old-analysis" });
    assert.deepEqual(oldRow.selected_insights_json, [{ key: "old-insight" }]);
    assert.deepEqual(oldRow.carousel_a_json, { old: "a" });
    assert.deepEqual(oldRow.carousel_b_json, { old: "b" });
    assert.equal(newRow.report_json.emailHtml, "<html><body>New</body></html>");
    assert.deepEqual(newRow.analysis_json, { marker: "new-analysis" });
    assert.deepEqual(newRow.selected_insights_json, [{ key: "new-insight" }]);
    assert.deepEqual(newRow.carousel_a_json, { new: "a" });
    assert.deepEqual(newRow.carousel_b_json, { new: "b" });
  });
});
