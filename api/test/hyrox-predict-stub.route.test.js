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
