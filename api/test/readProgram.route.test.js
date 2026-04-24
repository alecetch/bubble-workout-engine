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
  function nextResponse() {
    const response = responses[i++];
    if (!response) throw new Error(`Unexpected DB call at index ${i - 1}`);
    if (response instanceof Error) throw response;
    return response;
  }
  return {
    async query(_sql, _params) {
      return nextResponse();
    },
    async connect() {
      return {
        async query(_sql, _params) {
          return nextResponse();
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
    auth: { user_id: USER_UUID },
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
    auth: { user_id: USER_UUID },
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
    auth: { user_id: USER_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.programOverview(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body?.code, "not_found");
});

test("programOverview defaults selected day to the earliest incomplete day", async () => {
  const handlers = createReadProgramHandlers(mockPool([
    {
      rowCount: 1,
      rows: [{
        program_id: VALID_UUID,
        title: "Program",
        summary: "Summary",
        hero_image_key: null,
        hero_image_url: null,
      }],
    },
    { rowCount: 1, rows: [{ week_number: 1, focus: "Base", notes: null }] },
    {
      rowCount: 2,
      rows: [
        {
          id: "cal-1",
          program_day_id: "33333333-3333-4333-8333-333333333333",
          scheduled_date: "2026-04-01",
          week_number: 1,
          is_training_day: true,
          is_completed: true,
        },
        {
          id: "cal-2",
          program_day_id: "44444444-4444-4444-8444-444444444444",
          scheduled_date: "2026-04-03",
          week_number: 1,
          is_training_day: true,
          is_completed: false,
        },
      ],
    },
    { rowCount: 1, rows: [{ program_day_id: "44444444-4444-4444-8444-444444444444" }] },
    {
      rowCount: 1,
      rows: [{
        program_day_id: "44444444-4444-4444-8444-444444444444",
        program_id: VALID_UUID,
        day_label: "Week 1 Day 2",
        day_type: "strength",
        session_duration_mins: 50,
      }],
    },
    { rowCount: 0, rows: [] },
  ]));
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    query: { user_id: USER_UUID },
    auth: { user_id: USER_UUID },
    log: { error() {}, warn() {} },
  };
  const res = mockRes();

  await handlers.programOverview(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.selected_day?.program_day_id, "44444444-4444-4444-8444-444444444444");
});

test("dayFull non-UUID program_day_id returns 400", async () => {
  const handlers = createReadProgramHandlers(mockPool([]));
  const req = {
    request_id: "t",
    params: { program_day_id: "bad" },
    query: { user_id: USER_UUID },
    auth: { user_id: USER_UUID },
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
    auth: { user_id: USER_UUID },
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
    auth: { user_id: USER_UUID },
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
    auth: { user_id: USER_UUID },
    log: { error() {} },
  };
  const res = mockRes();

  await handlers.dayComplete(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body?.code, "not_found");
});

test("dayComplete returns 200 while Layer B progression runs non-blocking", async () => {
  const calls = [];
  const progressionDecisionService = {
    async applyProgressionRecommendations(args) {
      calls.push(args);
      return { decisions: [] };
    },
  };
  const handlers = createReadProgramHandlers({
    db: mockPool([
      { rowCount: 1, rows: [{ id: VALID_UUID }] },
      { rowCount: 1, rows: [{ program_id: VALID_UUID, program_type: "strength", fitness_rank: 2 }] },
    ]),
    progressionDecisionService,
  });
  const req = {
    request_id: "t",
    params: { program_day_id: VALID_UUID },
    query: {},
    body: {},
    auth: { user_id: USER_UUID },
    log: { error() {}, warn() {} },
  };
  const res = mockRes();

  await handlers.dayComplete(req, res);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    programId: VALID_UUID,
    userId: USER_UUID,
    programType: "strength",
    fitnessRank: 2,
    completedProgramDayId: VALID_UUID,
  });
});

test("dayFull attaches guideline loads when service returns them", async () => {
  const guidelineLoadService = {
    async annotateExercisesWithGuidelineLoads({ exercises }) {
      return exercises.map((exercise) => ({
        ...exercise,
        guideline_load: {
          value: 40,
          unit: "kg",
          confidence: "medium",
        },
      }));
    },
  };

  const handlers = createReadProgramHandlers({
    db: mockPool([
      {
        rowCount: 1,
        rows: [{
          program_day_id: VALID_UUID,
          day_label: "Day 1",
          day_type: "strength",
          session_duration_mins: 50,
          hero_image_key: null,
          hero_image_url: null,
          client_profile_id: VALID_UUID,
        }],
      },
      {
        rowCount: 1,
        rows: [{
          workout_segment_id: VALID_UUID,
          block_order: 1,
          segment_order_in_block: 1,
          segment_type: "single",
          segment_title: "Main lift",
        }],
      },
      {
        rowCount: 1,
        rows: [{
          workout_segment_id: VALID_UUID,
          exercise_id: "bb_back_squat",
          exercise_name: "Back Squat",
          order_in_day: 1,
          is_loadable: true,
          progression_outcome: null,
        }],
      },
      { rowCount: 0, rows: [] },
    ]),
    guidelineLoadService,
  });
  const req = {
    request_id: "t",
    params: { program_day_id: VALID_UUID },
    auth: { user_id: USER_UUID },
    log: { error() {}, warn() {} },
  };
  const res = mockRes();

  await handlers.dayFull(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.segments?.[0]?.items?.[0]?.guideline_load?.value, 40);
});

test("dayFull keeps returning 200 when guideline service throws", async () => {
  const handlers = createReadProgramHandlers({
    db: mockPool([
      {
        rowCount: 1,
        rows: [{
          program_day_id: VALID_UUID,
          day_label: "Day 1",
          day_type: "strength",
          session_duration_mins: 50,
          hero_image_key: null,
          hero_image_url: null,
          client_profile_id: VALID_UUID,
        }],
      },
      {
        rowCount: 1,
        rows: [{
          workout_segment_id: VALID_UUID,
          block_order: 1,
          segment_order_in_block: 1,
          segment_type: "single",
          segment_title: "Main lift",
        }],
      },
      {
        rowCount: 1,
        rows: [{
          workout_segment_id: VALID_UUID,
          exercise_id: "bb_back_squat",
          exercise_name: "Back Squat",
          order_in_day: 1,
          is_loadable: true,
          progression_outcome: null,
        }],
      },
      { rowCount: 0, rows: [] },
    ]),
    guidelineLoadService: {
      async annotateExercisesWithGuidelineLoads() {
        throw new Error("boom");
      },
    },
  });
  const req = {
    request_id: "t",
    params: { program_day_id: VALID_UUID },
    auth: { user_id: USER_UUID },
    log: { error() {}, warn() {} },
  };
  const res = mockRes();

  await handlers.dayFull(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.segments?.[0]?.items?.[0]?.guideline_load ?? null, null);
});

test("dayFull exposes progression recommendations when present on program exercises", async () => {
  const handlers = createReadProgramHandlers({
    db: mockPool([
      {
        rowCount: 1,
        rows: [{
          program_day_id: VALID_UUID,
          day_label: "Day 1",
          day_type: "strength",
          session_duration_mins: 50,
          hero_image_key: null,
          hero_image_url: null,
          client_profile_id: VALID_UUID,
        }],
      },
      {
        rowCount: 1,
        rows: [{
          workout_segment_id: VALID_UUID,
          block_order: 1,
          segment_order_in_block: 1,
          segment_type: "single",
          segment_title: "Main lift",
        }],
      },
      {
        rowCount: 1,
        rows: [{
          workout_segment_id: VALID_UUID,
          exercise_id: "bb_back_squat",
          exercise_name: "Back Squat",
          order_in_day: 1,
          is_loadable: true,
          progression_outcome: "increase_load",
          progression_primary_lever: "load",
          progression_confidence: "high",
          progression_source: "exact_history",
          progression_reasoning_json: ["Recent exact history hit the current rep target with acceptable RIR."],
          recommended_load_kg: 105,
          recommended_reps_target: null,
          recommended_sets: null,
          recommended_rest_seconds: null,
        }],
      },
      { rowCount: 0, rows: [] },
    ]),
    guidelineLoadService: {
      async annotateExercisesWithGuidelineLoads({ exercises }) {
        return exercises;
      },
    },
  });
  const req = {
    request_id: "t",
    params: { program_day_id: VALID_UUID },
    auth: { user_id: USER_UUID },
    log: { error() {}, warn() {} },
  };
  const res = mockRes();

  await handlers.dayFull(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.segments?.[0]?.items?.[0]?.progression_recommendation?.outcome, "increase_load");
  assert.equal(res.body?.segments?.[0]?.items?.[0]?.progression_recommendation?.recommended_load_kg, 105);
});

test("dayFull exposes is_new_exercise true and coaching_cues_json arrays", async () => {
  const handlers = createReadProgramHandlers({
    db: mockPool([
      {
        rowCount: 1,
        rows: [{
          program_day_id: VALID_UUID,
          day_label: "Day 1",
          day_type: "strength",
          session_duration_mins: 50,
          hero_image_key: null,
          hero_image_url: null,
          client_profile_id: VALID_UUID,
        }],
      },
      {
        rowCount: 1,
        rows: [{
          workout_segment_id: VALID_UUID,
          block_order: 1,
          segment_order_in_block: 1,
          segment_type: "single",
          segment_title: "Main lift",
        }],
      },
      {
        rowCount: 1,
        rows: [{
          workout_segment_id: VALID_UUID,
          exercise_id: "bb_back_squat",
          exercise_name: "Back Squat",
          order_in_day: 1,
          is_loadable: true,
          coaching_cues_json: ["Brace", "Drive evenly"],
          is_new_exercise: true,
          progression_outcome: null,
        }],
      },
    ]),
    guidelineLoadService: {
      async annotateExercisesWithGuidelineLoads({ exercises }) {
        return exercises;
      },
    },
  });
  const req = {
    request_id: "t",
    params: { program_day_id: VALID_UUID },
    auth: { user_id: USER_UUID },
    log: { error() {}, warn() {} },
  };
  const res = mockRes();

  await handlers.dayFull(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.segments?.[0]?.items?.[0]?.is_new_exercise, true);
  assert.deepEqual(res.body?.segments?.[0]?.items?.[0]?.coaching_cues_json, ["Brace", "Drive evenly"]);
});

test("dayFull exposes is_new_exercise false when exercise has prior exposures", async () => {
  const handlers = createReadProgramHandlers({
    db: mockPool([
      {
        rowCount: 1,
        rows: [{
          program_day_id: VALID_UUID,
          day_label: "Day 1",
          day_type: "strength",
          session_duration_mins: 50,
          hero_image_key: null,
          hero_image_url: null,
          client_profile_id: VALID_UUID,
        }],
      },
      {
        rowCount: 1,
        rows: [{
          workout_segment_id: VALID_UUID,
          block_order: 1,
          segment_order_in_block: 1,
          segment_type: "single",
          segment_title: "Main lift",
        }],
      },
      {
        rowCount: 1,
        rows: [{
          workout_segment_id: VALID_UUID,
          exercise_id: "bb_back_squat",
          exercise_name: "Back Squat",
          order_in_day: 1,
          is_loadable: true,
          coaching_cues_json: [],
          is_new_exercise: false,
          progression_outcome: null,
        }],
      },
    ]),
    guidelineLoadService: {
      async annotateExercisesWithGuidelineLoads({ exercises }) {
        return exercises;
      },
    },
  });
  const req = {
    request_id: "t",
    params: { program_day_id: VALID_UUID },
    auth: { user_id: USER_UUID },
    log: { error() {}, warn() {} },
  };
  const res = mockRes();

  await handlers.dayFull(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.segments?.[0]?.items?.[0]?.is_new_exercise, false);
});
