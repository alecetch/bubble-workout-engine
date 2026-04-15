import test from "node:test";
import assert from "node:assert/strict";
import { createGenerateProgramV2Handler } from "../src/routes/generateProgramV2.js";

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

function baseProfile() {
  return {
    id: "profile-1",
    fitnessLevel: "intermediate",
    equipmentItemCodes: ["barbell"],
    injuryFlags: [],
    preferredDays: ["Mon", "Wed", "Fri"],
    goals: ["strength"],
    minutesPerSession: 60,
    heightCm: null,
    weightKg: null,
    equipmentPreset: "commercial_gym",
    goalNotes: "",
    scheduleConstraints: "",
    programType: "strength",
  };
}

test("generate-plan-v2 returns 409 for duplicate active program type", async () => {
  const setupCalls = [];
  const db = {
    async connect() {
      return {
        async query(sql, params) {
          setupCalls.push({ sql, params });
          if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
          if (sql.includes("information_schema.columns") && sql.includes("column_name = 'program_type'")) {
            return { rows: [{ "?column?": 1 }], rowCount: 1 };
          }
          if (sql.includes("INSERT INTO app_user")) {
            return { rows: [{ id: "user-uuid" }], rowCount: 1 };
          }
          if (sql.includes("SELECT column_name") && sql.includes("injury_flags")) {
            return { rows: [{ column_name: "injury_flags" }], rowCount: 1 };
          }
          if (sql.includes("SELECT id") && sql.includes("program_type")) {
            return { rows: [{ id: "existing-program" }], rowCount: 1 };
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        },
        release() {},
      };
    },
  };

  const handler = createGenerateProgramV2Handler({
    db,
    getProfileByUser: async () => baseProfile(),
    getAllowed: async () => [],
    buildInputs: () => ({}),
  });
  const req = {
    request_id: "req-1",
    body: { user_id: "subject-1", programType: "strength", anchor_date_ms: Date.now() },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "conflict_active_program_same_type");
  assert.equal(setupCalls.some((call) => call.sql === "ROLLBACK"), true);
});

test("generate-plan-v2 sets new different-type program as secondary when primary exists", async () => {
  const directCalls = [];
  const setupClient = {
    async query(sql, params) {
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [], rowCount: 0 };
      if (sql.includes("information_schema.columns") && sql.includes("column_name = 'program_type'")) {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO app_user")) {
        return { rows: [{ id: "user-uuid" }], rowCount: 1 };
      }
      if (sql.includes("SELECT column_name") && sql.includes("injury_flags")) {
        return { rows: [{ column_name: "injury_flags" }], rowCount: 1 };
      }
      if (sql.includes("SELECT id") && sql.includes("program_type")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("UPDATE client_profile")) {
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SELECT") && sql.includes("FROM exercise_catalogue")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("INSERT INTO program (")) {
        return { rows: [{ id: "new-program" }], rowCount: 1 };
      }
      if (sql.includes("INSERT INTO generation_run")) {
        return { rows: [{ id: "run-1" }], rowCount: 1 };
      }
      throw new Error(`Unexpected setup SQL: ${sql}`);
    },
    release() {},
  };
  const db = {
    async connect() {
      return setupClient;
    },
    async query(sql, params) {
      directCalls.push({ sql, params });
      if (sql.includes("information_schema.columns") && sql.includes("column_name = 'program_type'")) {
        return { rows: [{ "?column?": 1 }], rowCount: 1 };
      }
      if (sql.includes("UPDATE generation_run SET last_stage='pipeline'")) return { rows: [], rowCount: 1 };
      if (sql.includes("UPDATE generation_run SET")) return { rows: [], rowCount: 1 };
      if (sql.includes("SELECT pcd_new.scheduled_date::text AS conflict_date")) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SELECT id") && sql.includes("is_primary = TRUE")) {
        return { rows: [{ id: "primary-program" }], rowCount: 1 };
      }
      if (sql.includes("UPDATE program SET")) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };

  const handler = createGenerateProgramV2Handler({
    db,
    getProfileByUser: async () => ({ ...baseProfile(), goals: ["conditioning"], programType: "conditioning" }),
    getAllowed: async () => [],
    buildInputs: () => ({}),
    pipeline: async () => ({
      rows: [{
        row_type: "PRG",
        program_title: "Conditioning Program",
        program_summary: "Summary",
        weeks_count: 1,
        days_per_week: 3,
        program_outline_json: {},
        start_date: "2026-05-01",
        start_offset_days: 0,
        start_weekday: "thu",
        preferred_days_sorted_json: ["tue", "thu", "sat"],
      }],
      program: { weeks: [], hero_media_id: null },
      debug: { step1: {}, step5: {}, step6: {} },
    }),
    emitPayload: async () => ({
      counts: { days: 0 },
      idempotent: false,
      prg_data: {
        program_title: "Conditioning Program",
        program_summary: "Summary",
        weeks_count: 1,
        days_per_week: 3,
        program_outline_json: {},
        start_date: "2026-05-01",
        start_offset_days: 0,
        start_weekday: "thu",
        preferred_days_sorted_json: ["tue", "thu", "sat"],
      },
    }),
    ensureCalendar: async () => {},
    progressionService: { async applyProgressionRecommendations() { return null; } },
  });
  const req = {
    request_id: "req-2",
    body: { user_id: "subject-2", programType: "conditioning", anchor_date_ms: Date.now() },
    log: { debug() {}, info() {}, warn() {}, error() {} },
  };
  const res = mockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  const programUpdateCall = directCalls.find((call) => call.sql.includes("UPDATE program SET"));
  assert.ok(programUpdateCall);
  assert.equal(programUpdateCall.params.includes(false), true);
});
