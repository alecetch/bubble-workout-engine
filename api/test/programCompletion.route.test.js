import { dbAvailableOrSkip } from "./helpers/requireDb.js";
import express from "express";
import jwt from "jsonwebtoken";
import { pool, withAuthUser } from "../testSupport/authHardeningFixtures.js";
import { trainingProgram } from "../testSupport/trainingFixtures.js";
import { offsetLocalDate, localDateInZone } from "../src/services/trainingYear.js";
import { makeRequireAuth } from "../src/middleware/requireAuth.js";
test.after(() => pool.end());
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
      if (_sql.includes("SELECT cp.onboarding_completed_at")) return { rows: [{ timezone: "UTC" }] };
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
      last_scheduled_date: null, schedule_ended: false, days_since_last_session: null,
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
  assert.equal(res.body?.program_type_label, "Strength");
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
      if (sql.includes("SELECT cp.onboarding_completed_at")) return { rows: [{ timezone: "UTC" }] };
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
      if (sql.includes("SELECT cp.onboarding_completed_at")) return { rows: [{ timezone: "UTC" }] };
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

async function lapseFixture(fn, { finalOffset = -3, completed = [0], lastSessionOffset = -5 } = {}) {
  return withAuthUser(async user => {
    await pool.query("UPDATE app_user SET timezone='UTC' WHERE id=$1", [user.id]);
    await pool.query("INSERT INTO client_profile(user_id, fitness_rank) VALUES ($1,1)", [user.id]);
    const program = await trainingProgram(pool, user.id);
    await pool.query("UPDATE program SET program_type='strength' WHERE id=$1", [program.id]);
    const today = localDateInZone(new Date(), "UTC");
    for (let index = 0; index < program.days.length; index++) {
      await pool.query(`INSERT INTO program_calendar_day(program_id, program_week_id, program_day_id, week_number,
        scheduled_offset_days, scheduled_weekday, scheduled_date, global_day_index, program_day_key, user_id)
        SELECT program_id, program_week_id, id, 1, $2, 'mon', $3, global_day_index, program_day_key, $4
        FROM program_day WHERE id=$1`, [program.days[index], index, offsetLocalDate(today, finalOffset - 2 + index), user.id]);
      await pool.query("UPDATE program_day SET is_completed=$2 WHERE id=$1", [program.days[index], completed.includes(index)]);
    }
    if (lastSessionOffset !== null) await pool.query(`INSERT INTO training_session(user_id,program_day_id,local_date,source)
      VALUES ($1,$2,$3,'program_day')`, [user.id, program.days[0], offsetLocalDate(today, lastSessionOffset)]);
    const handlers = createProgramCompletionHandlers(pool);
    const call = async (method, { query = {}, body = {}, owner = user.id } = {}) => {
      const res = mockRes(); await handlers[method]({ params: { program_id: program.id }, auth: { user_id: owner }, query, body }, res); return res;
    };
    await fn({ ...user, program, today, call, handlers });
  });
}

test("ended schedule includes the incomplete final session and closes with skips", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
  return lapseFixture(async f => {
  const check = await f.call("endCheck"); assert.equal(check.statusCode, 200);
  assert.equal(check.body.schedule_ended, true); assert.equal(check.body.can_complete_with_skips, true);
  assert.equal(check.body.last_scheduled_date, offsetLocalDate(f.today, -3)); assert.equal(check.body.missed_workouts_count, 2);
  assert.equal(check.body.days_since_last_session, 5);
  const result = await f.call("completeProgram", { body: { mode: "with_skips", local_date: f.today } });
  assert.equal(result.statusCode, 200);
  const row = (await pool.query("SELECT status,completed_mode,is_primary FROM program WHERE id=$1", [f.program.id])).rows[0];
  assert.deepEqual(row, { status: "completed", completed_mode: "with_skips", is_primary: false });
  assert.equal((await f.call("endCheck")).body.can_complete_with_skips, false);
});
});
for (const finalOffset of [-1, 0, 2]) test(`final date offset ${finalOffset} retains the original completion guard`, async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
  return lapseFixture(async f => {
  const check = await f.call("endCheck"); assert.equal(check.body.schedule_ended, false); assert.equal(check.body.can_complete_with_skips, false);
  assert.equal(check.body.missed_workouts_count, 1);
  assert.equal((await f.call("completeProgram", { body: { mode: "with_skips" } })).statusCode, 400);
}, { finalOffset });
});
test("second day after the final date is the first ended day", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
  return lapseFixture(async f => {
  assert.equal((await f.call("endCheck")).body.schedule_ended, true);
}, { finalOffset: -2 });
});
test("completed final session still permits skips inside the schedule", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
  return lapseFixture(async f => {
  const check = await f.call("endCheck"); assert.equal(check.body.schedule_ended, false); assert.equal(check.body.can_complete_with_skips, true);
  assert.equal((await f.call("completeProgram", { body: { mode: "with_skips" } })).statusCode, 200);
}, { finalOffset: 1, completed: [2] });
});
test("fully complete block uses as_scheduled and already-completed requests remain idempotent", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
  return lapseFixture(async f => {
  assert.equal((await f.call("endCheck")).body.can_complete_with_skips, false);
  assert.equal((await f.call("completeProgram", { body: { mode: "as_scheduled" } })).statusCode, 200);
  const again = await f.call("completeProgram", { body: { mode: "with_skips" } });
  assert.equal(again.statusCode, 200); assert.equal(again.body.completed_mode, "as_scheduled");
}, { completed: [0, 1, 2] });
});
test("rescheduled dates and skipped future sessions determine the actual schedule end", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
  return lapseFixture(async f => {
  const newDate = offsetLocalDate(f.today, 4);
  await pool.query("UPDATE program_calendar_day SET scheduled_date=$2 WHERE program_day_id=$1", [f.program.days[2], newDate]);
  const check = await f.call("endCheck"); assert.equal(check.body.last_scheduled_date, newDate); assert.equal(check.body.schedule_ended, false);
  await pool.query("UPDATE program_day SET is_skipped=true WHERE id=$1", [f.program.days[2]]);
  const skipped = await f.call("endCheck"); assert.equal(skipped.body.schedule_ended, true);
  assert.equal(skipped.body.last_scheduled_date, offsetLocalDate(f.today, -4)); assert.equal(skipped.body.missed_workouts_count, 1);
});
});
for (const offset of [1, -3]) test(`all three completion routes validate local_date offset ${offset}`, async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
  return lapseFixture(async f => {
  const local_date = offsetLocalDate(f.today, offset);
  for (const method of ["endCheck", "completionSummary", "completeProgram"]) {
    const result = await f.call(method, { query: { local_date }, body: { mode: "with_skips", local_date } });
    assert.equal(result.statusCode, 400); assert.equal(result.body.code, "validation_error");
  }
});
});
test("omitted date uses the stored timezone and yesterday remains an accepted grace date", async t => {
  if (!await dbAvailableOrSkip(t, pool)) return;

  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-05-01T23:30:00Z") });
  await lapseFixture(async f => {
    await pool.query("UPDATE app_user SET timezone='Pacific/Kiritimati' WHERE id=$1", [f.id]);
    const check = await f.call("endCheck"); assert.equal(check.body.schedule_ended, true);
    assert.equal((await f.call("endCheck", { query: { local_date: "2026-05-01" } })).body.schedule_ended, false);
    assert.equal(check.body.days_since_last_session, 6);
  }, { finalOffset: -1 });

});
for (const days of [5, 20, 21, 25, null]) test(`rank suggestion after ${days} days since a program session`, async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
  return lapseFixture(async f => {
  await pool.query(`INSERT INTO exercise_progression_state(user_id,program_type,exercise_id,progression_group_key,last_outcome,confidence)
    VALUES ($1,'strength','bb_back_squat','lapse-test','increase_load','high')`, [f.id]);
  await pool.query("INSERT INTO training_session(user_id,local_date,source,activity_type,duration_min) VALUES ($1,$2,'manual','run',30)", [f.id, f.today]);
  const result = await f.call("completionSummary"); assert.equal(result.statusCode, 200);
  const lapsed = days !== null && days >= 21;
  assert.equal(result.body.lapsed, lapsed); assert.equal(result.body.days_since_last_session, days);
  assert.equal(result.body.suggested_next_rank, lapsed ? 1 : 2);
  assert.equal(result.body.re_enrollment_options.some(option => option.option === "progress_level"), !lapsed);
}, { lastSessionOffset: days === null ? null : -days });
});
test("all three routes require auth and hide another user's program", async (t) => {
  if (!await dbAvailableOrSkip(t, pool)) return;
  return lapseFixture(async f => {
  const app = express(); app.use(express.json());
  const secret = "program-lapse-test-secret";
  app.use(makeRequireAuth(secret, "lapse-test", { getPasswordChangedAt: async () => null }));
  app.get("/end-check", (req, res) => { req.params.program_id = f.program.id; return f.handlers.endCheck(req, res); });
  app.get("/completion-summary", (req, res) => { req.params.program_id = f.program.id; return f.handlers.completionSummary(req, res); });
  app.post("/complete", (req, res) => { req.params.program_id = f.program.id; return f.handlers.completeProgram(req, res); });
  const server = app.listen(0); await new Promise(resolve => server.once("listening", resolve));
  try {
    const token = jwt.sign({}, secret, { subject: USER_UUID, issuer: "lapse-test" });
    for (const path of ["end-check", "completion-summary", "complete"]) {
      const options = { method: path === "complete" ? "POST" : "GET", headers: { "Content-Type": "application/json" }, ...(path === "complete" ? { body: JSON.stringify({ mode: "with_skips" }) } : {}) };
      const url = `http://127.0.0.1:${server.address().port}/${path}`;
      assert.equal((await fetch(url, options)).status, 401);
      assert.equal((await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } })).status, 404);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
});
