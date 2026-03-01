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
        return {
          rows: [
            {
              date: "2026-02-25T00:00:00.000Z",
              top_weight_kg: "100",
              top_reps: "5",
              tonnage: "900",
            },
            {
              date: "2026-02-28T00:00:00.000Z",
              top_weight_kg: "110",
              top_reps: "3",
              tonnage: "880",
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
    params: { exerciseId: "barbell_back_squat" },
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
  assert.ok(queries[0].text.includes("ORDER BY pd.scheduled_date ASC"));

  assert.ok(queries[1].text.includes("WHERE p.user_id = $1"));
  assert.ok(queries[1].text.includes("pd.is_completed = TRUE"));
  assert.ok(queries[1].text.includes("l.is_draft = FALSE"));
  assert.ok(queries[1].text.includes("pe.exercise_id = $2"));

  assert.deepEqual(queries[0].params, ["user-123", "barbell_back_squat"]);
  assert.deepEqual(queries[1].params, ["user-123", "barbell_back_squat"]);

  assert.deepEqual(res.body, {
    exerciseId: "barbell_back_squat",
    exerciseName: "Barbell Back Squat",
    series: [
      { date: "2026-02-25", topWeightKg: 100, tonnage: 900, topReps: 5 },
      { date: "2026-02-28", topWeightKg: 110, tonnage: 880, topReps: 3 },
    ],
    summary: {
      lastPerformed: "2026-02-28",
      bestWeightKg: 110,
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
      params: { exerciseId: "barbell_back_squat" },
      headers: {},
    },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.ok(capturedNameQuery.includes("COALESCE("));
  assert.ok(capturedNameQuery.includes("FROM exercise_catalogue ec"));
  assert.ok(capturedNameQuery.includes("FROM program_exercise pe"));
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
      sessionsCount: 0,
    },
  });
});
