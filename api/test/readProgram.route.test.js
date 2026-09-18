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
    { rowCount: 2, rows: [{ equipment_name: "Barbell" }, { equipment_name: "Pull-up bar" }] },
    // bonus_day_recommendation queries (today has no scheduled session → todayIsRest = true)
    { rowCount: 0, rows: [] },  // least-recently-trained focus type
    { rowCount: 0, rows: [] },  // distinct focus types in program
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
  assert.deepEqual(res.body?.selected_day?.equipment_names, ["Barbell", "Pull-up bar"]);
});

test("programOverview selected_day equipment_names falls back to raw slug when no equipment_items match", async () => {
  const DAY_UUID = "44444444-4444-4444-8444-444444444444";
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
      rowCount: 1,
      rows: [{
        id: "cal-1",
        program_day_id: DAY_UUID,
        scheduled_date: "2026-04-01",
        week_number: 1,
        is_training_day: true,
        is_completed: false,
      }],
    },
    { rowCount: 1, rows: [{ program_day_id: DAY_UUID }] },
    {
      rowCount: 1,
      rows: [{
        program_day_id: DAY_UUID,
        program_id: VALID_UUID,
        day_label: "Day 1",
        day_type: "strength",
        session_duration_mins: 50,
      }],
    },
    // Equipment query returns the raw slug because no equipment_items row matched
    // (COALESCE falls back to trim(slug_val))
    { rowCount: 1, rows: [{ equipment_name: "unknown_gadget" }] },
    // bonus_day_recommendation queries (today has no scheduled session → todayIsRest = true)
    { rowCount: 0, rows: [] },  // least-recently-trained focus type
    { rowCount: 0, rows: [] },  // distinct focus types in program
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
  assert.deepEqual(res.body?.selected_day?.equipment_names, ["unknown_gadget"]);
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

test("dayComplete skips Layer B progression when day was already complete", async () => {
  const calls = [];
  const progressionDecisionService = {
    async applyProgressionRecommendations(args) {
      calls.push(args);
      return { decisions: [] };
    },
  };
  const handlers = createReadProgramHandlers({
    db: mockPool([
      { rowCount: 1, rows: [{ id: VALID_UUID, was_completed: true }] },
    ]),
    progressionDecisionService,
  });
  const req = {
    request_id: "t",
    params: { program_day_id: VALID_UUID },
    query: {},
    body: { is_completed: true },
    auth: { user_id: USER_UUID },
    log: { error() {}, warn() {} },
  };
  const res = mockRes();

  await handlers.dayComplete(req, res);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(calls.length, 0);
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

test("dayFull always exposes a non-empty stillImageUrl with placeholder fallback", async () => {
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
        rowCount: 2,
        rows: [
          {
            workout_segment_id: VALID_UUID,
            program_exercise_id: "33333333-3333-4333-8333-333333333333",
            exercise_id: "bb_back_squat",
            exercise_name: "Back Squat",
            order_in_day: 1,
            is_loadable: true,
            coaching_cues_json: [],
            is_new_exercise: false,
            progression_outcome: null,
            still_image_key: "exercise-media/bb_back_squat/still.jpg",
            video_status: "none",
          },
          {
            workout_segment_id: VALID_UUID,
            program_exercise_id: "44444444-4444-4444-8444-444444444444",
            exercise_id: "row",
            exercise_name: "Row",
            order_in_day: 2,
            is_loadable: false,
            coaching_cues_json: [],
            is_new_exercise: false,
            progression_outcome: null,
            still_image_key: null,
            video_status: null,
          },
        ],
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

  const items = res.body?.segments?.[0]?.items ?? [];
  assert.equal(res.statusCode, 200);
  assert.ok(items[0].stillImageUrl.includes("exercise-media/bb_back_squat/still.jpg"));
  assert.ok(items[1].stillImageUrl.includes("exercise-media/_placeholder/still.jpg"));
});

test("dayFull only resolves video and poster URLs when media status is ready", async () => {
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
        rowCount: 3,
        rows: [
          {
            workout_segment_id: VALID_UUID,
            exercise_id: "ready",
            exercise_name: "Ready",
            order_in_day: 1,
            is_loadable: true,
            coaching_cues_json: [],
            is_new_exercise: false,
            progression_outcome: null,
            still_image_key: "exercise-media/ready/still.jpg",
            video_key: "exercise-media/ready/video.mp4",
            poster_frame_key: "exercise-media/ready/poster.jpg",
            video_status: "ready",
          },
          {
            workout_segment_id: VALID_UUID,
            exercise_id: "processing",
            exercise_name: "Processing",
            order_in_day: 2,
            is_loadable: true,
            coaching_cues_json: [],
            is_new_exercise: false,
            progression_outcome: null,
            still_image_key: "exercise-media/processing/still.jpg",
            video_key: "exercise-media/processing/video.mp4",
            poster_frame_key: "exercise-media/processing/poster.jpg",
            video_status: "processing",
          },
          {
            workout_segment_id: VALID_UUID,
            exercise_id: "failed",
            exercise_name: "Failed",
            order_in_day: 3,
            is_loadable: true,
            coaching_cues_json: [],
            is_new_exercise: false,
            progression_outcome: null,
            still_image_key: "exercise-media/failed/still.jpg",
            video_key: "exercise-media/failed/video.mp4",
            poster_frame_key: "exercise-media/failed/poster.jpg",
            video_status: "failed",
          },
        ],
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

  const [ready, processing, failed] = res.body?.segments?.[0]?.items ?? [];
  assert.equal(ready.videoStatus, "ready");
  assert.ok(ready.videoUrl.includes("exercise-media/ready/video.mp4"));
  assert.ok(ready.posterImageUrl.includes("exercise-media/ready/poster.jpg"));
  assert.equal(processing.videoStatus, "processing");
  assert.equal(processing.videoUrl, null);
  assert.equal(processing.posterImageUrl, null);
  assert.equal(failed.videoStatus, "failed");
  assert.equal(failed.videoUrl, null);
  assert.equal(failed.posterImageUrl, null);
});


test("dayFull resolves cool-down, warm-up and strength media independently on the same day", async () => {
  const types = ["warmup", "single", "cooldown"];
  const queries = [];
  const db = mockPool([
    { rowCount: 1, rows: [{ program_day_id: VALID_UUID, client_profile_id: VALID_UUID }] },
    { rowCount: 3, rows: types.map((type, index) => ({ workout_segment_id: type, segment_type: type, block_order: index + 1 })) },
    { rowCount: 3, rows: types.map((type, index) => ({
      workout_segment_id: type, program_exercise_id: `${type}-pe`, exercise_id: `${type}-ex`,
      segment_type: type, exercise_name: "Strength", order_in_day: index + 1,
      reps_prescribed: type === "cooldown" ? "30" : "10", reps_unit: type === "cooldown" ? "sec" : "reps",
      notes: `${type} cue`,
      still_image_key: "exercise-media/strength/still.jpg", video_status: "none",
      warmup_name: "Warm-up exercise", warmup_rounds: 1,
      warmup_still_image_key: "warmup-exercise-media/warm/still.jpg", warmup_video_status: "processing",
      warmup_video_key: "warmup-exercise-media/warm/video.mp4",
      cooldown_name: "Cool-down stretch", cooldown_rounds: 2,
      cooldown_still_image_key: "cooldown-exercise-media/cool/still.jpg", cooldown_video_status: "ready",
      cooldown_video_key: "cooldown-exercise-media/cool/video.mp4", cooldown_poster_frame_key: "cooldown-exercise-media/cool/poster.jpg",
    })) },
    { rowCount: 0, rows: [] },
  ]);
  const handlers = createReadProgramHandlers({
    db: { async connect() { return { async query(sql, params) { queries.push(sql); return db.query(sql, params); }, release() {} }; } },
    guidelineLoadService: { async annotateExercisesWithGuidelineLoads({ exercises }) { return exercises; } },
  });
  const res = mockRes();
  await handlers.dayFull({ request_id: "cooldown", params: { program_day_id: VALID_UUID }, auth: { user_id: USER_UUID }, log: { error() {}, warn() {} } }, res);
  assert.equal(res.statusCode, 200);
  const [warm, strength, cool] = res.body.segments.map((segment) => segment.items[0]);
  assert.equal(cool.exercise_name, "Cool-down stretch");
  assert.equal(cool.rounds, 2);
  assert.equal(cool.durationOrRepsLabel, "30 sec");
  assert.equal(cool.cueText, "cooldown cue");
  assert.equal(cool.videoStatus, "ready");
  assert.ok(cool.stillImageUrl.includes("cooldown-exercise-media/cool/still.jpg"));
  assert.ok(cool.videoUrl.includes("cooldown-exercise-media/cool/video.mp4"));
  assert.ok(cool.posterImageUrl.includes("cooldown-exercise-media/cool/poster.jpg"));
  assert.equal(cool.cooldown_name, undefined);
  assert.equal(warm.exercise_name, "Warm-up exercise");
  assert.equal(warm.rounds, 1);
  assert.equal(warm.durationOrRepsLabel, "10 reps");
  assert.equal(warm.cueText, "warmup cue");
  assert.ok(warm.stillImageUrl.includes("warmup-exercise-media/warm/still.jpg"));
  assert.equal(warm.videoStatus, "processing");
  assert.equal(warm.videoUrl, null);
  assert.equal(strength.exercise_name, "Strength");
  assert.ok(strength.stillImageUrl.includes("exercise-media/strength/still.jpg"));
  assert.equal(strength.rounds, undefined);
  assert.equal(strength.cueText, undefined);
  const exerciseQuery = queries.find((sql) => sql.includes("LEFT JOIN cooldown_exercise ce"));
  assert.match(exerciseQuery, /ce.cooldown_exercise_id = pe.exercise_id AND pe.segment_type = 'cooldown'/);
  assert.match(exerciseQuery, /LEFT JOIN cooldown_exercise_media cm/);
});
