import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { exerciseGuidanceRouter } from "../src/routes/exerciseGuidance.js";
import { pool } from "../src/db.js";

function createApp() {
  const app = express();
  app.use((req, _res, next) => {
    req.request_id = "test-request";
    next();
  });
  app.use("/api/exercise", exerciseGuidanceRouter);
  return app;
}

async function withServer(run) {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });

  try {
    await run(server);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

test("GET /api/exercise/:id/guidance returns guidance object for known exercise", async () => {
  const originalQuery = pool.query.bind(pool);
  pool.query = async () => ({
    rowCount: 1,
    rows: [{
      exercise_id: "bb_back_squat",
      name: "Back Squat",
      coaching_cues_json: ["Brace hard", "Drive through mid-foot"],
      technique_cue: "Brace before you break",
      technique_setup: "Set the bar across your upper back.",
      technique_execution_json: ["Breathe and brace", "Sit down between the hips"],
      technique_mistakes_json: ["Losing mid-foot pressure"],
      technique_video_url: "https://example.com/demo.mp4",
      load_guidance: "Build with crisp reps.",
      logging_guidance: "Log your top set.",
      target_regions_json: ["quads", "glutes"],
      movement_pattern_primary: "squat",
    }],
  });

  try {
    await withServer(async (server) => {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/exercise/bb_back_squat/guidance`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.equal(body?.ok, true);
      assert.equal(body?.guidance?.exerciseId, "bb_back_squat");
      assert.deepEqual(body?.guidance?.coachingCues, ["Brace hard", "Drive through mid-foot"]);
      assert.deepEqual(body?.guidance?.techniqueExecution, ["Breathe and brace", "Sit down between the hips"]);
      assert.equal(response.headers.get("cache-control"), "public, max-age=3600, stale-while-revalidate=86400");
    });
  } finally {
    pool.query = originalQuery;
  }
});

test("GET /api/exercise/:id/guidance returns 404 for unknown exercise_id", async () => {
  const originalQuery = pool.query.bind(pool);
  pool.query = async () => ({ rowCount: 0, rows: [] });

  try {
    await withServer(async (server) => {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/exercise/unknown/guidance`);
      const body = await response.json();

      assert.equal(response.status, 404);
      assert.equal(body?.ok, false);
      assert.equal(body?.error, "Exercise not found");
    });
  } finally {
    pool.query = originalQuery;
  }
});

test("GET /api/exercise/:id/guidance normalizes nullable arrays to empty arrays", async () => {
  const originalQuery = pool.query.bind(pool);
  pool.query = async () => ({
    rowCount: 1,
    rows: [{
      exercise_id: "ski_erg",
      name: "Ski Erg",
      coaching_cues_json: null,
      technique_cue: null,
      technique_setup: null,
      technique_execution_json: null,
      technique_mistakes_json: null,
      technique_video_url: null,
      load_guidance: null,
      logging_guidance: null,
      target_regions_json: null,
      movement_pattern_primary: null,
    }],
  });

  try {
    await withServer(async (server) => {
      const { port } = server.address();
      const response = await fetch(`http://127.0.0.1:${port}/api/exercise/ski_erg/guidance`);
      const body = await response.json();

      assert.equal(response.status, 200);
      assert.deepEqual(body?.guidance?.coachingCues, []);
      assert.deepEqual(body?.guidance?.techniqueExecution, []);
      assert.deepEqual(body?.guidance?.techniqueMistakes, []);
      assert.equal(body?.guidance?.techniqueVideoUrl, null);
    });
  } finally {
    pool.query = originalQuery;
  }
});
