import test from "node:test";
import assert from "node:assert/strict";
import { createBonusDayHandler } from "../src/routes/bonusDay.js";

const PROGRAM_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

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

function makeReq(overrides = {}) {
  return {
    params: { programId: PROGRAM_ID },
    auth: { user_id: USER_ID },
    body: {
      programType: "hypertrophy",
      focusType: "upper_body",
      scope: "today",
      targetDate: "2026-05-23",
      weekday: "sat",
    },
    ...overrides,
  };
}

test("bonus day route creates one today-scoped bonus day", async () => {
  let captured;
  const handler = createBonusDayHandler({
    db: {},
    async addBonusDayFn(_db, payload) {
      captured = payload;
      return { programDayId: "33333333-3333-4333-8333-333333333333", daysCreated: 1 };
    },
  });
  const res = mockRes();

  await handler(makeReq(), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    programDayId: "33333333-3333-4333-8333-333333333333",
    daysCreated: 1,
  });
  assert.equal(captured.programId, PROGRAM_ID);
  assert.equal(captured.userId, USER_ID);
  assert.equal(captured.scope, "today");
});

test("bonus day route forwards weekday_recurring scope", async () => {
  let captured;
  const handler = createBonusDayHandler({
    db: {},
    async addBonusDayFn(_db, payload) {
      captured = payload;
      return { programDayId: "33333333-3333-4333-8333-333333333333", daysCreated: 3 };
    },
  });
  const res = mockRes();

  await handler(
    makeReq({
      body: {
        programType: "strength",
        scope: "weekday_recurring",
        targetDate: "2026-05-23",
        weekday: "sat",
      },
    }),
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.daysCreated, 3);
  assert.equal(captured.scope, "weekday_recurring");
  assert.equal(captured.weekday, "sat");
});

test("bonus day route rejects missing auth context", async () => {
  const handler = createBonusDayHandler({ db: {}, async addBonusDayFn() {} });
  const res = mockRes();

  await handler(makeReq({ auth: null }), res);

  assert.equal(res.statusCode, 400);
});

test("bonus day route maps service 403", async () => {
  const handler = createBonusDayHandler({
    db: {},
    async addBonusDayFn() {
      const err = new Error("Program not found");
      err.status = 403;
      throw err;
    },
  });
  const res = mockRes();

  await handler(makeReq(), res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, "Program not found");
});

test("bonus day route maps scheduling conflicts to 409", async () => {
  const handler = createBonusDayHandler({
    db: {},
    async addBonusDayFn() {
      const err = new Error("You already have a workout scheduled for that day");
      err.status = 409;
      throw err;
    },
  });
  const res = mockRes();

  await handler(makeReq(), res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error, "You already have a workout scheduled for that day");
});
