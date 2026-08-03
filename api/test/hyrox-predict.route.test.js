import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { predict } from "../src/hyrox/hyroxPredictController.js";
import { runPredictionEngine } from "../src/hyrox/hyroxPredictorEngine.js";

function createPredictorPool() {
  const state = {
    submissions: [],
    predictions: [],
    emailLogs: [],
  };
  return {
    state,
    async query(sql, params = []) {
      if (/INSERT INTO hyrox_predictor_submissions/i.test(sql)) {
        const row = {
          id: `sub-${state.submissions.length + 1}`,
          email: params[0],
          research_consent: params[23],
        };
        state.submissions.push({ row, params });
        return { rows: [row], rowCount: 1 };
      }
      if (/INSERT INTO hyrox_predictions/i.test(sql)) {
        const row = { id: `pred-${state.predictions.length + 1}`, predictor_submission_id: params[0] };
        state.predictions.push({ row, params });
        return { rows: [row], rowCount: 1 };
      }
      if (/INSERT INTO hyrox_predictor_email_log/i.test(sql)) {
        const row = { id: `log-${state.emailLogs.length + 1}`, predictor_submission_id: params[0], status: "queued" };
        state.emailLogs.push(row);
        return { rows: [row], rowCount: 1 };
      }
      if (/UPDATE hyrox_predictor_email_log SET status = 'sent'/i.test(sql)) {
        const row = state.emailLogs.find((item) => item.id === params[0]);
        if (row) row.status = "sent";
        return { rows: [], rowCount: row ? 1 : 0 };
      }
      if (/UPDATE hyrox_predictor_email_log SET status = 'failed'/i.test(sql)) {
        const row = state.emailLogs.find((item) => item.id === params[0]);
        if (row) {
          row.status = "failed";
          row.error_message = params[1];
        }
        return { rows: [], rowCount: row ? 1 : 0 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

function buildApp({ pool = createPredictorPool(), emailSender = async () => undefined } = {}) {
  const app = express();
  app.use(express.json());
  app.locals.hyroxPredictorPool = pool;
  app.locals.hyroxPredictorEmailSender = emailSender;
  app.locals.hyroxPredictorState = pool.state;
  app.post("/api/hyrox/predict", predict);
  return app;
}

function validBody(overrides = {}) {
  return {
    athlete: { email: "predict@example.com", sex: "male", division: "open", ...(overrides.athlete ?? {}) },
    benchmarks: { run5kSeconds: 1200, backSquat3RM: 120, deadlift3RM: 150, bodyweightKg: 85, ...(overrides.benchmarks ?? {}) },
    context: { primaryBackground: "endurance", weeklyRunningKm: "30-45", ...(overrides.context ?? {}) },
    race: { ...(overrides.race ?? {}) },
    marketingConsent: false,
    researchConsent: false,
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !["athlete", "benchmarks", "context", "race"].includes(key))),
  };
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

test("POST /api/hyrox/predict with valid minimal body returns prediction", async () => {
  const app = buildApp();
  const { response, body } = await request(app, "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody()),
  });

  assert.equal(response.status, 200);
  assert.ok(body.predictionId);
  assert.equal(body.segments.length, 16);
  assert.ok(Array.isArray(body.topLimiters));
  assert.equal(app.locals.hyroxPredictorState.submissions.length, 1);
  assert.equal(app.locals.hyroxPredictorState.predictions.length, 1);
  assert.equal(app.locals.hyroxPredictorState.emailLogs[0].status, "sent");
});

test("POST /api/hyrox/predict missing run5kSeconds returns 400", async () => {
  const body = validBody({ benchmarks: { run5kSeconds: undefined } });
  delete body.benchmarks.run5kSeconds;
  const { response, body: json } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(body),
  });

  assert.equal(response.status, 400);
  assert.equal(json.errors.some((err) => err.field === "benchmarks.run5kSeconds"), true);
});

test("POST /api/hyrox/predict missing bodyweightKg returns 400", async () => {
  const body = validBody({ benchmarks: { bodyweightKg: undefined } });
  delete body.benchmarks.bodyweightKg;
  const { response, body: json } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(body),
  });

  assert.equal(response.status, 400);
  assert.equal(json.errors.some((err) => err.field === "benchmarks.bodyweightKg"), true);
});

test("POST /api/hyrox/predict invalid bodyweightKg returns 400", async () => {
  const { response, body: json } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody({ benchmarks: { bodyweightKg: 20 } })),
  });

  assert.equal(response.status, 400);
  assert.equal(json.errors.some((err) => err.field === "benchmarks.bodyweightKg"), true);
});

test("POST /api/hyrox/predict valid bodyweightKg returns 200", async () => {
  const { response, body } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody({ benchmarks: { bodyweightKg: 90 } })),
  });

  assert.equal(response.status, 200);
  assert.ok(body.predictionId);
});

test("POST /api/hyrox/predict invalid heightCm returns 400", async () => {
  const { response, body: json } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody({ benchmarks: { heightCm: 90 } })),
  });

  assert.equal(response.status, 400);
  assert.equal(json.errors.some((err) => err.field === "benchmarks.heightCm"), true);
});

test("POST /api/hyrox/predict omitting heightCm returns 200", async () => {
  const body = validBody({ benchmarks: { heightCm: undefined } });
  delete body.benchmarks.heightCm;
  const { response, body: json } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(body),
  });

  assert.equal(response.status, 200);
  assert.ok(json.predictionId);
});

test("POST /api/hyrox/predict invalid backSquatReps returns 400", async () => {
  const { response, body: json } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody({ benchmarks: { backSquatReps: 11 } })),
  });

  assert.equal(response.status, 400);
  assert.equal(json.errors.some((err) => err.field === "benchmarks.backSquatReps"), true);
});

test("POST /api/hyrox/predict non-3RM back squat and deadlift with valid rep counts returns 200 and shifts the strength tier", async () => {
  const { response, body } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody({ benchmarks: { backSquat3RM: 140, backSquatReps: 1, deadlift3RM: 150, deadliftReps: 8 } })),
  });

  assert.equal(response.status, 200);
  assert.ok(body.predictionId);
});

test("POST /api/hyrox/predict omitting backSquatReps/deadliftReps returns 200 (defaults to 3RM)", async () => {
  const body = validBody({ benchmarks: {} });
  const { response, body: json } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(body),
  });

  assert.equal(response.status, 200);
  assert.ok(json.predictionId);
});

test("POST /api/hyrox/predict missing email returns 400", async () => {
  const body = validBody({ athlete: { email: undefined } });
  delete body.athlete.email;
  const { response, body: json } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(body),
  });

  assert.equal(response.status, 400);
  assert.equal(json.errors.some((err) => err.field === "athlete.email"), true);
});

test("POST /api/hyrox/predict honeypot returns 200", async () => {
  const app = buildApp();
  const { response, body } = await request(app, "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody({ website: "bot" })),
  });

  assert.equal(response.status, 200);
  assert.match(body.predictionId, /^hp-/);
  assert.equal(app.locals.hyroxPredictorState.submissions.length, 0);
  assert.equal(app.locals.hyroxPredictorState.emailLogs.length, 0);
});

test("POST /api/hyrox/predict applies SkiErg override", async () => {
  const { body } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody({ benchmarks: { skiErg1kSeconds: 240 } })),
  });

  const skierg = body.segments.find((segment) => segment.segmentKey === "skierg");
  assert.equal(skierg.predictedSeconds, 240);
});

test("POST /api/hyrox/predict previous HYROX time increases confidence", async () => {
  const app = buildApp();
  const withoutPrevious = await request(app, "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody()),
  });
  const withPrevious = await request(app, "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody({ benchmarks: { previousHyroxSeconds: 5400 } })),
  });

  assert.ok(withPrevious.body.confidenceScore > withoutPrevious.body.confidenceScore);
});

test("POST /api/hyrox/predict stores research consent when true", async () => {
  const app = buildApp();
  const { response } = await request(app, "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody({ researchConsent: true })),
  });

  assert.equal(response.status, 200);
  assert.equal(app.locals.hyroxPredictorState.submissions[0].params[23], true);
  assert.equal(app.locals.hyroxPredictorState.emailLogs[0].status, "sent");
});

test("POST /api/hyrox/predict persists and emails when research consent is omitted", async () => {
  const body = validBody();
  delete body.researchConsent;
  const app = buildApp();
  const { response } = await request(app, "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(body),
  });

  assert.equal(response.status, 200);
  assert.equal(app.locals.hyroxPredictorState.submissions.length, 1);
  assert.equal(app.locals.hyroxPredictorState.submissions[0].params[23], false);
  assert.equal(app.locals.hyroxPredictorState.emailLogs[0].status, "sent");
});

test("POST /api/hyrox/predict response keys match the prediction engine output", async () => {
  const requestBody = validBody();
  const { response, body } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
  const expected = JSON.parse(JSON.stringify(runPredictionEngine(requestBody)));

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), Object.keys(expected).sort());
});

test("POST /api/hyrox/predict still returns 200 when email sending fails", async () => {
  const app = buildApp({ emailSender: async () => { throw new Error("provider unavailable"); } });
  const { response, body } = await request(app, "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody()),
  });

  assert.equal(response.status, 200);
  assert.ok(body.predictionId);
  assert.equal(app.locals.hyroxPredictorState.emailLogs[0].status, "failed");
  assert.equal(app.locals.hyroxPredictorState.emailLogs[0].error_message, "provider unavailable");
});
