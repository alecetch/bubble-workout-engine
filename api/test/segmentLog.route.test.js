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
