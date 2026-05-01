import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReEnrollmentOptions,
  confidenceLabel,
  createProgramCompletionHandlers,
  normalizeLifecycleStatus,
  suggestNextRank,
  toEndCheckPayload,
} from "../src/routes/programCompletion.js";

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

function mockDb(responses) {
  let i = 0;
  return {
    async query(_sql, _params) {
      const response = responses[i++];
      if (!response) throw new Error(`Unexpected DB call at index ${i - 1}`);
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const USER_UUID = "22222222-2222-4222-8222-222222222222";

test("confidenceLabel maps numeric score bands", () => {
  assert.equal(confidenceLabel(0.8), "high");
  assert.equal(confidenceLabel(0.5), "medium");
  assert.equal(confidenceLabel(0.2), "low");
  assert.equal(confidenceLabel(null), null);
});

test("suggestNextRank only advances when ratio and score thresholds are met", () => {
  assert.equal(suggestNextRank(1, 0.7, 7, 10), 2);
  assert.equal(suggestNextRank(1, 0.59, 7, 10), 1);
  assert.equal(suggestNextRank(1, 0.7, 5, 10), 1);
  assert.equal(suggestNextRank(3, 0.9, 9, 10), 3);
  assert.equal(suggestNextRank(1, 0.9, 0, 0), 1);
});

test("buildReEnrollmentOptions always includes same_settings and change_goals", () => {
  assert.deepEqual(buildReEnrollmentOptions(1, 1), [
    { option: "same_settings", label: "Start a new program (same settings)", fitness_rank: 1 },
    { option: "change_goals", label: "Change goals", fitness_rank: 1 },
  ]);
  assert.deepEqual(buildReEnrollmentOptions(1, 2), [
    { option: "same_settings", label: "Start a new program (same settings)", fitness_rank: 1 },
    { option: "progress_level", label: "Progress to next level", fitness_rank: 2 },
    { option: "change_goals", label: "Change goals", fitness_rank: 1 },
  ]);
});

test("normalizeLifecycleStatus collapses completed vs in-progress values", () => {
  assert.equal(normalizeLifecycleStatus("completed"), "completed");
  assert.equal(normalizeLifecycleStatus("active"), "in_progress");
  assert.equal(normalizeLifecycleStatus(null), "in_progress");
});

test("toEndCheckPayload derives can_complete_with_skips only at end of block", () => {
  assert.deepEqual(
    toEndCheckPayload({
      program_id: VALID_UUID,
      program_title: "Block",
      lifecycle_status: "active",
      completed_mode: null,
      total_days: 8,
      completed_days: 6,
      missed_workouts_count: 2,
      skipped_workouts_count: 0,
      is_last_scheduled_day_complete: true,
    }),
    {
      program_id: VALID_UUID,
      program_title: "Block",
      lifecycle_status: "in_progress",
      completed_mode: null,
      total_days: 8,
      completed_days: 6,
      missed_workouts_count: 2,
      skipped_workouts_count: 0,
      is_last_scheduled_day_complete: true,
      can_complete_with_skips: true,
    },
  );
});

test("completionSummary returns shaped response for owned program", async () => {
  const handlers = createProgramCompletionHandlers(mockDb([
    {
      rowCount: 1,
      rows: [{
        program_id: VALID_UUID,
        program_title: "Strength Block 1",
        program_type: "strength",
        weeks_count: 12,
        total_days: 3,
        completed_days: 2,
        missed_workouts_count: 1,
        is_last_scheduled_day_complete: false,
        lifecycle_status: "active",
        completed_mode: null,
        completed_at: null,
        completion_ratio: 2 / 3,
        exercises_progressed: 1,
        exercises_tracked: 2,
        avg_progression_score: 0.55,
        avg_confidence_score: 0.5,
        fitness_rank: 1,
        fitness_level_slug: "intermediate",
        goals: ["strength"],
        injury_flags: ["knee_issues"],
        goal_notes: "More engine work",
        minutes_per_session: 50,
        preferred_days: ["mon", "wed", "fri"],
        schedule_constraints: "No Sundays",
        height_cm: 182,
        weight_kg: 84,
        sex: "male",
        age_range: "25_34",
        equipment_items_slugs: ["barbell", "rack", "dumbbells"],
        equipment_preset_slug: "commercial_gym",
        onboarding_step_completed: 3,
      }],
    },
    {
      rowCount: 1,
      rows: [{
        exercise_id: "bb_back_squat",
        exercise_name: "Back Squat",
        best_weight_kg: 120,
      }],
    },
  ]));
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.completionSummary(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.program_type, "strength");
  assert.equal(res.body?.days_completed, 2);
  assert.equal(res.body?.days_total, 3);
  assert.equal(res.body?.missed_workouts_count, 1);
  assert.equal(res.body?.lifecycle_status, "in_progress");
  assert.equal(res.body?.completed_mode, null);
  assert.equal(res.body?.completion_ratio, 2 / 3);
  assert.equal(res.body?.exercises_progressed, 1);
  assert.equal(res.body?.exercises_tracked, 2);
  assert.equal(res.body?.avg_confidence, "medium");
  assert.deepEqual(res.body?.personal_records, [
    {
      exercise_id: "bb_back_squat",
      exercise_name: "Back Squat",
      best_weight_kg: 120,
    },
  ]);
  assert.deepEqual(res.body?.current_profile, {
    fitness_rank: 1,
    fitness_level_slug: "intermediate",
    goals: ["strength"],
    injury_flags: ["knee_issues"],
    goal_notes: "More engine work",
    minutes_per_session: 50,
    preferred_days: ["mon", "wed", "fri"],
    schedule_constraints: "No Sundays",
    height_cm: 182,
    weight_kg: 84,
    sex: "male",
    age_range: "25_34",
    equipment_items_slugs: ["barbell", "rack", "dumbbells"],
    equipment_preset_slug: "commercial_gym",
    onboarding_step_completed: 3,
  });
  assert.deepEqual(res.body?.re_enrollment_options, [
    { option: "same_settings", label: "Start a new program (same settings)", fitness_rank: 1 },
    { option: "change_goals", label: "Change goals", fitness_rank: 1 },
  ]);
});

test("completionSummary suggests next rank when progression is strong enough", async () => {
  const handlers = createProgramCompletionHandlers(mockDb([
    {
      rowCount: 1,
      rows: [{
        program_id: VALID_UUID,
        program_title: "Strength Block 2",
        program_type: "strength",
        weeks_count: 8,
        total_days: 6,
        completed_days: 6,
        missed_workouts_count: 0,
        is_last_scheduled_day_complete: true,
        lifecycle_status: "completed",
        completed_mode: "as_scheduled",
        completed_at: "2026-04-16T12:00:00.000Z",
        completion_ratio: 1,
        exercises_progressed: 4,
        exercises_tracked: 6,
        avg_progression_score: 0.7,
        avg_confidence_score: 0.8,
        fitness_rank: 1,
        fitness_level_slug: "intermediate",
        goals: ["strength"],
        minutes_per_session: 60,
        preferred_days: ["mon", "wed", "fri"],
        equipment_items_slugs: ["barbell"],
        equipment_preset_slug: "commercial_gym",
      }],
    },
    { rowCount: 0, rows: [] },
  ]));
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.completionSummary(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.suggested_next_rank, 2);
  assert.equal(res.body?.re_enrollment_options.some((option) => option.option === "progress_level"), true);
});

test("completionSummary handles null program_type gracefully", async () => {
  const handlers = createProgramCompletionHandlers(mockDb([
    {
      rowCount: 1,
      rows: [{
        program_id: VALID_UUID,
        program_title: "Legacy Program",
        program_type: null,
        weeks_count: 4,
        total_days: 3,
        completed_days: 2,
        missed_workouts_count: 1,
        is_last_scheduled_day_complete: false,
        lifecycle_status: "active",
        completed_mode: null,
        completed_at: null,
        completion_ratio: 2 / 3,
        exercises_progressed: 7,
        exercises_tracked: 10,
        avg_progression_score: 0.8,
        avg_confidence_score: 0.8,
        fitness_rank: 1,
        fitness_level_slug: "intermediate",
        goals: ["strength"],
        minutes_per_session: 45,
        preferred_days: ["mon"],
        equipment_items_slugs: ["barbell"],
        equipment_preset_slug: "commercial_gym",
      }],
    },
    { rowCount: 0, rows: [] },
  ]));
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.completionSummary(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.program_type, null);
  assert.equal(res.body?.exercises_progressed, 0);
  assert.equal(res.body?.exercises_tracked, 0);
});

test("completionSummary returns 404 for unknown program", async () => {
  const handlers = createProgramCompletionHandlers(mockDb([{ rowCount: 0, rows: [] }]));
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.completionSummary(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body?.code, "not_found");
});

test("endCheck returns skip-aware end-of-block state", async () => {
  const handlers = createProgramCompletionHandlers(mockDb([
    {
      rowCount: 1,
      rows: [{
        program_id: VALID_UUID,
        program_title: "Block",
        lifecycle_status: "active",
        completed_mode: null,
        total_days: 8,
        completed_days: 6,
        missed_workouts_count: 2,
        skipped_workouts_count: 1,
        is_last_scheduled_day_complete: true,
      }],
    },
  ]));
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.endCheck(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.can_complete_with_skips, true);
  assert.equal(res.body?.missed_workouts_count, 2);
  assert.equal(res.body?.skipped_workouts_count, 1);
  assert.equal(res.body?.lifecycle_status, "in_progress");
});

test("endCheck includes skipped workout count", async () => {
  const handlers = createProgramCompletionHandlers(mockDb([
    {
      rowCount: 1,
      rows: [{
        program_id: VALID_UUID,
        program_title: "Block",
        lifecycle_status: "active",
        completed_mode: null,
        total_days: 1,
        completed_days: 1,
        missed_workouts_count: 0,
        skipped_workouts_count: 1,
        is_last_scheduled_day_complete: true,
      }],
    },
  ]));
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.endCheck(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.skipped_workouts_count, 1);
});

test("completeProgram accepts with_skips after the final scheduled day is complete", async () => {
  const calls = [];
  const handlers = createProgramCompletionHandlers({
    async query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) {
        return {
          rowCount: 1,
          rows: [{
            program_id: VALID_UUID,
            program_title: "Block",
            lifecycle_status: "active",
            completed_mode: null,
            total_days: 8,
            completed_days: 6,
            missed_workouts_count: 2,
            is_last_scheduled_day_complete: true,
          }],
        };
      }
      if (calls.length === 2) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error("Unexpected DB call");
    },
  });
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    body: { mode: "with_skips" },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.completeProgram(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.completed_mode, "with_skips");
  assert.match(calls[1].sql, /status = 'completed'/);
});

test("completeProgram rejects with_skips before the final scheduled day is complete", async () => {
  const handlers = createProgramCompletionHandlers(mockDb([
    {
      rowCount: 1,
      rows: [{
        program_id: VALID_UUID,
        program_title: "Block",
        lifecycle_status: "active",
        completed_mode: null,
        total_days: 8,
        completed_days: 6,
        missed_workouts_count: 2,
        is_last_scheduled_day_complete: false,
      }],
    },
  ]));
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    body: { mode: "with_skips" },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.completeProgram(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, "validation_error");
});

test("completionSummary returns 400 for invalid UUID", async () => {
  const handlers = createProgramCompletionHandlers(mockDb([]));
  const req = {
    request_id: "t",
    params: { program_id: "bad" },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.completionSummary(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, "validation_error");
});

test("completionSummary returns highest positive personal record", async () => {
  const calls = [];
  const handlers = createProgramCompletionHandlers({
    async query(sql, params) {
      calls.push({ sql, params });
      if (calls.length === 1) {
        return {
          rowCount: 1,
          rows: [{
            program_id: VALID_UUID,
            program_title: "Strength Block 1",
            program_type: "strength",
            weeks_count: 12,
            total_days: 2,
            completed_days: 2,
            missed_workouts_count: 0,
            skipped_workouts_count: 0,
            is_last_scheduled_day_complete: true,
            lifecycle_status: "active",
            completed_mode: null,
            completed_at: null,
            completion_ratio: 1,
            exercises_progressed: 0,
            exercises_tracked: 0,
            avg_progression_score: 0,
            avg_confidence_score: null,
            fitness_rank: 1,
            fitness_level_slug: "intermediate",
            goals: ["strength"],
            injury_flags: [],
            goal_notes: "",
            minutes_per_session: 50,
            preferred_days: ["mon"],
            schedule_constraints: "",
            height_cm: null,
            weight_kg: null,
            sex: null,
            age_range: null,
            equipment_items_slugs: ["barbell"],
            equipment_preset_slug: "commercial_gym",
            onboarding_step_completed: 3,
          }],
        };
      }
      if (calls.length === 2) {
        assert.match(sql, /sel\.weight_kg > 0/);
        assert.doesNotMatch(sql, /DISTINCT ON/);
        return {
          rowCount: 1,
          rows: [{
            exercise_id: "bb_back_squat",
            exercise_name: "Back Squat",
            best_weight_kg: 80,
          }],
        };
      }
      throw new Error("Unexpected DB call");
    },
  });
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    auth: { user_id: USER_UUID },
  };
  const res = mockRes();

  await handlers.completionSummary(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.personal_records?.[0]?.best_weight_kg, 80);
});

test("completionSummary returns 400 when auth context is missing", async () => {
  const handlers = createProgramCompletionHandlers(mockDb([]));
  const req = {
    request_id: "t",
    params: { program_id: VALID_UUID },
    auth: {},
  };
  const res = mockRes();

  await handlers.completionSummary(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.code, "validation_error");
});
