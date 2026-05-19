import test from "node:test";
import assert from "node:assert/strict";
import {
  createProgramDayActionHandlers,
  validateFutureDate,
} from "../programDayActions.js";

const PROGRAM_ID = "11111111-1111-4111-8111-111111111111";
const PROGRAM_DAY_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_USER_ID = "44444444-4444-4444-8444-444444444444";

function mockRes() {
  const res = { statusCode: 200, body: null, sent: false };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  res.send = () => {
    res.sent = true;
    return res;
  };
  return res;
}

function makeReq(overrides = {}) {
  return {
    request_id: "test-request",
    params: {
      programId: PROGRAM_ID,
      programDayId: PROGRAM_DAY_ID,
    },
    body: {},
    auth: { user_id: USER_ID },
    ...overrides,
  };
}

function makeDay(overrides = {}) {
  return {
    id: PROGRAM_DAY_ID,
    program_id: PROGRAM_ID,
    program_week_id: "55555555-5555-4555-8555-555555555555",
    program_day_key: "w1d1",
    week_number: 1,
    scheduled_offset_days: 0,
    scheduled_weekday: "Mon",
    global_day_index: 1,
    is_completed: false,
    is_skipped: false,
    user_id: USER_ID,
    ...overrides,
  };
}

test("validateFutureDate rejects today and malformed dates", () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.throws(() => validateFutureDate(today), /future date/);
  assert.throws(() => validateFutureDate("not-a-date"), /YYYY-MM-DD/);
});

test("skipProgramDay returns 204 and updates skipped fields", async () => {
  const calls = [];
  const handlers = createProgramDayActionHandlers({
    async query(sql, params) {
      calls.push({ sql, params });
      if (/FROM program_day pd/i.test(sql)) {
        return { rowCount: 1, rows: [makeDay()] };
      }
      if (/UPDATE program_day/i.test(sql)) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error("Unexpected query");
    },
  });
  const res = mockRes();

  await handlers.skipProgramDay(makeReq({ body: { reason: "illness" } }), res);

  assert.equal(res.statusCode, 204);
  assert.equal(calls[1].params[0], "illness");
  assert.match(calls[1].sql, /is_skipped = TRUE/);
});

test("skipProgramDay rejects completed days", async () => {
  const handlers = createProgramDayActionHandlers({
    async query() {
      return { rowCount: 1, rows: [makeDay({ is_completed: true })] };
    },
  });
  const res = mockRes();

  await handlers.skipProgramDay(makeReq(), res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "already_completed");
});

test("skipProgramDay returns 403 for another user's program", async () => {
  const handlers = createProgramDayActionHandlers({
    async query() {
      return { rowCount: 1, rows: [makeDay({ user_id: OTHER_USER_ID })] };
    },
  });
  const res = mockRes();

  await handlers.skipProgramDay(makeReq(), res);

  assert.equal(res.statusCode, 403);
});

test("skipProgramDay returns 404 when day does not exist", async () => {
  const handlers = createProgramDayActionHandlers({
    async query() {
      return { rowCount: 0, rows: [] };
    },
  });
  const res = mockRes();

  await handlers.skipProgramDay(makeReq(), res);

  assert.equal(res.statusCode, 404);
});

test("rescheduleProgramDay creates calendar row and skips original day", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/BEGIN|COMMIT/i.test(sql)) return { rowCount: 0, rows: [] };
      if (/INSERT INTO program_calendar_day/i.test(sql)) {
        return {
          rowCount: 1,
          rows: [{ id: "calendar-id", rescheduled_from_day_id: PROGRAM_DAY_ID }],
        };
      }
      if (/UPDATE program_day/i.test(sql)) return { rowCount: 1, rows: [] };
      throw new Error("Unexpected tx query");
    },
    release() {},
  };
  const handlers = createProgramDayActionHandlers({
    async query(sql) {
      if (/FROM program_day pd/i.test(sql)) {
        return { rowCount: 1, rows: [makeDay()] };
      }
      if (/FROM program_calendar_day/i.test(sql)) {
        return { rowCount: 0, rows: [] };
      }
      throw new Error("Unexpected query");
    },
    async connect() {
      return client;
    },
  });
  const res = mockRes();

  await handlers.rescheduleProgramDay(
    makeReq({ body: { targetDate: "2099-12-31" } }),
    res,
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.calendarDay.rescheduled_from_day_id, PROGRAM_DAY_ID);
  assert.ok(calls.some((call) => /INSERT INTO program_calendar_day/i.test(call.sql)));
  assert.ok(calls.some((call) => /UPDATE program_day/i.test(call.sql)));
});

test("rescheduleProgramDay rejects date conflicts", async () => {
  const handlers = createProgramDayActionHandlers({
    async query(sql) {
      if (/FROM program_day pd/i.test(sql)) {
        return { rowCount: 1, rows: [makeDay()] };
      }
      if (/FROM program_calendar_day/i.test(sql)) {
        return { rowCount: 1, rows: [{ id: "calendar-id" }] };
      }
      throw new Error("Unexpected query");
    },
  });
  const res = mockRes();

  await handlers.rescheduleProgramDay(
    makeReq({ body: { targetDate: "2099-12-31" } }),
    res,
  );

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "date_conflict");
});

test("startEquipmentSubstitution rejects empty equipment and wrong owner", async () => {
  const handlers = createProgramDayActionHandlers({
    async query() {
      return { rowCount: 0, rows: [] };
    },
  });

  const emptyRes = mockRes();
  await handlers.startEquipmentSubstitution(
    makeReq({ body: { availableEquipmentCodes: [] } }),
    emptyRes,
  );
  assert.equal(emptyRes.statusCode, 400);

  const ownerRes = mockRes();
  await handlers.startEquipmentSubstitution(
    makeReq({ body: { availableEquipmentCodes: ["barbell"] } }),
    ownerRes,
  );
  assert.equal(ownerRes.statusCode, 403);
});

test("updateProgramSplit cycles valid focuses across unstarted days", async () => {
  const calls = [];
  const handlers = createProgramDayActionHandlers({
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT user_id, preferred_days_sorted_json FROM program/i.test(sql)) {
        return { rowCount: 1, rows: [{ user_id: USER_ID }] };
      }
      if (/FROM program_day/i.test(sql) && /is_completed = FALSE/i.test(sql)) {
        return {
          rowCount: 3,
          rows: [
            { id: "11111111-1111-4111-8111-000000000001" },
            { id: "11111111-1111-4111-8111-000000000002" },
            { id: "11111111-1111-4111-8111-000000000003" },
          ],
        };
      }
      if (/UPDATE program_day pd/i.test(sql)) {
        return { rowCount: 3, rows: [] };
      }
      throw new Error("Unexpected query");
    },
  });
  const res = mockRes();

  await handlers.updateProgramSplit(
    makeReq({ body: { day_focuses: ["upper_body", "lower_body"] } }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.updatedCount, 3);
  const updateCall = calls.find((call) => /UPDATE program_day pd/i.test(call.sql));
  assert.deepEqual(updateCall.params[1], ["upper_body", "lower_body", "upper_body"]);
});

test("updateProgramSplit keeps focuses attached to selected weekdays after midweek starts", async () => {
  const calls = [];
  const handlers = createProgramDayActionHandlers({
    async query(sql, params) {
      calls.push({ sql, params });
      if (/SELECT user_id, preferred_days_sorted_json FROM program/i.test(sql)) {
        return { rowCount: 1, rows: [{ user_id: USER_ID, preferred_days_sorted_json: ["Mon", "Wed", "Thu"] }] };
      }
      if (/FROM program_day/i.test(sql) && /is_completed = FALSE/i.test(sql)) {
        return {
          rowCount: 3,
          rows: [
            { id: "11111111-1111-4111-8111-000000000001", scheduled_weekday: "Wed" },
            { id: "11111111-1111-4111-8111-000000000002", scheduled_weekday: "Thu" },
            { id: "11111111-1111-4111-8111-000000000003", scheduled_weekday: "Mon" },
          ],
        };
      }
      if (/UPDATE program_day pd/i.test(sql)) {
        return { rowCount: 3, rows: [] };
      }
      throw new Error("Unexpected query");
    },
  });
  const res = mockRes();

  await handlers.updateProgramSplit(
    makeReq({ body: { day_focuses: ["lower_body", "upper_body", "full_body"] } }),
    res,
  );

  assert.equal(res.statusCode, 200);
  const updateCall = calls.find((call) => /UPDATE program_day pd/i.test(call.sql));
  assert.deepEqual(updateCall.params[1], ["upper_body", "full_body", "lower_body"]);
});

test("updateProgramSplit rejects invalid focuses and other users' programs", async () => {
  const invalidHandlers = createProgramDayActionHandlers({
    async query() {
      throw new Error("should not query for invalid payload");
    },
  });
  const invalidRes = mockRes();
  await invalidHandlers.updateProgramSplit(
    makeReq({ body: { day_focuses: ["chest_day"] } }),
    invalidRes,
  );
  assert.equal(invalidRes.statusCode, 400);

  const ownerHandlers = createProgramDayActionHandlers({
    async query() {
      return { rowCount: 1, rows: [{ user_id: OTHER_USER_ID }] };
    },
  });
  const ownerRes = mockRes();
  await ownerHandlers.updateProgramSplit(
    makeReq({ body: { day_focuses: ["upper_body"] } }),
    ownerRes,
  );
  assert.equal(ownerRes.statusCode, 403);
});
