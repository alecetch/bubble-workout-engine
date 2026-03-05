import test from "node:test";
import assert from "node:assert/strict";
import { clampLimit, createHistoryProgramsHandler, mapHistoryProgramRow } from "../src/routes/historyPrograms.js";

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

test("clampLimit defaults and clamps to 1..50", () => {
  assert.equal(clampLimit(undefined), 10);
  assert.equal(clampLimit(""), 1);
  assert.equal(clampLimit("0"), 1);
  assert.equal(clampLimit("1"), 1);
  assert.equal(clampLimit("10"), 10);
  assert.equal(clampLimit("99"), 50);
});

test("mapHistoryProgramRow maps nullable heroMediaId and numeric fields", () => {
  const mapped = mapHistoryProgramRow({
    program_id: "program-1",
    program_title: "Strength Block",
    program_summary: "A summary",
    start_date: "2026-02-01",
    status: "active",
    hero_media_id: null,
    total_sessions: "8",
    completed_sessions: "6",
    completion_ratio: "0.75",
  });

  assert.deepEqual(mapped, {
    programId: "program-1",
    programTitle: "Strength Block",
    programSummary: "A summary",
    startDate: "2026-02-01",
    status: "active",
    totalSessions: 8,
    completedSessions: 6,
    completionRatio: 0.75,
    heroMediaId: null,
  });
});

test("history handler scopes by auth user and returns mapped rows", async () => {
  let capturedQuery = "";
  let capturedParams = [];

  const db = {
    async query(text, params) {
      capturedQuery = text;
      capturedParams = params;
      return {
        rows: [
          {
            program_id: "program-a",
            program_title: "Program A",
            program_summary: "Summary A",
            start_date: "2026-01-10",
            status: "active",
            hero_media_id: "11111111-1111-1111-1111-111111111111",
            total_sessions: "4",
            completed_sessions: "2",
            completion_ratio: "0.5",
          },
          {
            program_id: "program-b",
            program_title: "Program B",
            program_summary: "Summary B",
            start_date: "2026-01-01",
            status: "active",
            hero_media_id: null,
            total_sessions: "0",
            completed_sessions: "0",
            completion_ratio: "0",
          },
        ],
      };
    },
  };

  const handler = createHistoryProgramsHandler(db);
  const req = {
    auth: { user_id: "user-123" },
    query: { limit: "200" },
  };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(capturedQuery.includes("WHERE p.user_id = $1"));
  assert.ok(capturedQuery.includes("COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE)"));
  assert.deepEqual(capturedParams, ["user-123", 50]);

  assert.equal(Array.isArray(res.body), true);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].completionRatio, 0.5);
  assert.equal(res.body[0].heroMediaId, "11111111-1111-1111-1111-111111111111");
  assert.equal(res.body[1].heroMediaId, null);
});

test("history handler rejects requests without auth user id", async () => {
  const handler = createHistoryProgramsHandler({ query: async () => ({ rows: [] }) });
  const req = { auth: {}, query: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.code, "unauthorized");
});

