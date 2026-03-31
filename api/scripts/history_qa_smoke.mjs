#!/usr/bin/env node
/**
 * History QA Smoke Harness
 *
 * Validates all history API endpoints against a running server.
 * Exits 0 on all-pass, 1 on any FAIL, 2 on missing required env vars.
 *
 * Basic usage:
 *   BASE_URL=http://localhost:3000 \
 *   INTERNAL_TOKEN=secret \
 *   USER_A=user-uuid \
 *   node scripts/history_qa_smoke.mjs
 *
 *   # or via npm:
 *   npm run qa:history
 *
 * Full usage (all options):
 *   BASE_URL=http://localhost:3000 \
 *   INTERNAL_TOKEN=secret \
 *   USER_A=user-uuid \
 *   USER_B=other-uuid \
 *   EXERCISE_ID=bb_back_squat \
 *   DATABASE_URL=postgres://... \
 *   INTERNAL_TOKEN_HEADER=authorization \
 *   USER_ID_HEADER=x-user-id \
 *   node scripts/history_qa_smoke.mjs
 *
 * Required env:
 *   BASE_URL              e.g. http://localhost:3000
 *   INTERNAL_TOKEN        value of INTERNAL_API_TOKEN on the server
 *   USER_A                a valid user_id with some history data
 *
 * Optional env:
 *   USER_B                second user_id for multi-tenant isolation check
 *   EXERCISE_ID           a valid exercise_id for the /exercise/:id endpoint
 *   DATABASE_URL          postgres connection string for SQL invariant checks
 *
 * Header configuration (optional):
 *   INTERNAL_TOKEN_HEADER header name for the internal token (default: x-internal-token)
 *                         If set to "authorization", the token is sent as "Bearer <token>".
 *   USER_ID_HEADER        header name for the user id  (default: x-user-id)
 *
 * Env file (optional):
 *   Variables are loaded automatically from .env.qa in the current working directory.
 *   Override the file path with:
 *     QA_ENV_FILE=.env.staging npm run qa:history
 *   Shell variables always take precedence over the file (dotenv does not overwrite).
 *   If the file does not exist the harness silently continues.
 */

import dotenv from "dotenv";
import { createRequire } from "node:module";

// Load env file before any process.env reads.
// Shell variables already set take precedence (dotenv never overwrites).
const _envFile = process.env.QA_ENV_FILE ?? ".env.qa";
dotenv.config({ path: _envFile }); // silently no-ops when file is absent

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? "";
const USER_A = process.env.USER_A ?? "";
const USER_B = process.env.USER_B ?? "";
const EXERCISE_ID = process.env.EXERCISE_ID ?? "";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

// Header names are lower-cased to match fetch()'s behaviour.
const INTERNAL_TOKEN_HEADER = (process.env.INTERNAL_TOKEN_HEADER ?? "x-internal-token").toLowerCase();
const USER_ID_HEADER = (process.env.USER_ID_HEADER ?? "x-user-id").toLowerCase();

const PERF_RUNS = 5;
const PERF_WARN_MS = 300;

// Validate required env vars — exit 2 (distinct from FAIL = 1).
const missingRequired = [];
if (!INTERNAL_TOKEN) missingRequired.push("INTERNAL_TOKEN");
if (!USER_A) missingRequired.push("USER_A");
if (missingRequired.length > 0) {
  console.error(`ERROR: missing required environment variable(s): ${missingRequired.join(", ")}`);
  console.error("");
  console.error("  Required: BASE_URL, INTERNAL_TOKEN, USER_A");
  console.error("  Optional: USER_B, EXERCISE_ID, DATABASE_URL");
  console.error("            INTERNAL_TOKEN_HEADER (default: x-internal-token)");
  console.error("            USER_ID_HEADER         (default: x-user-id)");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Auth header builders
// ---------------------------------------------------------------------------

/**
 * Returns the value to send for the internal-token header.
 * When INTERNAL_TOKEN_HEADER is "authorization", wraps with "Bearer ".
 */
function tokenHeaderValue() {
  return INTERNAL_TOKEN_HEADER === "authorization"
    ? `Bearer ${INTERNAL_TOKEN}`
    : INTERNAL_TOKEN;
}

/** Full auth headers — token + user id. */
function buildAuthHeaders(userId) {
  return {
    [INTERNAL_TOKEN_HEADER]: tokenHeaderValue(),
    [USER_ID_HEADER]: userId,
  };
}

/** Token-only headers (no user id) — used by the auth-guard "no user" test. */
function buildTokenOnlyHeaders() {
  return { [INTERNAL_TOKEN_HEADER]: tokenHeaderValue() };
}

/** User-only headers (no token) — used by the auth-guard "no token" test. */
function buildUserOnlyHeaders(userId) {
  return { [USER_ID_HEADER]: userId };
}

// ---------------------------------------------------------------------------
// Result tracking
// ---------------------------------------------------------------------------

/** @type {Array<{name: string, status: 'PASS'|'WARN'|'FAIL', detail: string}>} */
const results = [];

function pass(name, detail = "") {
  results.push({ name, status: "PASS", detail });
  console.log(`  \u2713 PASS  ${name}${detail ? " — " + detail : ""}`);
}

function warn(name, detail = "") {
  results.push({ name, status: "WARN", detail });
  console.warn(`  ! WARN  ${name}${detail ? " — " + detail : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, status: "FAIL", detail });
  console.error(`  \u2717 FAIL  ${name}${detail ? " — " + detail : ""}`);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * GET a history endpoint as USER_A (or a given userId).
 * Returns { status, body, ms }.
 */
async function get(path, userId = USER_A) {
  const url = `${BASE_URL}${path}`;
  const start = Date.now();
  const res = await fetch(url, {
    headers: buildAuthHeaders(userId),
  });
  const ms = Date.now() - start;
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, ms };
}

/**
 * Run `get` N times and return timing stats.
 */
async function timeEndpoint(path, userId = USER_A, runs = PERF_RUNS) {
  const times = [];
  for (let i = 0; i < runs; i++) {
    const { ms, status } = await get(path, userId);
    if (status === 200) times.push(ms);
  }
  if (times.length === 0) return { avg: NaN, p95: NaN, runs: 0 };
  times.sort((a, b) => a - b);
  const avg = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
  const p95 = times[Math.ceil(times.length * 0.95) - 1] ?? times[times.length - 1];
  return { avg, p95, runs: times.length };
}

// ---------------------------------------------------------------------------
// Type guards / shape validators
// ---------------------------------------------------------------------------

function isString(v) {
  return typeof v === "string";
}

function isFiniteNum(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function isNullOrString(v) {
  return v === null || typeof v === "string";
}

function isNullOrFinite(v) {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}

function isArray(v) {
  return Array.isArray(v);
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isIsoDate(v) {
  return isString(v) && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// ---------------------------------------------------------------------------
// Section: Overview
// ---------------------------------------------------------------------------

async function checkOverview() {
  console.log("\n[overview]");
  const { status, body } = await get("/v1/history/overview");

  if (status !== 200) {
    fail("overview/status-200", `got ${status}`);
    return;
  }
  pass("overview/status-200");

  const required = [
    ["sessionsCompleted", isFiniteNum],
    ["trainingHoursCompleted", isFiniteNum],
    ["currentStreakDays", isFiniteNum],
    ["programsCompleted", isFiniteNum],
    ["consistency30d", isObject],
    ["strengthTrend28d", isObject],
    ["volumeTrend28d", isObject],
  ];
  let shapeOk = true;
  for (const [key, check] of required) {
    if (!Object.prototype.hasOwnProperty.call(body, key) || !check(body[key])) {
      fail(`overview/shape.${key}`, `got ${JSON.stringify(body?.[key])}`);
      shapeOk = false;
    }
  }
  if (shapeOk) pass("overview/shape");

  if (isObject(body?.consistency30d)) {
    const c = body.consistency30d;
    if (!isFiniteNum(c.value)) fail("overview/consistency30d.value", String(c.value));
    else pass("overview/consistency30d.value");
  }

  if (!isNullOrString(body?.lastCompletedDate)) {
    fail("overview/lastCompletedDate-type");
  } else if (body?.lastCompletedDate !== null && !isIsoDate(body.lastCompletedDate)) {
    fail("overview/lastCompletedDate-format", body.lastCompletedDate);
  } else {
    pass("overview/lastCompletedDate");
  }

  if (body?.sessionsCompleted >= 0) pass("overview/sessionsCompleted-non-negative");
  else fail("overview/sessionsCompleted-non-negative", String(body?.sessionsCompleted));

  if (body?.currentStreakDays >= 0) pass("overview/currentStreakDays-non-negative");
  else fail("overview/currentStreakDays-non-negative", String(body?.currentStreakDays));
}

// ---------------------------------------------------------------------------
// Section: Programs
// ---------------------------------------------------------------------------

async function checkPrograms() {
  console.log("\n[programs]");
  const { status, body } = await get("/v1/history/programs?limit=10");

  if (status !== 200) {
    fail("programs/status-200", `got ${status}`);
    return;
  }
  pass("programs/status-200");

  if (!isArray(body)) {
    fail("programs/response-is-array");
    return;
  }
  pass("programs/response-is-array");

  if (body.length > 10) {
    fail("programs/limit-respected", `got ${body.length} items, expected ≤ 10`);
  } else {
    pass("programs/limit-respected", `${body.length} item(s)`);
  }

  if (body.length > 0) {
    const row = body[0];
    const ok =
      isString(row.programId) &&
      isString(row.programTitle) &&
      isFiniteNum(row.totalSessions) &&
      isFiniteNum(row.completedSessions) &&
      isFiniteNum(row.completionRatio);
    if (!ok) fail("programs/row-shape", JSON.stringify(row).slice(0, 120));
    else pass("programs/row-shape");

    if (row.completionRatio < 0 || row.completionRatio > 1) {
      fail("programs/completionRatio-range", String(row.completionRatio));
    } else {
      pass("programs/completionRatio-range");
    }
  } else {
    warn("programs/row-shape", "no programs returned — shape check skipped");
  }
}

// ---------------------------------------------------------------------------
// Section: Timeline
// ---------------------------------------------------------------------------

async function checkTimeline() {
  console.log("\n[timeline]");

  // Page 1
  const { status: s1, body: b1 } = await get("/v1/history/timeline?limit=20");
  if (s1 !== 200) {
    fail("timeline/page1-status-200", `got ${s1}`);
    return;
  }
  pass("timeline/page1-status-200");

  if (!isObject(b1) || !isArray(b1.items)) {
    fail("timeline/page1-shape");
    return;
  }
  pass("timeline/page1-shape");

  if (b1.items.length > 20) {
    fail("timeline/page1-limit", `got ${b1.items.length}`);
  } else {
    pass("timeline/page1-limit", `${b1.items.length} item(s)`);
  }

  // Validate items are DESC by scheduledDate
  let prevDate = "";
  let descOk = true;
  for (const item of b1.items) {
    if (prevDate && item.scheduledDate > prevDate) {
      descOk = false;
      fail("timeline/page1-desc-order", `${item.scheduledDate} > ${prevDate}`);
      break;
    }
    prevDate = item.scheduledDate;
  }
  if (descOk) pass("timeline/page1-desc-order");

  // Row shape
  if (b1.items.length > 0) {
    const row = b1.items[0];
    const ok =
      isString(row.programDayId) &&
      isString(row.programId) &&
      isString(row.scheduledDate) &&
      isFiniteNum(row.durationMins);
    if (!ok) fail("timeline/row-shape", JSON.stringify(row).slice(0, 120));
    else pass("timeline/row-shape");

    if (!isIsoDate(row.scheduledDate)) {
      fail("timeline/scheduledDate-format", row.scheduledDate);
    } else {
      pass("timeline/scheduledDate-format");
    }
  } else {
    warn("timeline/row-shape", "no items — shape check skipped");
  }

  // Page 2 (cursor pagination)
  const cursor = b1.nextCursor;
  if (cursor && isString(cursor.cursorDate) && isString(cursor.cursorId)) {
    pass("timeline/nextCursor-shape");
    const qs = `?limit=20&cursorDate=${cursor.cursorDate}&cursorId=${cursor.cursorId}`;
    const { status: s2, body: b2 } = await get(`/v1/history/timeline${qs}`);
    if (s2 !== 200) {
      fail("timeline/page2-status-200", `got ${s2}`);
    } else {
      pass("timeline/page2-status-200");

      if (isArray(b2?.items)) {
        // Verify page 2 items are all older than the last item of page 1
        const lastPage1Date = b1.items[b1.items.length - 1]?.scheduledDate;
        let isolationOk = true;
        for (const item of b2.items) {
          if (lastPage1Date && item.scheduledDate > lastPage1Date) {
            isolationOk = false;
            fail("timeline/page2-cursor-isolation", `${item.scheduledDate} > cursor ${lastPage1Date}`);
            break;
          }
        }
        if (isolationOk) pass("timeline/page2-cursor-isolation");
      }
    }
  } else if (b1.nextCursor === null) {
    warn("timeline/page2", "nextCursor is null — not enough data for 2-page test");
  } else {
    fail("timeline/nextCursor-shape", JSON.stringify(cursor));
  }

  // Invalid cursor → expect 400
  const { status: sBad } = await get(
    "/v1/history/timeline?limit=20&cursorDate=not-a-date&cursorId=not-a-uuid",
  );
  if (sBad === 400) pass("timeline/invalid-cursor-400");
  else fail("timeline/invalid-cursor-400", `got ${sBad}`);
}

// ---------------------------------------------------------------------------
// Section: Personal Records
// ---------------------------------------------------------------------------

async function checkPersonalRecords() {
  console.log("\n[personal-records]");
  const { status, body } = await get("/v1/history/personal-records?limit=20");

  if (status !== 200) {
    fail("pr/status-200", `got ${status}`);
    return;
  }
  pass("pr/status-200");

  if (!isArray(body)) {
    fail("pr/response-is-array");
    return;
  }
  pass("pr/response-is-array");

  if (body.length > 20) {
    fail("pr/limit-respected", `got ${body.length}`);
  } else {
    pass("pr/limit-respected", `${body.length} item(s)`);
  }

  // Uniqueness: one row per exerciseId (DISTINCT ON guarantee)
  const exerciseIds = body.map((r) => r.exerciseId);
  const unique = new Set(exerciseIds);
  if (unique.size !== exerciseIds.length) {
    fail("pr/distinct-exercise-ids", `duplicates found: ${exerciseIds.join(", ")}`);
  } else {
    pass("pr/distinct-exercise-ids");
  }

  if (body.length > 0) {
    const row = body[0];
    const ok =
      isString(row.exerciseId) &&
      isString(row.exerciseName) &&
      row.metric === "weight_kg" &&
      isFiniteNum(row.value) &&
      isIsoDate(row.date);
    if (!ok) fail("pr/row-shape", JSON.stringify(row).slice(0, 120));
    else pass("pr/row-shape");

    if (row.value <= 0) warn("pr/value-positive", `value=${row.value}`);
    else pass("pr/value-positive");
  } else {
    warn("pr/row-shape", "no PRs returned — shape check skipped");
  }
}

// ---------------------------------------------------------------------------
// Section: Exercise detail
// ---------------------------------------------------------------------------

async function checkExercise() {
  if (!EXERCISE_ID) {
    warn("exercise/skipped", "set EXERCISE_ID env to enable this check");
    return;
  }
  console.log(`\n[exercise: ${EXERCISE_ID}]`);

  const { status, body } = await get(`/v1/history/exercise/${EXERCISE_ID}`);

  if (status !== 200) {
    fail("exercise/status-200", `got ${status}`);
    return;
  }
  pass("exercise/status-200");

  const ok =
    isObject(body) &&
    body.exerciseId === EXERCISE_ID &&
    isString(body.exerciseName) &&
    isArray(body.series) &&
    isObject(body.summary);
  if (!ok) {
    fail("exercise/shape", JSON.stringify(body).slice(0, 200));
    return;
  }
  pass("exercise/shape");

  // Series must be ASC by date
  let ascOk = true;
  for (let i = 1; i < body.series.length; i++) {
    if (body.series[i].date < body.series[i - 1].date) {
      ascOk = false;
      fail("exercise/series-asc-order", `${body.series[i].date} < ${body.series[i - 1].date}`);
      break;
    }
  }
  if (ascOk) pass("exercise/series-asc-order");

  // Series capped at 180
  if (body.series.length > 180) {
    fail("exercise/series-cap-180", `got ${body.series.length}`);
  } else {
    pass("exercise/series-cap-180", `${body.series.length} point(s)`);
  }

  // Summary shape — lastPerformed must be null or strict YYYY-MM-DD (no timestamps).
  const s = body.summary;
  const sOk =
    (s.lastPerformed === null || isIsoDate(s.lastPerformed)) &&
    isNullOrFinite(s.bestWeightKg) &&
    isFiniteNum(s.sessionsCount);
  if (!sOk) fail("exercise/summary-shape", JSON.stringify(s));
  else pass("exercise/summary-shape");

  // Series row shape
  if (body.series.length > 0) {
    const pt = body.series[0];
    const ptOk =
      isIsoDate(pt.date) &&
      isNullOrFinite(pt.topWeightKg) &&
      isNullOrFinite(pt.tonnage) &&
      isNullOrFinite(pt.topReps);
    if (!ptOk) fail("exercise/series-point-shape", JSON.stringify(pt));
    else pass("exercise/series-point-shape");
  }
}

// ---------------------------------------------------------------------------
// Section: Multi-tenant isolation
// ---------------------------------------------------------------------------

async function checkMultiTenant() {
  if (!USER_B) {
    warn("isolation/skipped", "set USER_B env to enable multi-tenant checks");
    return;
  }
  console.log("\n[multi-tenant isolation]");

  // Overview — responses should differ for different users (data isolation)
  const { status: sA, body: bA } = await get("/v1/history/overview", USER_A);
  const { status: sB, body: bB } = await get("/v1/history/overview", USER_B);

  if (sA !== 200 || sB !== 200) {
    fail("isolation/overview-both-200", `A=${sA} B=${sB}`);
    return;
  }
  pass("isolation/overview-both-200");

  // Timeline: items returned for A must not appear in B's timeline
  const { body: tA } = await get("/v1/history/timeline?limit=50", USER_A);
  const { body: tB } = await get("/v1/history/timeline?limit=50", USER_B);

  const idsA = new Set((tA?.items ?? []).map((i) => i.programDayId));
  const idsB = new Set((tB?.items ?? []).map((i) => i.programDayId));
  const overlap = [...idsA].filter((id) => idsB.has(id));

  if (overlap.length > 0) {
    fail("isolation/timeline-no-overlap", `shared programDayIds: ${overlap.join(", ")}`);
  } else {
    pass("isolation/timeline-no-overlap");
  }

  // PRs: exercise_id + value combos should not cross user boundary
  const { body: prA } = await get("/v1/history/personal-records?limit=50", USER_A);
  const { body: prB } = await get("/v1/history/personal-records?limit=50", USER_B);

  const prKeyA = new Set((isArray(prA) ? prA : []).map((r) => `${r.exerciseId}:${r.programDayId}`));
  const prOverlap = (isArray(prB) ? prB : []).filter((r) =>
    prKeyA.has(`${r.exerciseId}:${r.programDayId}`),
  );
  if (prOverlap.length > 0) {
    fail("isolation/pr-no-overlap", `shared records: ${JSON.stringify(prOverlap[0])}`);
  } else {
    pass("isolation/pr-no-overlap");
  }
}

// ---------------------------------------------------------------------------
// Section: Auth guard
// ---------------------------------------------------------------------------

async function checkAuthGuard() {
  console.log("\n[auth guard]");
  const endpoints = [
    "/v1/history/overview",
    "/v1/history/programs?limit=10",
    "/v1/history/timeline?limit=20",
    "/v1/history/personal-records?limit=20",
  ];

  for (const path of endpoints) {
    const label = path.split("?")[0];

    // No token — only send user-id header
    const noToken = await fetch(`${BASE_URL}${path}`, {
      headers: buildUserOnlyHeaders(USER_A),
    });
    if (noToken.status === 401) pass(`auth/${label}-no-token-401`);
    else fail(`auth/${label}-no-token-401`, `got ${noToken.status}`);

    // No user id — only send token header
    const noUser = await fetch(`${BASE_URL}${path}`, {
      headers: buildTokenOnlyHeaders(),
    });
    if (noUser.status === 401) pass(`auth/${label}-no-user-401`);
    else fail(`auth/${label}-no-user-401`, `got ${noUser.status}`);
  }
}

// ---------------------------------------------------------------------------
// Section: Performance
// ---------------------------------------------------------------------------

async function checkPerformance() {
  console.log("\n[performance]");
  const endpoints = [
    { label: "overview", path: "/v1/history/overview" },
    { label: "programs", path: "/v1/history/programs?limit=10" },
    { label: "timeline", path: "/v1/history/timeline?limit=20" },
    { label: "personal-records", path: "/v1/history/personal-records?limit=20" },
  ];
  if (EXERCISE_ID) {
    endpoints.push({ label: "exercise", path: `/v1/history/exercise/${EXERCISE_ID}` });
  }

  for (const { label, path } of endpoints) {
    const runs = label === "overview" ? PERF_RUNS : 3;
    const { avg, p95, runs: completed } = await timeEndpoint(path, USER_A, runs);
    if (completed === 0) {
      fail(`perf/${label}`, "all requests failed");
      continue;
    }
    const detail = `avg=${avg}ms p95=${p95}ms (n=${completed})`;
    if (avg <= PERF_WARN_MS) pass(`perf/${label}`, detail);
    else warn(`perf/${label}`, `${detail} — avg > ${PERF_WARN_MS}ms threshold`);
  }
}

// ---------------------------------------------------------------------------
// Section: Optional SQL invariants
// ---------------------------------------------------------------------------

async function checkSqlInvariants() {
  if (!DATABASE_URL) {
    warn("sql/skipped", "set DATABASE_URL env to enable SQL invariant checks");
    return;
  }
  console.log("\n[sql invariants]");

  let pg;
  try {
    pg = require("pg");
  } catch {
    warn("sql/pg-import", "pg module not available");
    return;
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();

    // 1. No completed days without a non-draft log row (expect 0 orphans)
    const orphanRes = await client.query(`
      SELECT COUNT(*) AS cnt
      FROM program_day pd
      WHERE pd.is_completed = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM segment_exercise_log l
          WHERE l.program_day_id = pd.id AND l.is_draft = FALSE
        )
    `);
    const orphans = Number(orphanRes.rows[0]?.cnt ?? 0);
    if (orphans > 0) {
      warn("sql/completed-days-have-logs", `${orphans} completed day(s) with no non-draft log`);
    } else {
      pass("sql/completed-days-have-logs");
    }

    // 2. No segment_exercise_log row referencing a non-existent program_day
    const dangling = await client.query(`
      SELECT COUNT(*) AS cnt
      FROM segment_exercise_log l
      WHERE NOT EXISTS (
        SELECT 1 FROM program_day pd WHERE pd.id = l.program_day_id
      )
    `);
    const danglingCnt = Number(dangling.rows[0]?.cnt ?? 0);
    if (danglingCnt > 0) {
      fail("sql/no-dangling-log-rows", `${danglingCnt} log row(s) with missing program_day`);
    } else {
      pass("sql/no-dangling-log-rows");
    }

    // 3. PR query returns at most one row per exercise_id for each user
    const dupPr = await client.query(`
      WITH ranked AS (
        SELECT
          pe.exercise_id,
          p.user_id,
          ROW_NUMBER() OVER (PARTITION BY p.user_id, pe.exercise_id ORDER BY l.weight_kg DESC) AS rn
        FROM segment_exercise_log l
        JOIN program p ON p.id = l.program_id
        JOIN program_day pd ON pd.id = l.program_day_id
        JOIN program_exercise pe ON pe.id = l.program_exercise_id
        WHERE pd.is_completed = TRUE AND l.is_draft = FALSE AND l.weight_kg IS NOT NULL
      )
      SELECT COUNT(*) AS cnt FROM ranked WHERE rn > 1
    `);
    const dupCnt = Number(dupPr.rows[0]?.cnt ?? 0);
    if (dupCnt > 0) {
      warn("sql/pr-distinct-check", `${dupCnt} non-top-weight rows exist (expected, confirms DISTINCT ON needed)`);
    } else {
      pass("sql/pr-distinct-check", "no duplicate exercise_id rows at all");
    }

    // 4. Partial index predicate coverage: count logs the index will cover
    const covered = await client.query(`
      SELECT COUNT(*) AS cnt
      FROM segment_exercise_log
      WHERE is_draft = FALSE AND weight_kg IS NOT NULL
    `);
    const coveredCnt = Number(covered.rows[0]?.cnt ?? 0);
    pass("sql/partial-index-coverage", `${coveredCnt} row(s) covered by idx_seglog_day_weight_nondraft`);
  } catch (err) {
    fail("sql/connection", String(err.message));
  } finally {
    await client.end().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function printSummary() {
  const passCount = results.filter((r) => r.status === "PASS").length;
  const warnCount = results.filter((r) => r.status === "WARN").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const total = results.length;

  console.log("\n" + "─".repeat(60));
  console.log("HISTORY QA SMOKE — SUMMARY");
  console.log("─".repeat(60));

  const col = (s, w) => s.padEnd(w).slice(0, w);

  for (const r of results) {
    const icon = r.status === "PASS" ? "\u2713" : r.status === "WARN" ? "!" : "\u2717";
    console.log(`${icon} ${col(r.status, 4)}  ${col(r.name, 52)}  ${r.detail}`);
  }

  console.log("─".repeat(60));
  console.log(`Total: ${total}  PASS: ${passCount}  WARN: ${warnCount}  FAIL: ${failCount}`);
  console.log("─".repeat(60));

  if (failCount > 0) {
    console.error(`\n${failCount} check(s) FAILED.`);
    process.exit(1);
  } else if (warnCount > 0) {
    console.warn(`\nAll checks passed (${warnCount} warning(s)).`);
  } else {
    console.log("\nAll checks passed.");
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log(`History QA Smoke Harness`);
console.log(`ENV FILE:              ${_envFile}`);
console.log(`BASE_URL:              ${BASE_URL}`);
console.log(`USER_A:                ${USER_A}`);
console.log(`USER_B:                ${USER_B || "(not set)"}`);
console.log(`EXERCISE_ID:           ${EXERCISE_ID || "(not set)"}`);
console.log(`DATABASE_URL:          ${DATABASE_URL ? "(set)" : "(not set)"}`);
console.log(`INTERNAL_TOKEN_HEADER: ${INTERNAL_TOKEN_HEADER}${INTERNAL_TOKEN_HEADER === "authorization" ? " (Bearer)" : ""}`);
console.log(`USER_ID_HEADER:        ${USER_ID_HEADER}`);

await checkAuthGuard();
await checkOverview();
await checkPrograms();
await checkTimeline();
await checkPersonalRecords();
await checkExercise();
await checkMultiTenant();
await checkPerformance();
await checkSqlInvariants();

printSummary();
