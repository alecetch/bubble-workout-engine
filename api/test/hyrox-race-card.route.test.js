import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { createHyroxRaceCardHandler } from "../src/hyrox/hyroxRaceCardController.js";

const SUBMISSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// Minimal analysisJson that satisfies buildHyroxRaceCardData
const ANALYSIS_JSON = {
  athlete: { name: "TEST RUNNER", division: "open" },
  race: { finishTimeSeconds: 3548, targetTimeSeconds: null },
  scores: { overallPerformanceScore: 72 },
  headline: { biggestStrength: null, biggestLimiter: null, headlineGainSeconds: null },
  timePotential: {},
  benchmarkContext: { comparisonOptions: [] },
  segments: [
    { segmentKey: "ski_erg", label: "SkiErg", type: "station", userSeconds: 240, frameGapSeconds: -10, percentile: 70 },
  ],
};

const FAKE_PNG = Buffer.from("FAKEPNG");

function buildApp({ rows = null } = {}) {
  const defaultRow = {
    analysis_json: ANALYSIS_JSON,
    display_name: "Test Runner",
    division: "open",
    calculator_mode: "analyse",
    athlete_context_json: null,
    performance_context_json: null,
  };

  const db = {
    async query(_sql, [submissionId]) {
      if (submissionId === SUBMISSION_ID) {
        return { rows: rows !== null ? rows : [defaultRow] };
      }
      return { rows: [] };
    },
  };

  const generatePng = async () => FAKE_PNG;

  const handler = createHyroxRaceCardHandler(db, { generatePng });
  const app = express();
  app.get("/api/hyrox/race-card/:submissionId", handler);
  return app;
}

async function request(app, path, options = {}) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
    return res;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

test("GET /api/hyrox/race-card/:submissionId returns 200 PNG for valid submission", async () => {
  const res = await request(buildApp(), `/api/hyrox/race-card/${SUBMISSION_ID}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /image\/png/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual(buf, FAKE_PNG);
});

test("GET /api/hyrox/race-card/:submissionId returns 404 for non-existent submission", async () => {
  const res = await request(buildApp(), `/api/hyrox/race-card/${OTHER_ID}`);
  assert.equal(res.status, 404);
});

test("GET /api/hyrox/race-card/:submissionId returns 404 when analysis_json is null", async () => {
  const app = buildApp({ rows: [{ ...ANALYSIS_JSON, analysis_json: null, display_name: null, division: null, calculator_mode: null, athlete_context_json: null, performance_context_json: null }] });
  const res = await request(app, `/api/hyrox/race-card/${SUBMISSION_ID}`);
  assert.equal(res.status, 404);
});

test("GET /api/hyrox/race-card/:submissionId?download=1 sends attachment header", async () => {
  const res = await request(buildApp(), `/api/hyrox/race-card/${SUBMISSION_ID}?download=1`);
  assert.equal(res.status, 200);
  const disposition = res.headers.get("content-disposition") ?? "";
  assert.match(disposition, /attachment/);
  assert.match(disposition, /race-card\.png/);
});

test("GET /api/hyrox/race-card/:submissionId returns 500 when PNG generation throws", async () => {
  const db = {
    async query() {
      return {
        rows: [{
          analysis_json: ANALYSIS_JSON,
          display_name: null,
          division: null,
          calculator_mode: null,
          athlete_context_json: null,
          performance_context_json: null,
        }],
      };
    },
  };
  const generatePng = async () => { throw new Error("Puppeteer crash"); };
  const handler = createHyroxRaceCardHandler(db, { generatePng });
  const app = express();
  app.get("/api/hyrox/race-card/:submissionId", handler);

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/hyrox/race-card/${SUBMISSION_ID}`);
    assert.equal(res.status, 500);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
