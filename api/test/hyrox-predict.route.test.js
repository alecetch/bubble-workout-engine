import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { predict } from "../src/hyrox/hyroxPredictController.js";

function buildApp() {
  const app = express();
  app.use(express.json());
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
  const { response, body } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody()),
  });

  assert.equal(response.status, 200);
  assert.ok(body.predictionId);
  assert.equal(body.segments.length, 16);
  assert.ok(Array.isArray(body.topLimiters));
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
  const { response, body } = await request(buildApp(), "/api/hyrox/predict", {
    method: "POST",
    body: JSON.stringify(validBody({ website: "bot" })),
  });

  assert.equal(response.status, 200);
  assert.match(body.predictionId, /^hp-/);
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
