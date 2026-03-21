import test from "node:test";
import assert from "node:assert/strict";
import {
  createReadProgramHandlers,
  parseEquipmentSlugs,
  segmentTypeLabel,
} from "../src/routes/readProgram.js";

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
const USER_UUID = "22222222-2222-4222-8222-222222222222";

test("parseEquipmentSlugs returns empty array for empty rows", () => {
  assert.deepEqual(parseEquipmentSlugs([]), []);
});

test("parseEquipmentSlugs parses comma-separated slugs", () => {
  assert.deepEqual(
    parseEquipmentSlugs([{ equipment_items_slugs_csv: "barbell,dumbbells" }]),
    ["barbell", "dumbbells"],
  );
});

test("parseEquipmentSlugs deduplicates slugs across rows", () => {
  assert.deepEqual(
    parseEquipmentSlugs([
      { equipment_items_slugs_csv: "barbell,dumbbells" },
      { equipment_items_slugs_csv: "barbell,kettlebell" },
    ]),
    ["barbell", "dumbbells", "kettlebell"],
  );
});

test("parseEquipmentSlugs ignores empty csv values", () => {
  assert.deepEqual(parseEquipmentSlugs([{ equipment_items_slugs_csv: "" }]), []);
});

test("segmentTypeLabel maps known segment types to labels", () => {
  assert.equal(segmentTypeLabel("single"), "Single");
  assert.equal(segmentTypeLabel("superset"), "Superset");
  assert.equal(segmentTypeLabel("giant_set"), "Giant Set");
  assert.equal(segmentTypeLabel("amrap"), "AMRAP");
  assert.equal(segmentTypeLabel("emom"), "EMOM");
});

test("segmentTypeLabel returns unknown type as-is", () => {
  assert.equal(segmentTypeLabel("custom_type"), "custom_type");
});

test("programOverview non-UUID program_id returns 400", async () => {
  const handlers = createReadProgramHandlers(mockPool([]));
  const req = {
    request_id: "t",
    params: { program_id: "not-a-uuid" },
    query: { user_id: USER_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.programOverview(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, "validation_error");
});

test("programOverview non-UUID selected_program_day_id returns 400", async () => {
  const handlers = createReadProgramHandlers(mockPool([]));
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    query: { user_id: USER_UUID, selected_program_day_id: "bad-uuid" },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.programOverview(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, "validation_error");
});

test("programOverview program not found returns 404", async () => {
  const handlers = createReadProgramHandlers(mockPool([{ rowCount: 0, rows: [] }]));
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    query: { user_id: USER_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.programOverview(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body?.code, "not_found");
});

test("dayFull non-UUID program_day_id returns 400", async () => {
  const handlers = createReadProgramHandlers(mockPool([]));
  const req = {
    request_id: "t",
    params: { program_day_id: "bad" },
    query: { user_id: USER_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.dayFull(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, "validation_error");
});

test("dayFull day not found returns 404", async () => {
  const handlers = createReadProgramHandlers(mockPool([{ rowCount: 0, rows: [] }]));
  const req = {
    request_id: "t",
    params: { program_day_id: VALID_UUID },
    query: { user_id: USER_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.dayFull(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body?.code, "not_found");
});

test("dayComplete non-UUID program_day_id returns 400", async () => {
  const handlers = createReadProgramHandlers(mockPool([]));
  const req = {
    request_id: "t",
    params: { program_day_id: "bad" },
    query: {},
    body: { user_id: USER_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.dayComplete(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, "validation_error");
});

test("dayComplete day not found or access denied returns 404", async () => {
  const handlers = createReadProgramHandlers(mockPool([{ rowCount: 0, rows: [] }]));
  const req = {
    request_id: "t",
    params: { program_day_id: VALID_UUID },
    query: {},
    body: { user_id: USER_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.dayComplete(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body?.code, "not_found");
});
