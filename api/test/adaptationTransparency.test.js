import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdaptationDecision,
  createReadProgramHandlers,
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
    async query() {
      return nextResponse();
    },
    async connect() {
      return {
        async query() {
          return nextResponse();
        },
        release() {},
      };
    },
  };
}

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const USER_UUID = "22222222-2222-4222-8222-222222222222";

test("buildAdaptationDecision returns null when row is null", () => {
  assert.equal(buildAdaptationDecision(null), null);
});

test("buildAdaptationDecision returns null when outcome is missing", () => {
  assert.equal(buildAdaptationDecision({ primary_lever: "load" }), null);
});

test("buildAdaptationDecision returns correct chip for increase_load", () => {
  const result = buildAdaptationDecision({
    decision_outcome: "increase_load",
    primary_lever: "load",
    confidence: "high",
    recommended_load_kg: "92.5",
    recommended_load_delta_kg: "5",
    recommended_reps_target: null,
    recommended_rep_delta: null,
    decision_context_json: { reasons: [] },
    decided_at: new Date("2026-04-10T00:00:00Z"),
  });

  assert.equal(result.display_chip, "Load increased ↑");
  assert.equal(result.recommended_load_kg, 92.5);
  assert.equal(result.recommended_load_delta_kg, 5);
});

test("buildAdaptationDecision uses reasons[0] for display_detail when present", () => {
  const result = buildAdaptationDecision({
    decision_outcome: "increase_load",
    primary_lever: "load",
    confidence: "high",
    recommended_load_kg: null,
    recommended_load_delta_kg: null,
    recommended_reps_target: null,
    recommended_rep_delta: null,
    decision_context_json: {
      reasons: ["Recent exact history hit the current rep target with acceptable RIR"],
    },
    decided_at: new Date("2026-04-10T00:00:00Z"),
  });

  assert.ok(result.display_detail.startsWith("Recent exact history"));
  assert.ok(result.display_detail.endsWith("."));
});

test("buildAdaptationDecision uses fallback detail when reasons is empty", () => {
  const result = buildAdaptationDecision({
    decision_outcome: "deload_local",
    primary_lever: "load",
    confidence: "medium",
    recommended_load_kg: "80",
    recommended_load_delta_kg: "-5",
    recommended_reps_target: null,
    recommended_rep_delta: null,
    decision_context_json: { reasons: [] },
    decided_at: new Date("2026-04-10T00:00:00Z"),
  });

  assert.ok(result.display_detail.includes("fatigue"));
  assert.equal(result.display_chip, "Deload this week");
});

test("buildAdaptationDecision truncates display_detail over 160 chars", () => {
  const longReason = `This sentence intentionally runs well beyond the supported character cap so we can verify that the adaptation detail is trimmed without breaking the final sentence formatting.`;
  const result = buildAdaptationDecision({
    decision_outcome: "hold",
    primary_lever: "hold",
    confidence: "low",
    recommended_load_kg: null,
    recommended_load_delta_kg: null,
    recommended_reps_target: null,
    recommended_rep_delta: null,
    decision_context_json: { reasons: [longReason] },
    decided_at: new Date("2026-04-10T00:00:00Z"),
  });

  assert.ok(result.display_detail.length <= 160);
});

test("dayFull attaches adaptation_decision when decision rows exist", async () => {
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
          client_profile_id: null,
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
          program_exercise_id: VALID_UUID,
          workout_segment_id: VALID_UUID,
          exercise_id: "bb_back_squat",
          exercise_name: "Back Squat",
          order_in_day: 1,
          is_loadable: true,
          progression_outcome: null,
        }],
      },
      {
        rowCount: 1,
        rows: [{
          program_exercise_id: VALID_UUID,
          decision_outcome: "increase_load",
          primary_lever: "load",
          confidence: "high",
          recommended_load_kg: "92.5",
          recommended_load_delta_kg: "5",
          recommended_reps_target: null,
          recommended_rep_delta: null,
          decision_context_json: { reasons: ["You hit the target comfortably"] },
          decided_at: new Date("2026-04-10T00:00:00Z"),
        }],
      },
      { rowCount: 1, rows: [{ id: VALID_UUID }] },
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
    log: { warn() {} },
  };
  const res = mockRes();

  await handlers.dayFull(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.segments?.[0]?.items?.[0]?.adaptation_decision?.outcome, "increase_load");
  assert.equal(res.body?.segments?.[0]?.items?.[0]?.adaptation_decision?.display_chip, "Load increased ↑");
});

test("exerciseDecisionHistory returns newest-first paginated decisions", async () => {
  const handlers = createReadProgramHandlers(mockPool([
    { rowCount: 1, rows: [{ id: VALID_UUID }] },
    { rowCount: 1, rows: [{ total: 2 }] },
    {
      rowCount: 2,
      rows: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          decision_outcome: "increase_load",
          primary_lever: "load",
          confidence: "high",
          recommended_load_kg: "92.5",
          recommended_load_delta_kg: "5",
          recommended_reps_target: null,
          recommended_rep_delta: null,
          evidence_summary_json: { exposures_considered: 3 },
          decision_context_json: { reasons: ["You hit the top of your rep range"] },
          decided_at: new Date("2026-04-10T00:00:00Z"),
          week_number: 6,
          day_number: 1,
          scheduled_date: "2026-04-10",
          exercise_id: "bb_back_squat",
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          decision_outcome: "hold",
          primary_lever: "hold",
          confidence: "medium",
          recommended_load_kg: null,
          recommended_load_delta_kg: null,
          recommended_reps_target: null,
          recommended_rep_delta: null,
          evidence_summary_json: {},
          decision_context_json: { reasons: [] },
          decided_at: new Date("2026-04-03T00:00:00Z"),
          week_number: 5,
          day_number: 1,
          scheduled_date: "2026-04-03",
          exercise_id: "bb_back_squat",
        },
      ],
    },
    { rowCount: 1, rows: [{ exercise_name: "Back Squat", exercise_id: "bb_back_squat" }] },
  ]));

  const req = {
    request_id: "t",
    params: { program_exercise_id: VALID_UUID },
    query: { limit: "20", offset: "0" },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.exerciseDecisionHistory(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.exercise_name, "Back Squat");
  assert.equal(res.body?.total_decisions, 2);
  assert.equal(res.body?.decisions?.[0]?.display_label, "Week 6 - Added 5 kg");
  assert.equal(res.body?.decisions?.[1]?.display_label, "Week 5 - Held steady");
});

test("exerciseDecisionHistory returns 403 for wrong user", async () => {
  const handlers = createReadProgramHandlers(mockPool([{ rowCount: 0, rows: [] }]));
  const req = {
    request_id: "t",
    params: { program_exercise_id: VALID_UUID },
    query: {},
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.exerciseDecisionHistory(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.error, "not_found_or_forbidden");
});
