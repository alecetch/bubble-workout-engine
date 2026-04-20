import test from "node:test";
import assert from "node:assert/strict";
import { createCoachMiddleware } from "../../middleware/coachMiddleware.js";
import { createAdminCoachesHandlers } from "../adminCoaches.js";
import { createCoachPortalHandlers } from "../coachPortal.js";

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

function makeNext() {
  const calls = [];
  const next = (err) => calls.push(err ?? null);
  next.calls = calls;
  return next;
}

const UUIDS = {
  coach: "11111111-1111-4111-8111-111111111111",
  client: "22222222-2222-4222-8222-222222222222",
  otherClient: "33333333-3333-4333-8333-333333333333",
  relationship: "44444444-4444-4444-8444-444444444444",
  program: "55555555-5555-4555-8555-555555555555",
  programExercise: "66666666-6666-4666-8666-666666666666",
  decisionA: "77777777-7777-4777-8777-777777777777",
  decisionB: "88888888-8888-4888-8888-888888888888",
};

test("requireCoachRole returns 403 for non-coach JWT", async () => {
  const { requireCoachRole } = createCoachMiddleware({
    async query() {
      return { rows: [{ role: "athlete" }] };
    },
  });
  const req = { auth: { user_id: UUIDS.coach } };
  const res = mockRes();
  const next = makeNext();

  await requireCoachRole(req, res, next);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.code, "forbidden_not_coach");
  assert.equal(next.calls.length, 0);
});

test("requireCoachClientAccess returns 403 when no relationship exists", async () => {
  const { requireCoachClientAccess } = createCoachMiddleware({
    async query() {
      return { rows: [] };
    },
  });
  const req = { auth: { user_id: UUIDS.coach }, params: { client_user_id: UUIDS.client } };
  const res = mockRes();
  const next = makeNext();

  await requireCoachClientAccess(req, res, next);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.code, "forbidden_no_relationship");
});

test("requireCoachClientAccess returns 403 when relationship is revoked", async () => {
  const { requireCoachClientAccess } = createCoachMiddleware({
    async query() {
      return { rows: [] };
    },
  });
  const req = { auth: { user_id: UUIDS.coach }, params: { client_user_id: UUIDS.client } };
  const res = mockRes();
  const next = makeNext();

  await requireCoachClientAccess(req, res, next);

  assert.equal(res.statusCode, 403);
});

test("requireCoachClientAccess allows active relationship", async () => {
  const { requireCoachClientAccess } = createCoachMiddleware({
    async query() {
      return { rows: [{ id: UUIDS.relationship }] };
    },
  });
  const req = { auth: { user_id: UUIDS.coach }, params: { client_user_id: UUIDS.client } };
  const res = mockRes();
  const next = makeNext();

  await requireCoachClientAccess(req, res, next);

  assert.equal(next.calls.length, 1);
  assert.equal(next.calls[0], null);
  assert.equal(res.body, null);
});

test("listClients returns only active linked athletes with expected summary fields", async () => {
  const handlers = createCoachPortalHandlers({
    async query() {
      return {
        rows: [
          {
            relationship_id: UUIDS.relationship,
            client_user_id: UUIDS.client,
            client_profile_id: "cp-1",
            display_name: "Athlete One",
            program_id: UUIDS.program,
            program_title: "Strength",
            program_type: "strength",
            program_status: "active",
            last_session_date: "2026-04-10",
            has_active_override: false,
            relationship_status: "active",
          },
        ],
      };
    },
  });
  const req = { auth: { user_id: UUIDS.coach } };
  const res = mockRes();

  await handlers.listClients(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.clients.length, 1);
  assert.equal(res.body.clients[0].display_name, "Athlete One");
  assert.deepEqual(res.body.clients[0].active_program, {
    program_id: UUIDS.program,
    program_title: "Strength",
    program_type: "strength",
    status: "active",
  });
  assert.equal(res.body.clients[0].current_streak, 0);
  assert.equal(res.body.clients[0].relationship_status, "active");
});

test("listClients returns active_program null when no active program exists", async () => {
  const handlers = createCoachPortalHandlers({
    async query() {
      return {
        rows: [
          {
            relationship_id: UUIDS.relationship,
            client_user_id: UUIDS.client,
            client_profile_id: "cp-1",
            display_name: "Athlete One",
            program_id: null,
            program_title: null,
            program_type: null,
            program_status: null,
            last_session_date: null,
            has_active_override: false,
            relationship_status: "active",
          },
        ],
      };
    },
  });
  const req = { auth: { user_id: UUIDS.coach } };
  const res = mockRes();

  await handlers.listClients(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.clients[0].active_program, null);
});

test("clientOverview returns client, active_program, and summary fields", async () => {
  let call = 0;
  const handlers = createCoachPortalHandlers({
    async query() {
      call += 1;
      if (call === 1) {
        return {
          rows: [{
            client_user_id: UUIDS.client,
            display_name: "Athlete One",
            fitness_level_slug: "intermediate",
            main_goals_slugs: ["strength"],
          }],
        };
      }
      if (call === 2) {
        return {
          rows: [{
            program_id: UUIDS.program,
            program_title: "Strength",
            program_type: "strength",
            weeks_count: 8,
            days_per_week: 3,
            status: "active",
          }],
        };
      }
      return {
        rows: [{
          last_session_date: "2026-04-10",
          completed_sessions: 6,
          total_sessions: 10,
        }],
      };
    },
  });
  const req = { params: { client_user_id: UUIDS.client } };
  const res = mockRes();

  await handlers.clientOverview(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.client.display_name, "Athlete One");
  assert.equal(res.body.active_program.program_id, UUIDS.program);
  assert.equal(res.body.summary.completion_ratio, 0.6);
});

test("clientDecisions returns newest first and respects limit", async () => {
  const captured = [];
  const handlers = createCoachPortalHandlers({
    async query(sql, params) {
      captured.push({ sql, params });
      return {
        rows: [
          {
            id: UUIDS.decisionB,
            program_id: UUIDS.program,
            program_exercise_id: UUIDS.programExercise,
            exercise_id: "bb_bench_press",
            exercise_name: "Bench Press",
            program_title: "Strength",
            week_number: 3,
            day_number: 1,
            decision_outcome: "increase_load",
            confidence: "high",
            recommended_load_delta_kg: 2.5,
            decision_context_json: { reasons: ["Fast reps"] },
            decided_at: "2026-04-12T10:00:00Z",
          },
          {
            id: UUIDS.decisionA,
            program_id: UUIDS.program,
            program_exercise_id: UUIDS.programExercise,
            exercise_id: "bb_bench_press",
            exercise_name: "Bench Press",
            program_title: "Strength",
            week_number: 2,
            day_number: 1,
            decision_outcome: "hold",
            confidence: "medium",
            recommended_load_delta_kg: null,
            decision_context_json: { reasons: ["Need another session"] },
            decided_at: "2026-04-10T10:00:00Z",
          },
        ],
      };
    },
  });
  const req = {
    params: { client_user_id: UUIDS.client },
    query: { limit: "5", program_id: UUIDS.program },
  };
  const res = mockRes();

  await handlers.clientDecisions(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.rows.length, 2);
  assert.equal(res.body.rows[0].id, UUIDS.decisionB);
  assert.equal(res.body.rows[0].display_label, "Week 3 — Added 2.5 kg");
  assert.equal(captured[0].params[1], UUIDS.program);
  assert.equal(captured[0].params.includes(5), true);
});

test("recentSessions includes completed_at timestamp", async () => {
  const handlers = createCoachPortalHandlers({
    async query() {
      return {
        rows: [
          {
            id: "99999999-9999-4999-8999-999999999999",
            program_id: UUIDS.program,
            program_title: "Strength",
            scheduled_date: "2026-04-12",
            week_number: 3,
            day_number: 1,
            is_completed: true,
            session_duration_mins: 60,
            completed_at: "2026-04-12T10:00:00Z",
          },
        ],
      };
    },
  });
  const req = { params: { client_user_id: UUIDS.client }, query: { limit: "10" } };
  const res = mockRes();

  await handlers.recentSessions(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sessions[0].completed_at, "2026-04-12T10:00:00Z");
});

test("createProgressionOverride returns 201 for valid next_session_load override", async () => {
  let call = 0;
  const handlers = createCoachPortalHandlers({
    async query() {
      call += 1;
      if (call === 1) {
        return {
          rows: [{
            id: UUIDS.programExercise,
            exercise_id: "bb_back_squat",
            purpose: "main",
            program_id: UUIDS.program,
            program_type: "strength",
          }],
        };
      }
      return { rows: [{ id: UUIDS.relationship, status: "pending" }] };
    },
  });
  const req = {
    auth: { user_id: UUIDS.coach },
    params: { client_user_id: UUIDS.client },
    body: {
      program_exercise_id: UUIDS.programExercise,
      override_kind: "next_session_load",
      override_payload: { recommended_load_kg: 105 },
      reason_text: "Coach adjustment",
    },
  };
  const res = mockRes();

  await handlers.createProgressionOverride(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.override_id, UUIDS.relationship);
});

test("createProgressionOverride rejects invalid override_kind", async () => {
  const handlers = createCoachPortalHandlers({ async query() { return { rows: [] }; } });
  const req = {
    auth: { user_id: UUIDS.coach },
    params: { client_user_id: UUIDS.client },
    body: {
      program_exercise_id: UUIDS.programExercise,
      override_kind: "bad_kind",
      override_payload: {},
    },
  };
  const res = mockRes();

  await handlers.createProgressionOverride(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 400);
});

test("createProgressionOverride rejects program_exercise_id from another user", async () => {
  const handlers = createCoachPortalHandlers({
    async query() {
      return { rows: [] };
    },
  });
  const req = {
    auth: { user_id: UUIDS.coach },
    params: { client_user_id: UUIDS.client },
    body: {
      program_exercise_id: UUIDS.programExercise,
      override_kind: "next_session_load",
      override_payload: {},
    },
  };
  const res = mockRes();

  await handlers.createProgressionOverride(req, res, (err) => { throw err; });

  assert.equal(res.statusCode, 403);
});

test("listCoaches returns only coach-role users", async () => {
  const handlers = createAdminCoachesHandlers({
    async query() {
      return {
        rows: [{
          id: UUIDS.coach,
          email: "coach@example.com",
          role: "coach",
          active_client_count: 2,
        }],
      };
    },
  });
  const res = mockRes();

  await handlers.listCoaches({}, res, (err) => { throw err; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.coaches.length, 1);
  assert.equal(res.body.coaches[0].role, "coach");
});

test("patchUserRole promotes a user to coach and rejects invalid role", async () => {
  const handlers = createAdminCoachesHandlers({
    async query() {
      return {
        rows: [{ id: UUIDS.client, email: "athlete@example.com", role: "coach" }],
      };
    },
  });

  const okRes = mockRes();
  await handlers.patchUserRole(
    { params: { user_id: UUIDS.client }, body: { role: "coach" } },
    okRes,
    (err) => { throw err; },
  );
  assert.equal(okRes.statusCode, 200);
  assert.equal(okRes.body.user.role, "coach");

  const badRes = mockRes();
  await handlers.patchUserRole(
    { params: { user_id: UUIDS.client }, body: { role: "supercoach" } },
    badRes,
    (err) => { throw err; },
  );
  assert.equal(badRes.statusCode, 400);
});

test("linkCoachClient creates active relationship and reports duplicate conflicts", async () => {
  let call = 0;
  const duplicateError = new Error("duplicate");
  duplicateError.code = "23505";

  const handlers = createAdminCoachesHandlers({
    async query() {
      call += 1;
      if (call === 1) return { rows: [{ role: "coach" }] };
      if (call === 2) return { rows: [{ id: UUIDS.relationship, status: "active" }] };
      if (call === 3) return { rows: [{ role: "coach" }] };
      throw duplicateError;
    },
  });

  const okRes = mockRes();
  await handlers.linkCoachClient(
    { params: { coach_user_id: UUIDS.coach, client_user_id: UUIDS.client } },
    okRes,
    (err) => { throw err; },
  );
  assert.equal(okRes.statusCode, 201);

  const conflictRes = mockRes();
  await handlers.linkCoachClient(
    { params: { coach_user_id: UUIDS.coach, client_user_id: UUIDS.otherClient } },
    conflictRes,
    (err) => { throw err; },
  );
  assert.equal(conflictRes.statusCode, 409);
});

test("revokeCoachClient revokes active relationship and returns 404 when missing", async () => {
  let call = 0;
  const handlers = createAdminCoachesHandlers({
    async query() {
      call += 1;
      if (call === 1) return { rows: [{ id: UUIDS.relationship }] };
      return { rows: [] };
    },
  });

  const okRes = mockRes();
  await handlers.revokeCoachClient(
    { params: { coach_user_id: UUIDS.coach, client_user_id: UUIDS.client } },
    okRes,
    (err) => { throw err; },
  );
  assert.equal(okRes.statusCode, 200);

  const missingRes = mockRes();
  await handlers.revokeCoachClient(
    { params: { coach_user_id: UUIDS.coach, client_user_id: UUIDS.otherClient } },
    missingRes,
    (err) => { throw err; },
  );
  assert.equal(missingRes.statusCode, 404);
});
