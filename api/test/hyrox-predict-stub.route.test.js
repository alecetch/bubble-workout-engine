import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { predict } from "../src/hyrox/hyroxPredictController.js";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.locals.hyroxPredictorPool = {
    async query(sql, params = []) {
      if (/INSERT INTO hyrox_predictor_submissions/i.test(sql)) return { rows: [{ id: "sub-1", email: params[0] }], rowCount: 1 };
      if (/INSERT INTO hyrox_predictions/i.test(sql)) return { rows: [{ id: "pred-1", predictor_submission_id: params[0] }], rowCount: 1 };
      if (/INSERT INTO hyrox_predictor_email_log/i.test(sql)) return { rows: [{ id: "log-1" }], rowCount: 1 };
      if (/UPDATE hyrox_predictor_email_log/i.test(sql)) return { rows: [], rowCount: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  app.locals.hyroxPredictorEmailSender = async () => undefined;
  app.post("/api/hyrox/predict", predict);
  return app;
}

async function request(app, path, options = {}) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      headers: { "content-type": "application/json", ...(options.headers ?? {}) },
      ...options,
    });
    const text = await response.text();
    return { response, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("POST /api/hyrox/predict returns stub prediction response", async () => {
  const { response, body } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify({
      athlete: { email: "alex@example.com", sex: "male", division: "open" },
      benchmarks: { run5kSeconds: 1350, backSquat3RM: 120, deadlift3RM: 160, bodyweightKg: 85 },
      context: {},
      race: {},
      marketingConsent: false,
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(typeof body.predictionId, "string");
  assert.ok(body.predictionId.length > 0);
});
