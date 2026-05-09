import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createProgramExerciseHandlers, programExerciseRouter } from "../src/routes/programExercise.js";

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

function mockPool(responses, calls = []) {
  let i = 0;
  return {
    async connect() {
      return {
        async query(sql, params) {
          calls.push({ sql, params });
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

test("swapOptions returns candidates and excludes current or already-used exercises", async () => {
  const handlers = createProgramExerciseHandlers({
    db: mockPool([
      {
        rows: [{
          program_exercise_id: VALID_UUID,
          program_day_id: VALID_UUID,
          program_id: VALID_UUID,
          exercise_id: "bb_back_squat",
          exercise_name: "Back Squat",
          original_exercise_id: null,
          purpose: "main_lift",
          order_in_day: 1,
          global_day_index: 1,
        }],
        rowCount: 1,
      },
      {
        rows: [{
          exercise_id: "bb_back_squat",
          name: "Back Squat",
          swap_group_id_1: "squat_pattern",
          swap_group_id_2: "squat_compound",
          movement_pattern_primary: "squat",
          movement_class: "compound",
        }],
        rowCount: 1,
      },
      {
        rows: [
          { exercise_id: "bb_back_squat" },
          { exercise_id: "leg_press" },
        ],
        rowCount: 2,
      },
      { rows: [{ column_name: "injury_flags" }], rowCount: 1 },
      {
        rows: [{
          fitness_rank: 1,
          injury_flags_slugs: [],
          equipment_items_slugs: ["barbell", "machine"],
        }],
        rowCount: 1,
      },
      {
        rows: [
          { exercise_id: "safety_bar_squat", name: "Safety Bar Squat", is_loadable: true, movement_pattern_primary: "squat", load_guidance: "Work up gradually.", match_type: "same_compound_group" },
          { exercise_id: "hack_squat", name: "Hack Squat", is_loadable: true, movement_pattern_primary: "squat", load_guidance: "", match_type: "same_compound_group" },
          { exercise_id: "front_squat", name: "Front Squat", is_loadable: true, movement_pattern_primary: "squat", load_guidance: "", match_type: "same_movement_pattern" },
          { exercise_id: "front_squat_v2", name: "Front Squat", is_loadable: true, movement_pattern_primary: "squat", load_guidance: "", match_type: "same_movement_pattern" },
        ],
        rowCount: 4,
      },
    ]),
    getAllowed: async () => ["safety_bar_squat", "hack_squat", "front_squat", "leg_press"],
  });
  const req = {
    request_id: "t",
    params: { program_exercise_id: VALID_UUID },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.swapOptions(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.current_exercise_id, "bb_back_squat");
  assert.equal(res.body?.options.length, 3);
  assert.deepEqual(res.body.options.map((o) => o.exercise_id), ["safety_bar_squat", "hack_squat", "front_squat"]);
  assert.ok(res.body.options.every((o) => o.exercise_id !== "bb_back_squat"));
  assert.ok(res.body.options.every((o) => o.exercise_id !== "leg_press"));
  assert.ok(res.body.options.every((o) => typeof o.rationale === "string" && o.rationale.length > 0));
});

test("swapOptions returns empty array when no candidates exist", async () => {
  const handlers = createProgramExerciseHandlers({
    db: mockPool([
      {
        rows: [{
          program_exercise_id: VALID_UUID,
          program_day_id: VALID_UUID,
          program_id: VALID_UUID,
          exercise_id: "bb_back_squat",
          purpose: "main_lift",
          order_in_day: 1,
          global_day_index: 1,
        }],
        rowCount: 1,
      },
      {
        rows: [{
          exercise_id: "bb_back_squat",
          name: "Back Squat",
          swap_group_id_1: "squat_pattern",
          swap_group_id_2: "squat_compound",
          movement_pattern_primary: "squat",
          movement_class: "compound",
        }],
        rowCount: 1,
      },
      { rows: [{ exercise_id: "bb_back_squat" }], rowCount: 1 },
      { rows: [{ column_name: "injury_flags" }], rowCount: 1 },
      { rows: [{ fitness_rank: 1, injury_flags_slugs: [], equipment_items_slugs: [] }], rowCount: 1 },
    ]),
    getAllowed: async () => [],
  });
  const req = {
    request_id: "t",
    params: { program_exercise_id: VALID_UUID },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.swapOptions(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    ok: true,
    current_exercise_id: "bb_back_squat",
    options: [],
  });
});

test("swapOptions returns 404 for unknown id", async () => {
  const handlers = createProgramExerciseHandlers({
    db: mockPool([
      { rows: [], rowCount: 0 },
    ]),
  });
  const req = {
    request_id: "t",
    params: { program_exercise_id: VALID_UUID },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.swapOptions(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body?.code, "not_found");
});

test("applySwap updates exercise and clears progression fields", async () => {
  const calls = [];
  const handlers = createProgramExerciseHandlers({
    db: mockPool([
      {
        rows: [{
          program_exercise_id: VALID_UUID,
          program_day_id: VALID_UUID,
          program_id: VALID_UUID,
          exercise_id: "bb_back_squat",
          exercise_name: "Back Squat",
          original_exercise_id: null,
          purpose: "main_lift",
          order_in_day: 1,
          global_day_index: 1,
        }],
        rowCount: 1,
      },
      { rows: [{ column_name: "injury_flags" }], rowCount: 1 },
      { rows: [{ fitness_rank: 1, injury_flags_slugs: [], equipment_items_slugs: ["barbell", "machine"] }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      {
        rows: [{
          exercise_id: "safety_bar_squat",
          name: "Safety Bar Squat",
          is_loadable: true,
          equipment_items_slugs: ["barbell"],
          coaching_cues_json: ["Brace"],
          load_guidance: "Add load slowly.",
          logging_guidance: "Log top set.",
        }],
        rowCount: 1,
      },
      {
        rows: [
          { id: VALID_UUID, original_exercise_id: "bb_back_squat" },
          { id: "33333333-3333-4333-8333-333333333333", original_exercise_id: "bb_back_squat" },
        ],
        rowCount: 2,
      },
    ], calls),
    getAllowed: async () => ["safety_bar_squat"],
  });
  const req = {
    request_id: "t",
    params: { program_exercise_id: VALID_UUID },
    body: { exercise_id: "safety_bar_squat", reason: "equipment not available" },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.applySwap(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.exercise_id, "safety_bar_squat");
  assert.equal(res.body?.original_exercise_id, "bb_back_squat");
  const updateCall = calls.find((call) => call.sql.includes("UPDATE program_exercise"));
  assert.match(updateCall.sql, /recommended_load_kg = NULL/);
  assert.match(updateCall.sql, /progression_outcome = NULL/);
  assert.match(updateCall.sql, /global_day_index >=/);
  assert.match(updateCall.sql, /order_in_day =/);
  assert.equal(updateCall.params[9], VALID_UUID);
  assert.equal(updateCall.params[10], "main_lift");
  assert.equal(updateCall.params[11], 1);
  assert.equal(updateCall.params[12], "bb_back_squat");
  assert.equal(updateCall.params[14], 1);
});

test("applySwap preserves original_exercise_id on second swap", async () => {
  const handlers = createProgramExerciseHandlers({
    db: mockPool([
      {
        rows: [{
          program_exercise_id: VALID_UUID,
          program_day_id: VALID_UUID,
          program_id: VALID_UUID,
          exercise_id: "front_squat",
          exercise_name: "Front Squat",
          original_exercise_id: "bb_back_squat",
          purpose: "main_lift",
          order_in_day: 1,
          global_day_index: 8,
        }],
        rowCount: 1,
      },
      { rows: [{ column_name: "injury_flags" }], rowCount: 1 },
      { rows: [{ fitness_rank: 1, injury_flags_slugs: [], equipment_items_slugs: ["barbell", "machine"] }], rowCount: 1 },
      { rows: [], rowCount: 0 },
      {
        rows: [{
          exercise_id: "hack_squat",
          name: "Hack Squat",
          is_loadable: true,
          equipment_items_slugs: ["machine"],
          coaching_cues_json: [],
          load_guidance: "",
          logging_guidance: "",
        }],
        rowCount: 1,
      },
      { rows: [{ id: VALID_UUID, original_exercise_id: "bb_back_squat" }], rowCount: 1 },
    ]),
    getAllowed: async () => ["hack_squat"],
  });
  const req = {
    request_id: "t",
    params: { program_exercise_id: VALID_UUID },
    body: { exercise_id: "hack_squat" },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.applySwap(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.original_exercise_id, "bb_back_squat");
});

test("applySwap rejects exercise not in allowed set", async () => {
  const handlers = createProgramExerciseHandlers({
    db: mockPool([
      {
        rows: [{
          program_exercise_id: VALID_UUID,
          program_day_id: VALID_UUID,
          program_id: VALID_UUID,
          exercise_id: "bb_back_squat",
          exercise_name: "Back Squat",
          original_exercise_id: null,
          purpose: "main_lift",
          order_in_day: 1,
          global_day_index: 1,
        }],
        rowCount: 1,
      },
      { rows: [{ column_name: "injury_flags" }], rowCount: 1 },
      { rows: [{ fitness_rank: 1, injury_flags_slugs: [], equipment_items_slugs: ["barbell"] }], rowCount: 1 },
    ]),
    getAllowed: async () => [],
  });
  const req = {
    request_id: "t",
    params: { program_exercise_id: VALID_UUID },
    body: { exercise_id: "archived_exercise" },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.applySwap(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, "validation_error");
});

test("applySwap returns 404 for unknown id", async () => {
  const handlers = createProgramExerciseHandlers({
    db: mockPool([
      { rows: [], rowCount: 0 },
    ]),
  });
  const req = {
    request_id: "t",
    params: { program_exercise_id: VALID_UUID },
    body: { exercise_id: "hack_squat" },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.applySwap(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body?.code, "not_found");
});

test("programExerciseRouter requires auth", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", programExerciseRouter);
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/program-exercise/${VALID_UUID}/swap-options`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body?.code, "unauthorized");
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
