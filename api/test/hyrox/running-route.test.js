import assert from "node:assert/strict";
import express from "express";
import test from "node:test";
import { pool } from "../../src/db.js";
import { analyseRunningProfile } from "../../src/hyrox/running/runningProfilerAnalysisService.js";
import { analyse, health } from "../../src/hyrox/running/runningController.js";
import { runningIpRateLimiter, validateRunningSubmission } from "../../src/hyrox/running/runningValidator.js";

const DB_SKIP = process.env.PGPASSWORD || process.env.DATABASE_URL
  ? false
  : "requires database connection (run inside Docker or set PGPASSWORD)";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validBody(overrides = {}) {
  return {
    athlete: {
      name: "Test Runner",
      email: `runner-${Date.now()}-${Math.random()}@example.com`,
      age: 45,
      gender: "male",
    },
    trainingProfile: {
      backgrounds: ["hyrox", "strength_training"],
      yearsTraining: "3_5",
      weeklyRunningVolume: "21_35",
      runsPerWeek: "3",
      strengthSessionsPerWeek: "2_3",
      hybridSessionsPerWeek: "1",
      primaryGoals: ["improve_hyrox"],
      currentConcern: null,
    },
    performances: [
      {
        distance: "5k",
        timeSeconds: 1320,
        approxDate: "2024-04",
        recency: "current",
      },
    ],
    context: {
      typicalTerrain: "mixed",
      injuryLimitations: "no",
      bodyCompositionGoal: "maintain_muscle_recomp",
      runningLimiter: "time",
      mainCompetitionGoal: "hyrox",
      target5kSeconds: 1200,
      targetHyroxSeconds: 4500,
    },
    marketingConsent: false,
    ...overrides,
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post("/api/running/analyse", validateRunningSubmission, analyse);
  app.get("/api/running/health", health);
  return app;
}

async function request(app, path, options = {}) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}${path}`,
      {
        headers: { "content-type": "application/json", ...(options.headers ?? {}) },
        ...options,
      },
    );
    const text = await response.text();
    return { response, body: text ? JSON.parse(text) : null };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// ─── Analysis service unit tests ─────────────────────────────────────────────

test("high confidence when current 5k provided", () => {
  const result = analyseRunningProfile({
    athlete: { email: "test@example.com", age: 40, gender: "male" },
    trainingProfile: { backgrounds: [], primaryGoals: [], weeklyRunningVolume: "21_35", strengthSessionsPerWeek: "2_3" },
    performances: [{ distance: "5k", timeSeconds: 1320, recency: "current" }],
    context: {},
  });
  assert.equal(result.confidence, "high");
});

test("low confidence when only historic data provided", () => {
  const result = analyseRunningProfile({
    athlete: { email: "test@example.com", age: 40, gender: "male" },
    trainingProfile: { backgrounds: [], primaryGoals: [], weeklyRunningVolume: "21_35", strengthSessionsPerWeek: "2_3" },
    performances: [{ distance: "marathon", timeSeconds: 14400, recency: "historic" }],
    context: {},
  });
  assert.equal(result.confidence, "low");
});

test("historic marathon time is flagged not treated as current capability", () => {
  const result = analyseRunningProfile({
    athlete: { email: "test@example.com", age: 45, gender: "male" },
    trainingProfile: { backgrounds: [], primaryGoals: [], weeklyRunningVolume: "11_20", strengthSessionsPerWeek: "2_3" },
    performances: [{ distance: "marathon", timeSeconds: 12600, recency: "historic" }],
    context: {},
  });
  // Historic data should not produce high confidence
  assert.notEqual(result.confidence, "high");
  // But analysis should still succeed
  assert.ok(result.analysis);
});

test("volume_increase recommendation suppressed when concern is running_hurts_strength_muscle and high volume", () => {
  const result = analyseRunningProfile({
    athlete: { email: "test@example.com", age: 35, gender: "male" },
    trainingProfile: {
      backgrounds: ["strength_training"],
      primaryGoals: ["get_faster_5k_10k"],
      weeklyRunningVolume: "51_70",
      strengthSessionsPerWeek: "4_5",
      currentConcern: "running_hurts_strength_muscle",
    },
    performances: [{ distance: "5k", timeSeconds: 1500, recency: "current" }],
    context: { currentConcern: "running_hurts_strength_muscle" },
  });
  // When concern is running_hurts_strength_muscle, should prioritise separation rec, not volume increase
  const recTitles = result.analysis.recommendations.map((r) => r.title);
  assert.ok(recTitles.includes("Separate Running and Strength Days"), "Should include separation recommendation");
  assert.ok(!recTitles.includes("Training Volume"), "Should not push volume increase when concern is muscle interference");
});

test("knee_ankle_foot injury adds disclaimer to all running recommendations", () => {
  const result = analyseRunningProfile({
    athlete: { email: "test@example.com", age: 50, gender: "female" },
    trainingProfile: { backgrounds: ["running"], primaryGoals: ["improve_endurance"], weeklyRunningVolume: "21_35", strengthSessionsPerWeek: "0_1" },
    performances: [{ distance: "10k", timeSeconds: 3600, recency: "current" }],
    context: { injuryLimitations: "knee_ankle_foot" },
  });
  // Injury limiter should appear in limiters
  const limiterTitles = result.analysis.limiters.map((l) => l.title);
  assert.ok(limiterTitles.includes("Injury Risk / Structural Limitation"), "Should flag injury as a limiter");
  // The limiter should mention professional assessment
  const injuryLimiter = result.analysis.limiters.find((l) => l.title === "Injury Risk / Structural Limitation");
  assert.ok(injuryLimiter?.why.toLowerCase().includes("not medical advice") || injuryLimiter?.why.toLowerCase().includes("professional"), "Should include disclaimer");
});

test("performanceTranslation.projectedHyroxSeconds is null when no HYROX goal supplied", () => {
  const result = analyseRunningProfile({
    athlete: { email: "test@example.com", age: 40, gender: "male" },
    trainingProfile: { backgrounds: ["running"], primaryGoals: ["get_faster_5k_10k"], weeklyRunningVolume: "36_50", strengthSessionsPerWeek: "0_1" },
    performances: [{ distance: "5k", timeSeconds: 1200, recency: "current" }],
    context: {},
  });
  assert.equal(result.analysis.performanceTranslation.projectedHyroxSeconds, null);
});

// ─── API route tests ─────────────────────────────────────────────────────────

test("POST /api/running/analyse with valid 5k returns 200 with analysis", { skip: DB_SKIP }, async () => {
  const app = buildApp();
  const { response, body } = await request(app, "/api/running/analyse", {
    method: "POST",
    body: JSON.stringify(validBody()),
  });
  assert.equal(response.status, 200);
  assert.ok(body.submissionId);
  assert.ok(body.analysis);
  assert.ok(["high", "medium", "low"].includes(body.confidence));
});

test("missing email returns 400", async () => {
  const app = buildApp();
  const body = validBody();
  delete body.athlete.email;
  const { response, body: resBody } = await request(app, "/api/running/analyse", {
    method: "POST",
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 400);
  assert.equal(resBody.error, "validation_failed");
});

test("no performances returns 400", async () => {
  const app = buildApp();
  const { response, body } = await request(app, "/api/running/analyse", {
    method: "POST",
    body: JSON.stringify(validBody({ performances: [] })),
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, "validation_failed");
});

test("all historic performances returns 200 with confidence:low", { skip: DB_SKIP }, async () => {
  const app = buildApp();
  const { response, body } = await request(app, "/api/running/analyse", {
    method: "POST",
    body: JSON.stringify(
      validBody({
        performances: [{ distance: "marathon", timeSeconds: 14400, recency: "historic" }],
      }),
    ),
  });
  assert.equal(response.status, 200);
  assert.equal(body.confidence, "low");
});

test("submission row created in running_profiler_submissions", { skip: DB_SKIP }, async () => {
  const app = buildApp();
  const email = `db-test-${Date.now()}@example.com`;
  const { response, body } = await request(app, "/api/running/analyse", {
    method: "POST",
    body: JSON.stringify(validBody({ athlete: { email, age: 35, gender: "male" } })),
  });
  assert.equal(response.status, 200);

  const row = await pool.query(
    "SELECT id, email FROM running_profiler_submissions WHERE id = $1",
    [body.submissionId],
  );
  assert.equal(row.rows.length, 1);
  assert.equal(row.rows[0].email, email);
});

test("performance rows created in running_profiler_performances", { skip: DB_SKIP }, async () => {
  const app = buildApp();
  const email = `db-perf-${Date.now()}@example.com`;
  const { response, body } = await request(app, "/api/running/analyse", {
    method: "POST",
    body: JSON.stringify(validBody({ athlete: { email, age: 35, gender: "male" } })),
  });
  assert.equal(response.status, 200);

  const rows = await pool.query(
    "SELECT * FROM running_profiler_performances WHERE submission_id = $1",
    [body.submissionId],
  );
  assert.ok(rows.rows.length >= 1, "Should have at least one performance row");
  assert.equal(rows.rows[0].distance, "5k");
});

test("analysis row created in running_profiler_analyses", { skip: DB_SKIP }, async () => {
  const app = buildApp();
  const email = `db-analysis-${Date.now()}@example.com`;
  const { response, body } = await request(app, "/api/running/analyse", {
    method: "POST",
    body: JSON.stringify(validBody({ athlete: { email, age: 35, gender: "male" } })),
  });
  assert.equal(response.status, 200);

  const rows = await pool.query(
    "SELECT * FROM running_profiler_analyses WHERE submission_id = $1",
    [body.submissionId],
  );
  assert.ok(rows.rows.length >= 1, "Should have analysis row");
  assert.ok(["high", "medium", "low"].includes(rows.rows[0].confidence));
});

test("rate limit: 11th request within 1 hour returns 429", async () => {
  // Build app with rate limiter
  const app = express();
  app.use(express.json());
  app.post(
    "/api/running/analyse",
    runningIpRateLimiter,
    validateRunningSubmission,
    analyse,
  );

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/api/running/analyse`;
  const headers = { "content-type": "application/json", "x-forwarded-for": "10.0.0.1" };

  try {
    let lastStatus = 200;
    for (let i = 0; i < 11; i++) {
      const body = validBody({
        athlete: { email: `rl-test-${i}-${Date.now()}@example.com`, age: 35, gender: "male" },
      });
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 429, "11th request should be rate limited");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("GET /api/running/health returns 200", async () => {
  const app = buildApp();
  const { response, body } = await request(app, "/api/running/health");
  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
});
