import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCurrentStreakDays,
  createHistoryOverviewHandler,
} from "../src/routes/historyOverview.js";

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

test("calculateCurrentStreakDays counts streaks longer than 60 days", () => {
  // Build 61 consecutive completed dates ending today (2026-03-01).
  const dates = [];
  const base = new Date("2026-03-01T00:00:00Z");
  for (let i = 0; i < 61; i++) {
    const d = new Date(base.getTime() - i * 86_400_000);
    dates.push({ scheduled_date: d.toISOString().slice(0, 10) });
  }
  const streak = calculateCurrentStreakDays(dates, "2026-03-01");
  assert.equal(streak, 61);
});

test("calculateCurrentStreakDays returns 0 when no completion in last 2 days", () => {
  const streak = calculateCurrentStreakDays(
    [{ scheduled_date: "2026-02-25" }, { scheduled_date: "2026-02-24" }],
    "2026-03-01",
  );
  assert.equal(streak, 0);
});

test("history overview maps completed sessions and trend fields", async () => {
  const queries = [];
  const db = {
    async query(text, params) {
      queries.push({ text, params });
      if (queries.length === 1) {
        return {
          rows: [
            {
              sessions_completed: "4",
              training_hours_completed: "3.5",
              last_completed_date: "2026-03-01",
              programs_completed: "1",
              scheduled_last_30: "10",
              completed_last_30: "8",
              scheduled_prev_30: "10",
              completed_prev_30: "5",
              strength_avg_last_28: "120",
              strength_avg_prev_28: "100",
              volume_avg_last_28: "2500",
              volume_avg_prev_28: "2000",
            },
          ],
        };
      }
      return {
        rows: [{ scheduled_date: "2026-03-01" }, { scheduled_date: "2026-02-28" }],
      };
    },
  };

  const handler = createHistoryOverviewHandler(db, () => new Date("2026-03-01T12:00:00Z"));
  const req = { auth: { user_id: "user-123" }, headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sessionsCompleted, 4);
  assert.equal(res.body.trainingHoursCompleted, 3.5);
  assert.equal(res.body.lastCompletedDate, "2026-03-01");
  assert.equal(res.body.programsCompleted, 1);
  assert.equal(res.body.currentStreakDays, 2);
  assert.deepEqual(res.body.consistency30d, { value: 0.8, delta: 0.30000000000000004 });
  assert.deepEqual(res.body.strengthTrend28d, { value: 0.2, delta: 20 });
  assert.deepEqual(res.body.volumeTrend28d, { value: 0.25, delta: 500 });
});

test("history overview trends SQL ignores drafts", async () => {
  let firstQuery = "";
  const db = {
    async query(text) {
      if (!firstQuery) {
        firstQuery = text;
        return {
          rows: [
            {
              sessions_completed: "0",
              training_hours_completed: "0",
              last_completed_date: null,
              programs_completed: "0",
              scheduled_last_30: "0",
              completed_last_30: "0",
              scheduled_prev_30: "0",
              completed_prev_30: "0",
              strength_avg_last_28: null,
              strength_avg_prev_28: null,
              volume_avg_last_28: null,
              volume_avg_prev_28: null,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const handler = createHistoryOverviewHandler(db, () => new Date("2026-03-01T12:00:00Z"));
  const req = { auth: { user_id: "user-123" }, headers: {} };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(firstQuery.includes("l.is_draft = FALSE"));
});
