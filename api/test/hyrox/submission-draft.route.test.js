import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { createHyroxSubmissionDraftHandler, draftFromSubmissionRow } from "../../src/hyrox/hyroxSubmissionDraftController.js";

const SUBMISSION_ID = "11111111-1111-4111-8111-111111111111";

function buildApp(rows = []) {
  const db = {
    async query(_sql, params) {
      return { rows: rows.filter((row) => row.id === params[0] || row.submission_id === params[0]) };
    },
  };
  const app = express();
  app.get("/api/hyrox/submission-draft/:submissionId", createHyroxSubmissionDraftHandler(db));
  return app;
}

async function request(app, path) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    const body = await response.json();
    return { response, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function row(overrides = {}) {
  return {
    id: SUBMISSION_ID,
    submission_id: SUBMISSION_ID,
    email: "alex@example.com",
    display_name: "Alex Runner",
    sex: "male",
    age_on_race_day: 35,
    age_group: "35-39",
    division: "open",
    finish_time_seconds: 5400,
    race_name: "HYROX Manchester",
    race_date: new Date("2026-01-24T00:00:00.000Z"),
    splits_json: [{ index: 1, segmentKey: "run_1", label: "Run 1", type: "run", timeSeconds: 300 }],
    penalties_json: [{ station: "run_5", penaltySeconds: 60 }],
    race_replay_json: [{ station: "ski_erg", entrySeconds: 12, exitSeconds: 18 }],
    athlete_context_json: {
      targetFinishTimeSeconds: 5100,
      weeklyStrengthSessions: "4_5_days_week",
      weeklyRunningVolume: "30_45_km",
      primaryBackground: "crossfit_hybrid",
    },
    performance_context_json: {},
    marketing_consent: true,
    calculator_mode: "analyse",
    ...overrides,
  };
}

test("draftFromSubmissionRow maps a stored HYROX submission to calculator draft shape", () => {
  const result = draftFromSubmissionRow(row());

  assert.equal(result.submissionId, SUBMISSION_ID);
  assert.equal(result.draft.athlete.name, "Alex Runner");
  assert.equal(result.draft.athlete.email, "alex@example.com");
  assert.equal(result.draft.race.raceDate, "2026-01-24");
  assert.equal(result.draft.race.finishTimeSeconds, 5400);
  assert.equal(result.draft.splits[0].segmentKey, "run_1");
  assert.equal(result.draft.penalties[0].penaltySeconds, 60);
  assert.equal(result.draft.raceReplay[0].station, "ski_erg");
  assert.equal(result.draft.athleteContext.targetFinishTimeSeconds, 5100);
});

test("GET /api/hyrox/submission-draft/:submissionId returns restored draft", async () => {
  const { response, body } = await request(buildApp([row()]), `/api/hyrox/submission-draft/${SUBMISSION_ID}`);

  assert.equal(response.status, 200);
  assert.equal(body.submissionId, SUBMISSION_ID);
  assert.equal(body.draft.athlete.name, "Alex Runner");
  assert.equal(body.draft.race.finishTimeSeconds, 5400);
});

test("GET /api/hyrox/submission-draft/:submissionId rejects invalid ids", async () => {
  const { response, body } = await request(buildApp([row()]), "/api/hyrox/submission-draft/not-a-uuid");

  assert.equal(response.status, 400);
  assert.equal(body.error, "invalid_submission_id");
});

test("GET /api/hyrox/submission-draft/:submissionId returns 404 for unknown submission", async () => {
  const { response, body } = await request(buildApp([]), `/api/hyrox/submission-draft/${SUBMISSION_ID}`);

  assert.equal(response.status, 404);
  assert.equal(body.error, "not_found");
});
