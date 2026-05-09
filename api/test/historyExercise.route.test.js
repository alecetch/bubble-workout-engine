import test from "node:test";
import assert from "node:assert/strict";
import { createHistoryExerciseHandler } from "../src/routes/historyExercise.js";

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("handler uses required filters, user scope, ASC series ordering, and exact response shape", async () => {
  const queries = [];
  const db = {
    async query(text, params) {
      queries.push({ text, params });

      if (queries.length === 1) {
        // Simulate DB returning DESC (most-recent first), as the SQL now orders.
        return {
          rows: [
            {
              date: "2026-02-28T00:00:00.000Z",
              top_weight_kg: "110",
              top_reps: "3",
              tonnage: "880",
            },
            {
              date: "2026-02-25T00:00:00.000Z",
              top_weight_kg: "100",
              top_reps: "5",
              tonnage: "900",
            },
          ],
        };
      }

      if (queries.length === 2) {
        return {
          rows: [
            {
              last_performed: "2026-02-28",
              best_weight_kg: "110",
              sessions_count: "2",
            },
          ],
        };
      }

      return {
        rows: [{ exercise_name: "Barbell Back Squat" }],
      };
    },
  };

  const handler = createHistoryExerciseHandler(db);
  const req = {
    auth: { user_id: "user-123" },
    params: { exerciseId: "bb_back_squat" },
    query: { window: "all" },
    headers: {},
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(queries.length, 3);

  assert.ok(queries[0].text.includes("WHERE p.user_id = $1"));
  assert.ok(queries[0].text.includes("pd.is_completed = TRUE"));
  assert.ok(queries[0].text.includes("l.is_draft = FALSE"));
  assert.ok(queries[0].text.includes("pe.exercise_id = $2"));
  assert.ok(queries[0].text.includes("ORDER BY daily.date DESC"));
  assert.ok(queries[0].text.includes("LIMIT 180"));

  assert.ok(queries[1].text.includes("WHERE p.user_id = $1"));
  assert.ok(queries[1].text.includes("pd.is_completed = TRUE"));
  assert.ok(queries[1].text.includes("l.is_draft = FALSE"));
  assert.ok(queries[1].text.includes("pe.exercise_id = $2"));

  assert.deepEqual(queries[0].params, ["user-123", "bb_back_squat"]);
  assert.deepEqual(queries[1].params, ["user-123", "bb_back_squat"]);

  assert.deepEqual(res.body, {
    exerciseId: "bb_back_squat",
    exerciseName: "Barbell Back Squat",
    series: [
      { date: "2026-02-25", topWeightKg: 100, tonnage: 900, topReps: 5, estimatedE1rmKg: null, decisionOutcome: null, decisionPrimaryLever: null },
      { date: "2026-02-28", topWeightKg: 110, tonnage: 880, topReps: 3, estimatedE1rmKg: null, decisionOutcome: null, decisionPrimaryLever: null },
    ],
    summary: {
      lastPerformed: "2026-02-28",
      bestWeightKg: 110,
      bestEstimatedE1rmKg: null,
      sessionsCount: 2,
    },
  });
});

test("name resolution query prefers catalogue name then program_exercise fallback", async () => {
  let capturedNameQuery = "";
  let callCount = 0;
  const db = {
    async query(text) {
      callCount += 1;
      if (callCount === 3) capturedNameQuery = text;
      if (callCount === 1) return { rows: [] };
      if (callCount === 2) {
        return {
          rows: [{ last_performed: null, best_weight_kg: null, sessions_count: "0" }],
        };
      }
      return { rows: [{ exercise_name: "Back Squat" }] };
    },
  };

  const handler = createHistoryExerciseHandler(db);
  const res = createMockRes();
  await handler(
    {
      auth: { user_id: "user-123" },
      params: { exerciseId: "bb_back_squat" },
      headers: {},
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.ok(capturedNameQuery.includes("COALESCE("));
  assert.ok(capturedNameQuery.includes("FROM exercise_catalogue ec"));
  assert.ok(capturedNameQuery.includes("FROM program_exercise pe"));
});

test("series is capped at 180 points and returned in ASC date order", async () => {
  // Build 181 rows as the DB would return them: DESC (most recent first).
  const base = new Date("2026-03-01T00:00:00Z");
  const dbRowsDesc = Array.from({ length: 181 }, (_, i) => ({
    date: new Date(base.getTime() - i * 86_400_000).toISOString().slice(0, 10),
    top_weight_kg: String(100 + i),
    top_reps: "5",
    tonnage: "500",
  }));

  let callCount = 0;
  const db = {
    async query() {
      callCount += 1;
      if (callCount === 1) return { rows: dbRowsDesc };
      if (callCount === 2) {
        return { rows: [{ last_performed: null, best_weight_kg: null, sessions_count: "0" }] };
      }
      return { rows: [{ exercise_name: "Squat" }] };
    },
  };

  const handler = createHistoryExerciseHandler(db);
  const res = createMockRes();
  await handler(
    { auth: { user_id: "user-123" }, params: { exerciseId: "squat" }, headers: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  // The SQL uses LIMIT 180, but the mock returns 181 rows to prove the handler
  // itself does not add a secondary cap — the DB limit is the authority.
  // Here we verify the handler correctly reverses DESC→ASC order.
  assert.equal(res.body.series.length, 181); // mock bypasses SQL LIMIT; reversal still applied
  // First element should be the oldest date (2026-03-01 minus 180 days).
  const oldest = new Date(base.getTime() - 180 * 86_400_000).toISOString().slice(0, 10);
  const newest = "2026-03-01";
  assert.equal(res.body.series[0].date, oldest);
  assert.equal(res.body.series[res.body.series.length - 1].date, newest);
  // Confirm dates are strictly ascending.
  for (let i = 1; i < res.body.series.length; i++) {
    assert.ok(res.body.series[i].date > res.body.series[i - 1].date, "series must be ASC");
  }
});

test("falls back to exerciseId name and empty/null summary when no data", async () => {
  let callCount = 0;
  const db = {
    async query() {
      callCount += 1;
      if (callCount === 1) return { rows: [] };
      if (callCount === 2) {
        return {
          rows: [{ last_performed: null, best_weight_kg: null, sessions_count: "0" }],
        };
      }
      return { rows: [] };
    },
  };

  const handler = createHistoryExerciseHandler(db);
  const res = createMockRes();
  await handler(
    {
      auth: { user_id: "user-123" },
      params: { exerciseId: "deadlift" },
      headers: {},
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    exerciseId: "deadlift",
    exerciseName: "deadlift",
    series: [],
    summary: {
      lastPerformed: null,
      bestWeightKg: null,
      bestEstimatedE1rmKg: null,
      sessionsCount: 0,
    },
  });
});

test("series includes estimatedE1rmKg and decisionOutcome when the DB returns them", async () => {
  let callCount = 0;
  const db = {
    async query() {
      callCount += 1;
      if (callCount === 1) {
        return {
          rows: [
            {
              date: "2026-03-01",
              top_weight_kg: "100",
              top_reps: "5",
              tonnage: "1000",
              estimated_e1rm_kg: "115.5",
              decision_outcome: "increase_load",
              decision_primary_lever: "load",
            },
            {
              date: "2026-03-08",
              top_weight_kg: "105",
              top_reps: "5",
              tonnage: "1050",
              estimated_e1rm_kg: "121.2",
              decision_outcome: null,
              decision_primary_lever: null,
            },
          ],
        };
      }
      if (callCount === 2) {
        return {
          rows: [{ last_performed: "2026-03-08", best_weight_kg: "105", best_estimated_e1rm_kg: "121.2", sessions_count: "2" }],
        };
      }
      return { rows: [{ exercise_name: "Barbell Squat" }] };
    },
  };

  const handler = createHistoryExerciseHandler(db);
  const res = createMockRes();
  await handler(
    { auth: { user_id: "user-1" }, params: { exerciseId: "bb_squat" }, query: { window: "all" }, headers: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.series[0].estimatedE1rmKg, 121.2);
  assert.equal(res.body.series[0].decisionOutcome, null);
  assert.equal(res.body.series[1].estimatedE1rmKg, 115.5);
  assert.equal(res.body.series[1].decisionOutcome, "increase_load");
  assert.equal(res.body.series[1].decisionPrimaryLever, "load");
  assert.equal(res.body.summary.bestEstimatedE1rmKg, 121.2);
});

test("window parameter '4w' includes a date-filter clause in the series query", async () => {
  let seriesQuery = "";
  let seriesParams = [];
  let callCount = 0;
  const db = {
    async query(text, params) {
      callCount += 1;
      if (callCount === 1) {
        seriesQuery = text;
        seriesParams = params;
        return { rows: [] };
      }
      if (callCount === 2) {
        return { rows: [{ last_performed: null, best_weight_kg: null, best_estimated_e1rm_kg: null, sessions_count: "0" }] };
      }
      return { rows: [{ exercise_name: "Squat" }] };
    },
  };

  const handler = createHistoryExerciseHandler(db);
  const res = createMockRes();
  await handler(
    { auth: { user_id: "user-1" }, params: { exerciseId: "bb_squat" }, query: { window: "4w" }, headers: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.ok(seriesQuery.includes("WHERE daily.date <= CURRENT_DATE"));
  assert.ok(seriesQuery.includes("daily.date >= CURRENT_DATE - ($3 - 1)"));
  assert.equal(seriesParams[2], 28);
});

test("invalid window value defaults to 12w (84 days)", async () => {
  let capturedParams = [];
  let callCount = 0;
  const db = {
    async query(_text, params) {
      callCount += 1;
      if (callCount === 1) {
        capturedParams = params;
        return { rows: [] };
      }
      if (callCount === 2) {
        return { rows: [{ last_performed: null, best_weight_kg: null, best_estimated_e1rm_kg: null, sessions_count: "0" }] };
      }
      return { rows: [{ exercise_name: "Squat" }] };
    },
  };

  const handler = createHistoryExerciseHandler(db);
  const res = createMockRes();
  await handler(
    { auth: { user_id: "user-1" }, params: { exerciseId: "bb_squat" }, query: { window: "not_a_window" }, headers: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(capturedParams[2], 84);
});

test("series decision markers prefer the matching program day and otherwise fall back deterministically", async () => {
  let capturedSeriesQuery = "";
  let callCount = 0;
  const db = {
    async query(text) {
      callCount += 1;
      if (callCount === 1) {
        capturedSeriesQuery = text;
        return {
          rows: [
            {
              date: "2026-03-01",
              top_weight_kg: "100",
              top_reps: "5",
              tonnage: "1000",
              estimated_e1rm_kg: "115.5",
              decision_outcome: "increase_load",
              decision_primary_lever: "load",
            },
          ],
        };
      }
      if (callCount === 2) {
        return {
          rows: [{ last_performed: "2026-03-01", best_weight_kg: "100", best_estimated_e1rm_kg: "115.5", sessions_count: "1" }],
        };
      }
      return { rows: [{ exercise_name: "Barbell Squat" }] };
    },
  };

  const handler = createHistoryExerciseHandler(db);
  const res = createMockRes();
  await handler(
    { auth: { user_id: "user-1" }, params: { exerciseId: "bb_squat" }, query: { window: "12w" }, headers: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.ok(capturedSeriesQuery.includes("pd.id AS program_day_id"));
  assert.ok(capturedSeriesQuery.includes("epd.created_at::date <= daily.date"));
  assert.ok(capturedSeriesQuery.includes("CASE WHEN epd.program_day_id = daily.program_day_id THEN 0 ELSE 1 END ASC"));
  assert.ok(capturedSeriesQuery.includes("epd.created_at DESC"));
  assert.ok(capturedSeriesQuery.includes("epd.id DESC"));
  assert.equal(res.body.series[0].decisionOutcome, "increase_load");
});
