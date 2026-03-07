import test from "node:test";
import assert from "node:assert/strict";
import {
  clampPersonalRecordsLimit,
  createHistoryPersonalRecordsHandler,
  mapPersonalRecordRow,
} from "../src/routes/historyPersonalRecords.js";

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

test("clampPersonalRecordsLimit defaults and clamps to 1..50", () => {
  assert.equal(clampPersonalRecordsLimit(undefined), 20);
  assert.equal(clampPersonalRecordsLimit("0"), 1);
  assert.equal(clampPersonalRecordsLimit("1"), 1);
  assert.equal(clampPersonalRecordsLimit("20"), 20);
  assert.equal(clampPersonalRecordsLimit("999"), 50);
});

test("mapPersonalRecordRow returns exact API shape", () => {
  const mapped = mapPersonalRecordRow({
    exercise_id: "barbell_back_squat",
    exercise_name: "Back Squat",
    value: "140.5",
    date: "2026-03-01T00:00:00.000Z",
    program_day_id: "11111111-1111-4111-8111-111111111111",
  });

  assert.deepEqual(mapped, {
    exerciseId: "barbell_back_squat",
    exerciseName: "Back Squat",
    metric: "weight_kg",
    value: 140.5,
    date: "2026-03-01",
    programDayId: "11111111-1111-4111-8111-111111111111",
  });
});

test("handler query enforces completed-only and excludes draft logs", async () => {
  let capturedQuery = "";
  let capturedParams = [];
  const db = {
    async query(text, params) {
      capturedQuery = text;
      capturedParams = params;
      return {
        rows: [
          {
            exercise_id: "deadlift",
            exercise_name: "Deadlift",
            value: "180",
            date: "2026-03-01",
            program_day_id: "22222222-2222-4222-8222-222222222222",
          },
        ],
      };
    },
  };

  const handler = createHistoryPersonalRecordsHandler(db);
  const req = { auth: { user_id: "user-123" }, query: { limit: "99" }, headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(capturedQuery.includes("pd.is_completed = TRUE"));
  assert.ok(capturedQuery.includes("l.is_draft = FALSE"));
  assert.ok(capturedQuery.includes("p.user_id = $1"));
  assert.deepEqual(capturedParams, ["user-123", 50]);
  assert.equal(res.body[0].exerciseId, "deadlift");
  assert.equal(res.body[0].metric, "weight_kg");
});

test("query prefers catalogue name with fallback via COALESCE", async () => {
  let capturedQuery = "";
  const db = {
    async query(text) {
      capturedQuery = text;
      return { rows: [] };
    },
  };

  const handler = createHistoryPersonalRecordsHandler(db);
  const req = { auth: { user_id: "user-123" }, query: {}, headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(capturedQuery.includes("COALESCE(ec.name, pe.exercise_name) AS exercise_name"));
});

