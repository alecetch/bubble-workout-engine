import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = "ci-test-jwt-secret-at-least-32-chars-long";
const JWT_ISSUER = "forma-test";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function tokenFor(userId = USER_ID) {
  return jwt.sign({ sub: userId, iss: JWT_ISSUER }, JWT_SECRET, { algorithm: "HS256" });
}

function createDb(rows, calls = []) {
  return {
    async query(sql, params) {
      calls.push({ sql, params });
      assert.doesNotMatch(sql, /hyrox_predictor_submissions/i);
      const userId = params[0];
      const relevant = rows
        .filter((row) => row.linked_app_user_id === userId)
        .filter((row) => row.app_link_consent === true)
        .filter((row) => {
          const ctx = row.athlete_context_json ?? {};
          return (
            ctx.bodyweightKg != null ||
            ctx.heightCm != null ||
            ctx.backSquat3RMKg != null ||
            ctx.deadlift3RMKg != null
          );
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return { rows: relevant.slice(0, 1) };
    },
  };
}

async function buildApp(rows) {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_ISSUER = JWT_ISSUER;
  const { createHyroxOnboardingPrefillRouter } = await import(`../src/routes/hyroxOnboardingPrefill.js?test=${Date.now()}-${Math.random()}`);
  const app = express();
  app.use(express.json());
  app.use("/api/users/me/hyrox-prefill", createHyroxOnboardingPrefillRouter(createDb(rows)));
  return app;
}

async function withServer(app, fn) {
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
  try {
    const { port } = server.address();
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function getPrefill(rows, token = tokenFor()) {
  const app = await buildApp(rows);
  let response;
  let body;
  await withServer(app, async (baseUrl) => {
    response = await fetch(`${baseUrl}/api/users/me/hyrox-prefill`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    body = await response.json();
  });
  return { response, body };
}

test("GET /api/users/me/hyrox-prefill returns mapped prefill data for linked consented submission", async () => {
  const submissionId = "22222222-2222-4222-8222-222222222222";
  const { response, body } = await getPrefill([
    {
      id: submissionId,
      linked_app_user_id: USER_ID,
      app_link_consent: true,
      created_at: "2026-08-05T10:00:00.000Z",
      sex: "female",
      athlete_context_json: {
        heightCm: 170,
        bodyweightKg: 64,
        backSquat3RMKg: 95,
        deadlift3RMKg: 130,
      },
    },
  ]);

  assert.equal(response.status, 200);
  assert.equal(body.available, true);
  assert.equal(body.submissionId, submissionId);
  assert.equal(body.collectedAt, "2026-08-05T10:00:00.000Z");
  assert.deepEqual(body.prefill, {
    heightCm: 170,
    weightKg: 64,
    sex: "female",
    anchorLifts: [
      {
        estimationFamily: "squat",
        exerciseId: "bb_back_squat",
        loadKg: 95,
        reps: 3,
        source: "hyrox_calculator",
        sourceDetailJson: { submissionId },
      },
      {
        estimationFamily: "hinge",
        exerciseId: "bb_deadlift",
        loadKg: 130,
        reps: 3,
        source: "hyrox_calculator",
        sourceDetailJson: { submissionId },
      },
    ],
  });
});

test("GET /api/users/me/hyrox-prefill maps deadlift to hinge estimation family", async () => {
  const { body } = await getPrefill([
    {
      id: "22222222-2222-4222-8222-222222222222",
      linked_app_user_id: USER_ID,
      app_link_consent: true,
      created_at: "2026-08-05T10:00:00.000Z",
      sex: "male",
      athlete_context_json: { deadlift3RMKg: 150 },
    },
  ]);

  assert.equal(body.available, true);
  assert.equal(body.prefill.anchorLifts[0].estimationFamily, "hinge");
  assert.notEqual(body.prefill.anchorLifts[0].estimationFamily, "deadlift");
});

test("GET /api/users/me/hyrox-prefill returns unavailable when there is no linked match", async () => {
  const { body } = await getPrefill([
    {
      id: "22222222-2222-4222-8222-222222222222",
      linked_app_user_id: "33333333-3333-4333-8333-333333333333",
      app_link_consent: true,
      created_at: "2026-08-05T10:00:00.000Z",
      sex: "female",
      athlete_context_json: { heightCm: 170 },
    },
  ]);

  assert.deepEqual(body, { available: false, submissionId: null, collectedAt: null, prefill: null });
});

test("GET /api/users/me/hyrox-prefill returns unavailable when app link consent is false", async () => {
  const { body } = await getPrefill([
    {
      id: "22222222-2222-4222-8222-222222222222",
      linked_app_user_id: USER_ID,
      app_link_consent: false,
      created_at: "2026-08-05T10:00:00.000Z",
      sex: "female",
      athlete_context_json: { heightCm: 170 },
    },
  ]);

  assert.deepEqual(body, { available: false, submissionId: null, collectedAt: null, prefill: null });
});

test("GET /api/users/me/hyrox-prefill returns unavailable when no relevant context fields are populated", async () => {
  const { body } = await getPrefill([
    {
      id: "22222222-2222-4222-8222-222222222222",
      linked_app_user_id: USER_ID,
      app_link_consent: true,
      created_at: "2026-08-05T10:00:00.000Z",
      sex: "female",
      athlete_context_json: { ageGroup: "30-34", trainingAge: "2y" },
    },
  ]);

  assert.deepEqual(body, { available: false, submissionId: null, collectedAt: null, prefill: null });
});

test("GET /api/users/me/hyrox-prefill uses the most recent usable submission without merging fields", async () => {
  const newerId = "44444444-4444-4444-8444-444444444444";
  const { body } = await getPrefill([
    {
      id: "22222222-2222-4222-8222-222222222222",
      linked_app_user_id: USER_ID,
      app_link_consent: true,
      created_at: "2026-08-01T10:00:00.000Z",
      sex: "female",
      athlete_context_json: { bodyweightKg: 64, backSquat3RMKg: 95, deadlift3RMKg: 130 },
    },
    {
      id: newerId,
      linked_app_user_id: USER_ID,
      app_link_consent: true,
      created_at: "2026-08-05T10:00:00.000Z",
      sex: "male",
      athlete_context_json: { heightCm: 181 },
    },
  ]);

  assert.equal(body.available, true);
  assert.equal(body.submissionId, newerId);
  assert.deepEqual(body.prefill, {
    heightCm: 181,
    weightKg: null,
    sex: "male",
    anchorLifts: [],
  });
});

test("GET /api/users/me/hyrox-prefill returns available for height-only submission", async () => {
  const { body } = await getPrefill([
    {
      id: "22222222-2222-4222-8222-222222222222",
      linked_app_user_id: USER_ID,
      app_link_consent: true,
      created_at: "2026-08-05T10:00:00.000Z",
      sex: "female",
      athlete_context_json: { heightCm: 170 },
    },
  ]);

  assert.equal(body.available, true);
  assert.equal(body.prefill.heightCm, 170);
  assert.equal(body.prefill.weightKg, null);
  assert.equal(body.prefill.sex, "female");
  assert.deepEqual(body.prefill.anchorLifts, []);
});

test("GET /api/users/me/hyrox-prefill returns 401 without authentication", async () => {
  const { response, body } = await getPrefill([], null);

  assert.equal(response.status, 401);
  assert.equal(body.code, "unauthorized");
});
