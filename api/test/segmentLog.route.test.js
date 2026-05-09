import test from "node:test";
import assert from "node:assert/strict";
import { compute1rmKg, createSegmentLogHandlers } from "../src/routes/segmentLog.js";

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

function mockPool(responses) {
  let i = 0;
  return {
    async connect() {
      return {
        async query(_sql, _params) {
          const response = responses[i++];
          if (!response) throw new Error(`Unexpected DB call at index ${i - 1}`);
          if (response instanceof Error) throw response;
          return response;
        },
        release() {},
      };
    },
  };
}

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

test("compute1rmKg returns null for weight=0", () => {
  assert.equal(compute1rmKg(0, 5, null), null);
});

test("compute1rmKg returns null for reps=0", () => {
  assert.equal(compute1rmKg(100, 0, null), null);
});

test("compute1rmKg returns null for non-finite inputs", () => {
  assert.equal(compute1rmKg(Number.NaN, 5, null), null);
  assert.equal(compute1rmKg(100, Number.POSITIVE_INFINITY, null), null);
});

test("compute1rmKg uses Epley formula for upper/unknown region", () => {
  const expected = Number((100 * (1 + 10 / 30)).toFixed(2));
  assert.equal(compute1rmKg(100, 10, null), expected);
});

test("compute1rmKg uses Epley for lower region when reps >= 37", () => {
  const expected = Number((100 * (1 + 37 / 30)).toFixed(2));
  assert.equal(compute1rmKg(100, 37, "lower"), expected);
});

test("compute1rmKg uses Brzycki formula for lower region when reps < 37", () => {
  const expected = Number(((100 * 36) / (37 - 5)).toFixed(2));
  assert.equal(compute1rmKg(100, 5, "lower"), expected);
});

test("compute1rmKg returns consistent precision (2 decimal places)", () => {
  const result = compute1rmKg(80, 8, null);
  const decimals = String(result).split(".")[1] ?? "";
  assert.equal(decimals.length <= 2, true);
});

test("postSegmentLog missing program_id returns 400", async () => {
  const handlers = createSegmentLogHandlers(mockPool([]));
  const req = {
    request_id: "t",
    body: {
      program_day_id: VALID_UUID,
      workout_segment_id: VALID_UUID,
      rows: [{ program_exercise_id: VALID_UUID }],
    },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.postSegmentLog(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, "validation_error");
});

test("postSegmentLog missing workout_segment_id returns 400", async () => {
  const handlers = createSegmentLogHandlers(mockPool([]));
  const req = {
    request_id: "t",
    body: {
      program_id: VALID_UUID,
      program_day_id: VALID_UUID,
      rows: [{ program_exercise_id: VALID_UUID }],
    },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.postSegmentLog(req, res);

  assert.equal(res.statusCode, 400);
});

test("postSegmentLog missing program_day_id returns 400", async () => {
  const handlers = createSegmentLogHandlers(mockPool([]));
  const req = {
    request_id: "t",
    body: {
      program_id: VALID_UUID,
      workout_segment_id: VALID_UUID,
      rows: [{ program_exercise_id: VALID_UUID }],
    },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.postSegmentLog(req, res);

  assert.equal(res.statusCode, 400);
});

test("postSegmentLog empty rows array returns 400", async () => {
  const handlers = createSegmentLogHandlers(mockPool([]));
  const req = {
    request_id: "t",
    body: {
      program_id: VALID_UUID,
      program_day_id: VALID_UUID,
      workout_segment_id: VALID_UUID,
      rows: [],
    },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.postSegmentLog(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body?.error ?? "", /rows/i);
});

test("postSegmentLog non-UUID program_exercise_id in rows returns 400", async () => {
  const handlers = createSegmentLogHandlers(mockPool([]));
  const req = {
    request_id: "t",
    body: {
      program_id: VALID_UUID,
      program_day_id: VALID_UUID,
      workout_segment_id: VALID_UUID,
      rows: [{ program_exercise_id: "bad" }],
    },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.postSegmentLog(req, res);

  assert.equal(res.statusCode, 400);
});

test("postSegmentLog invalid rir_actual returns 400", async () => {
  const handlers = createSegmentLogHandlers(mockPool([]));
  const req = {
    request_id: "t",
    body: {
      program_id: VALID_UUID,
      program_day_id: VALID_UUID,
      workout_segment_id: VALID_UUID,
      rows: [{ program_exercise_id: VALID_UUID, rir_actual: 5 }],
    },
    auth: { user_id: VALID_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.postSegmentLog(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body?.error ?? "", /rir_actual/i);
});

test("postSegmentLog accepts rir_actual of 0", async () => {
  const queries = [];
  const handlers = createSegmentLogHandlers({
    async connect() {
      return {
        async query(sql, params) {
          queries.push({ sql, params });
          if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
          if (sql.includes("SELECT pe.id AS program_exercise_id")) {
            return { rows: [{ program_exercise_id: VALID_UUID, strength_primary_region: "upper" }], rowCount: 1 };
          }
          if (sql.includes("INSERT INTO segment_exercise_log")) {
            return { rows: [], rowCount: 1 };
          }
          if (sql.includes("WITH new_rows AS")) {
            return { rows: [], rowCount: 0 };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
        release() {},
      };
    },
  });
  const req = {
    request_id: "t",
    body: {
      program_id: VALID_UUID,
      program_day_id: VALID_UUID,
      workout_segment_id: VALID_UUID,
      rows: [{ program_exercise_id: VALID_UUID, order_index: 1, weight_kg: 100, reps_completed: 5, rir_actual: 0 }],
    },
    auth: { user_id: VALID_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.postSegmentLog(req, res);

  assert.equal(res.statusCode, 200);
  const insertCall = queries.find((call) => call.sql.includes("INSERT INTO segment_exercise_log"));
  assert.equal(insertCall.params[8], 0);
});

test("postSegmentLog accepts rir_actual of 3", async () => {
  const queries = [];
  const handlers = createSegmentLogHandlers({
    async connect() {
      return {
        async query(sql, params) {
          queries.push({ sql, params });
          if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
          if (sql.includes("SELECT pe.id AS program_exercise_id")) {
            return { rows: [{ program_exercise_id: VALID_UUID, strength_primary_region: "upper" }], rowCount: 1 };
          }
          if (sql.includes("INSERT INTO segment_exercise_log")) {
            return { rows: [], rowCount: 1 };
          }
          if (sql.includes("WITH new_rows AS")) {
            return { rows: [], rowCount: 0 };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
        release() {},
      };
    },
  });
  const req = {
    request_id: "t",
    body: {
      program_id: VALID_UUID,
      program_day_id: VALID_UUID,
      workout_segment_id: VALID_UUID,
      rows: [{ program_exercise_id: VALID_UUID, order_index: 1, weight_kg: 100, reps_completed: 5, rir_actual: 3 }],
    },
    auth: { user_id: VALID_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.postSegmentLog(req, res);

  assert.equal(res.statusCode, 200);
  const insertCall = queries.find((call) => call.sql.includes("INSERT INTO segment_exercise_log"));
  assert.equal(insertCall.params[8], 3);
});

test("postSegmentLog missing user identity returns 400", async () => {
  const handlers = createSegmentLogHandlers(mockPool([]));
  const req = {
    request_id: "t",
    body: {
      program_id: VALID_UUID,
      program_day_id: VALID_UUID,
      workout_segment_id: VALID_UUID,
      rows: [{ program_exercise_id: VALID_UUID }],
    },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.postSegmentLog(req, res);

  assert.equal(res.statusCode, 400);
});

test("getSegmentLog missing workout_segment_id returns 400", async () => {
  const handlers = createSegmentLogHandlers(mockPool([]));
  const req = {
    request_id: "t",
    query: { program_day_id: VALID_UUID, user_id: VALID_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.getSegmentLog(req, res);

  assert.equal(res.statusCode, 400);
});

test("getSegmentLog missing program_day_id returns 400", async () => {
  const handlers = createSegmentLogHandlers(mockPool([]));
  const req = {
    request_id: "t",
    query: { workout_segment_id: VALID_UUID, user_id: VALID_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.getSegmentLog(req, res);

  assert.equal(res.statusCode, 400);
});

test("getSegmentLog non-UUID workout_segment_id returns 400", async () => {
  const handlers = createSegmentLogHandlers(mockPool([]));
  const req = {
    request_id: "t",
    query: { workout_segment_id: "bad", program_day_id: VALID_UUID, user_id: VALID_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.getSegmentLog(req, res);

  assert.equal(res.statusCode, 400);
});

test("postSegmentLog persists rir_actual when provided", async () => {
  const queries = [];
  const handlers = createSegmentLogHandlers({
    async connect() {
      return {
        async query(sql, params) {
          queries.push({ sql, params });
          if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
          if (sql.includes("SELECT pe.id AS program_exercise_id")) {
            return { rows: [{ program_exercise_id: VALID_UUID, strength_primary_region: "upper" }], rowCount: 1 };
          }
          if (sql.includes("INSERT INTO segment_exercise_log")) {
            return { rows: [], rowCount: 1 };
          }
          if (sql.includes("WITH new_rows AS")) {
            return { rows: [], rowCount: 0 };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
        release() {},
      };
    },
  });
  const req = {
    request_id: "t",
    body: {
      program_id: VALID_UUID,
      program_day_id: VALID_UUID,
      workout_segment_id: VALID_UUID,
      rows: [{ program_exercise_id: VALID_UUID, order_index: 1, weight_kg: 100, reps_completed: 5, rir_actual: 2 }],
    },
    auth: { user_id: VALID_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.postSegmentLog(req, res);

  assert.equal(res.statusCode, 200);
  const insertCall = queries.find((call) => call.sql.includes("INSERT INTO segment_exercise_log"));
  assert.equal(insertCall.params[8], 2);
});

test("postSegmentLog stores null rir_actual when omitted", async () => {
  const queries = [];
  const handlers = createSegmentLogHandlers({
    async connect() {
      return {
        async query(sql, params) {
          queries.push({ sql, params });
          if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
          if (sql.includes("SELECT pe.id AS program_exercise_id")) {
            return { rows: [{ program_exercise_id: VALID_UUID, strength_primary_region: "upper" }], rowCount: 1 };
          }
          if (sql.includes("INSERT INTO segment_exercise_log")) {
            return { rows: [], rowCount: 1 };
          }
          if (sql.includes("WITH new_rows AS")) {
            return { rows: [], rowCount: 0 };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
        release() {},
      };
    },
  });
  const req = {
    request_id: "t",
    body: {
      program_id: VALID_UUID,
      program_day_id: VALID_UUID,
      workout_segment_id: VALID_UUID,
      rows: [{ program_exercise_id: VALID_UUID, order_index: 1, weight_kg: 100, reps_completed: 5 }],
    },
    auth: { user_id: VALID_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.postSegmentLog(req, res);

  assert.equal(res.statusCode, 200);
  const insertCall = queries.find((call) => call.sql.includes("INSERT INTO segment_exercise_log"));
  assert.equal(insertCall.params[8], null);
});

test("postSegmentLog stores null weight for non-positive loads", async () => {
  const queries = [];
  const handlers = createSegmentLogHandlers({
    async connect() {
      return {
        async query(sql, params) {
          queries.push({ sql, params });
          if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
          if (sql.includes("SELECT pe.id AS program_exercise_id")) {
            return { rows: [{ program_exercise_id: VALID_UUID, strength_primary_region: "upper" }], rowCount: 1 };
          }
          if (sql.includes("INSERT INTO segment_exercise_log")) {
            return { rows: [], rowCount: 1 };
          }
          if (sql.includes("WITH new_rows AS")) {
            return { rows: [], rowCount: 0 };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
        release() {},
      };
    },
  });
  const req = {
    request_id: "t",
    body: {
      program_id: VALID_UUID,
      program_day_id: VALID_UUID,
      workout_segment_id: VALID_UUID,
      rows: [{ program_exercise_id: VALID_UUID, order_index: 1, weight_kg: 0, reps_completed: 10 }],
    },
    auth: { user_id: VALID_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.postSegmentLog(req, res);

  assert.equal(res.statusCode, 200);
  const insertCall = queries.find((call) => call.sql.includes("INSERT INTO segment_exercise_log"));
  assert.equal(insertCall.params[6], null);
  assert.equal(insertCall.params[7], 10);
  assert.equal(insertCall.params[9], null);
});
