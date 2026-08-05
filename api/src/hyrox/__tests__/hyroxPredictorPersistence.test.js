import assert from "node:assert/strict";
import test from "node:test";
import { persistPredictorSubmission } from "../hyroxPredictorPersistence.js";

const request = {
  athlete: { email: "alex@example.com", name: "Alex", sex: "male", ageGroup: "30-34", division: "open" },
  benchmarks: {
    run5kSeconds: 1200,
    run10kSeconds: 2550,
    backSquat3RM: 120,
    backSquatReps: 4,
    deadlift3RM: 160,
    deadliftReps: 5,
    bodyweightKg: 82,
    heightCm: 181,
    rowErg2kSeconds: 430,
    skiErg1kSeconds: 235,
    wallBallRepsIn2Min: 42,
    farmerCarryTimeSeconds: 95,
    previousHyroxSeconds: 5600,
  },
  context: { trainingFrequency: "4-5", primaryBackground: "crossfit", weeklyRunningKm: "15-30" },
  race: { targetFinishTimeSeconds: 5400 },
  marketingConsent: true,
  researchConsent: true,
  appLinkConsent: true,
  clientSessionId: "client-1",
  requestId: "request-1",
};

const prediction = {
  predictionVersion: "v1",
  predictedFinishSeconds: 5700,
  rangeLowSeconds: 5400,
  rangeHighSeconds: 6000,
  confidenceScore: 0.71,
  confidenceLabel: "good",
  predictionMode: "best",
  segments: [{ segmentKey: "run_1" }],
  targetComparison: { gapSeconds: -300 },
};

function pool() {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      if (/hyrox_predictor_submissions/i.test(sql)) return { rows: [{ id: "sub-1", email: params[0] }] };
      if (/hyrox_predictions/i.test(sql)) return { rows: [{ id: "pred-1", predictor_submission_id: params[0] }] };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test("persistPredictorSubmission maps request and prediction fields into both tables", async () => {
  const db = pool();
  const result = await persistPredictorSubmission(request, prediction, db);

  assert.equal(result.submission.id, "sub-1");
  assert.deepEqual(db.queries[0].params, [
    "alex@example.com", "Alex", "male", "30-34", "open", 1200, 2550, 120, 4, 160, 5, 82, 181, 430,
    235, 42, 95, 5600, "4-5", "crossfit", 22.5, 5400, true, true, true, "client-1", "request-1",
  ]);
  assert.equal(db.queries[1].params[0], "sub-1");
  assert.equal(db.queries[1].params[1], "v1");
  assert.equal(db.queries[1].params[2], 5700);
  assert.equal(db.queries[1].params[5], 0.71);
  assert.equal(JSON.parse(db.queries[1].params[8])[0].segmentKey, "run_1");
  assert.equal(JSON.parse(db.queries[1].params[9]).gapSeconds, -300);
  assert.equal(JSON.parse(db.queries[1].params[10]).predictionVersion, "v1");
});

test("persistPredictorSubmission stores consent as true only when explicitly boolean true", async () => {
  const db = pool();
  await persistPredictorSubmission({ ...request, marketingConsent: "true", researchConsent: undefined, appLinkConsent: "true" }, prediction, db);

  assert.equal(db.queries[0].params[22], false);
  assert.equal(db.queries[0].params[23], false);
  assert.equal(db.queries[0].params[24], false);
});
