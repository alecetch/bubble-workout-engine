import test from "node:test";
import assert from "node:assert/strict";
import { createWorkoutRemindersHandler } from "../src/routes/workoutReminders.js";

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test("workout reminders route returns aggregate counts and stamps reminder date", async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("FROM program_calendar_day")) {
        return {
          rows: [{
            user_id: "11111111-1111-4111-8111-111111111111",
            day_label: "Day 1",
            program_day_id: "22222222-2222-4222-8222-222222222222",
          }],
        };
      }
      if (sql.includes("INSERT INTO notification_preference")) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const notificationService = {
    async send(args) {
      calls.push({ send: args });
    },
  };
  const handler = createWorkoutRemindersHandler(db, notificationService);
  const req = {
    request_id: "t",
    log: { warn() {}, error() {} },
  };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, eligible: 1, sent: 1, failed: 0 });
  assert.equal(calls.some((entry) => entry.send?.userId === "11111111-1111-4111-8111-111111111111"), true);
  assert.equal(calls.some((entry) => entry.sql?.includes("INSERT INTO notification_preference")), true);
});
