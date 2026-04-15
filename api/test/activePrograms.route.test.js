import test from "node:test";
import assert from "node:assert/strict";
import { createActiveProgramsHandlers, isValidDate } from "../src/routes/activePrograms.js";

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

test("isValidDate accepts ISO dates and rejects garbage", () => {
  assert.equal(isValidDate("2026-05-01"), true);
  assert.equal(isValidDate("2026-5-1"), false);
  assert.equal(isValidDate("not-a-date"), false);
});

test("getActivePrograms returns empty payload when user has no active programs", async () => {
  const db = {
    async query(_sql, _params) {
      return { rows: [] };
    },
  };
  const handlers = createActiveProgramsHandlers(db);
  const req = { auth: { user_id: "user-1" }, log: { error() {} } };
  const res = mockRes();

  await handlers.getActivePrograms(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    primary_program_id: null,
    programs: [],
    today_sessions: [],
  });
});

test("getActivePrograms maps programs and today sessions with primary first", async () => {
  let call = 0;
  const db = {
    async query() {
      call += 1;
      if (call === 1) {
        return {
          rows: [
            {
              program_id: "program-a",
              program_title: "Strength",
              program_type: "strength",
              is_primary: true,
              status: "active",
              weeks_count: "8",
              days_per_week: "3",
              start_date: "2026-05-01",
              hero_media_id: null,
              today_session_count: "1",
              next_session_date: "2026-05-02",
            },
            {
              program_id: "program-b",
              program_title: "Conditioning",
              program_type: "conditioning",
              is_primary: false,
              status: "active",
              weeks_count: "6",
              days_per_week: "2",
              start_date: "2026-05-03",
              hero_media_id: "hero-1",
              today_session_count: "0",
              next_session_date: null,
            },
          ],
        };
      }
      return {
        rows: [{
          program_id: "program-a",
          program_day_id: "day-1",
          program_title: "Strength",
          program_type: "strength",
          day_label: "Day 1",
          scheduled_date: "2026-05-01",
        }],
      };
    },
  };
  const handlers = createActiveProgramsHandlers(db);
  const req = { auth: { user_id: "user-1" }, log: { error() {} } };
  const res = mockRes();

  await handlers.getActivePrograms(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.primary_program_id, "program-a");
  assert.equal(res.body.programs.length, 2);
  assert.equal(res.body.programs[0].is_primary, true);
  assert.equal(res.body.today_sessions[0].program_day_id, "day-1");
});

test("getCombinedCalendar validates date range and groups sessions", async () => {
  const handlers = createActiveProgramsHandlers({
    async query() {
      return {
        rows: [
          {
            scheduled_date: "2026-05-01",
            program_id: "program-a",
            program_day_id: "day-1",
            program_type: "strength",
            program_title: "Strength",
            is_primary_program: true,
            day_label: "Day 1",
            is_completed: false,
          },
          {
            scheduled_date: "2026-05-01",
            program_id: "program-b",
            program_day_id: "day-2",
            program_type: "conditioning",
            program_title: "Conditioning",
            is_primary_program: false,
            day_label: "Intervals",
            is_completed: true,
          },
        ],
      };
    },
  });

  const badReq = { auth: { user_id: "user-1" }, query: { from: "nope" }, log: { error() {} } };
  const badRes = mockRes();
  await handlers.getCombinedCalendar(badReq, badRes);
  assert.equal(badRes.statusCode, 400);

  const req = {
    auth: { user_id: "user-1" },
    query: { from: "2026-05-01", to: "2026-05-07" },
    log: { error() {} },
  };
  const res = mockRes();
  await handlers.getCombinedCalendar(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.days.length, 1);
  assert.equal(res.body.days[0].sessions.length, 2);
});

test("getSessionsByDate validates input and returns sessions", async () => {
  const handlers = createActiveProgramsHandlers({
    async query() {
      return {
        rows: [{
          program_id: "program-a",
          program_day_id: "day-1",
          program_title: "Strength",
          program_type: "strength",
          is_primary_program: true,
          day_label: "Day 1",
          session_duration_mins: "60",
          is_completed: false,
        }],
      };
    },
  });

  const badRes = mockRes();
  await handlers.getSessionsByDate(
    { auth: { user_id: "user-1" }, params: { scheduled_date: "bad" }, log: { error() {} } },
    badRes,
  );
  assert.equal(badRes.statusCode, 400);

  const res = mockRes();
  await handlers.getSessionsByDate(
    { auth: { user_id: "user-1" }, params: { scheduled_date: "2026-05-01" }, log: { error() {} } },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sessions[0].session_duration_mins, 60);
});

test("setPrimaryProgram demotes old primary and promotes target", async () => {
  const calls = [];
  const db = {
    async connect() {
      return {
        async query(sql, params) {
          calls.push({ sql, params });
          if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
          if (sql.includes("SELECT id") && sql.includes("FROM program")) {
            return { rows: [{ id: "11111111-1111-1111-1111-111111111111" }], rowCount: 1 };
          }
          return { rows: [], rowCount: 1 };
        },
        release() {},
      };
    },
  };
  const handlers = createActiveProgramsHandlers(db);
  const req = {
    auth: { user_id: "user-1" },
    params: { program_id: "11111111-1111-1111-1111-111111111111" },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.setPrimaryProgram(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.primary_program_id, "11111111-1111-1111-1111-111111111111");
  assert.equal(calls.some((call) => call.sql.includes("SET is_primary = FALSE")), true);
  assert.equal(calls.some((call) => call.sql.includes("SET is_primary = TRUE")), true);
});
