import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = "ci-test-jwt-secret-at-least-32-chars-long";
const JWT_ISSUER = "bubble-test";

function tokenFor(userId) {
  return jwt.sign({ sub: userId, iss: JWT_ISSUER }, JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });
}

async function withServer(pool, fn) {
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.JWT_ISSUER = JWT_ISSUER;
  const { splitRecommendationRouter } = await import("../src/routes/splitRecommendation.js");
  const app = express();
  app.locals.pool = pool;
  app.use(express.json());
  app.use("/api", splitRecommendationRouter);
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  try {
    const port = server.address().port;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /api/split-recommendation returns an existing preference when present", async () => {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return {
        rowCount: 1,
        rows: [{
          preferred_split_json: { day_focuses: ["push", "pull", "legs"], modified_by_user: true },
          preferred_days: ["Mon", "Wed", "Fri"],
          program_type_slug: "hypertrophy",
        }],
      };
    },
  };

  await withServer(pool, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/split-recommendation`, {
      headers: { Authorization: `Bearer ${tokenFor("user-1")}` },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.recommendation, ["full_body", "full_body", "full_body"]);
    assert.deepEqual(body.existingPreference, ["push", "pull", "legs"]);
    assert.equal(body.existingModifiedByUser, true);
    assert.deepEqual(calls[0].params, ["user-1"]);
  });
});

test("GET /api/split-recommendation returns 404 when the user has no profile", async () => {
  const pool = {
    async query() {
      return { rowCount: 0, rows: [] };
    },
  };

  await withServer(pool, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/split-recommendation`, {
      headers: { Authorization: `Bearer ${tokenFor("missing-user")}` },
    });
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.code, "not_found");
  });
});
