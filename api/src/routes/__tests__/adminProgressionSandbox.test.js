import test from "node:test";
import assert from "node:assert/strict";
import { createProgressionSandboxHandler } from "../adminProgressionSandbox.js";

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

function mockReq(body) {
  return { body };
}

function createDbMock({ exerciseRow = null } = {}) {
  return {
    async query(sql, params) {
      if (sql.includes("FROM exercise_catalogue")) {
        if (!exerciseRow) return { rows: [], rowCount: 0 };
        return { rows: [exerciseRow], rowCount: 1 };
      }
      if (sql.includes("FROM program_generation_config")) {
        return {
          rows: [{
            config_key: `${params?.[0] ?? "strength"}_default_v1`,
            program_generation_config_json: {
              progression: {
                slot_profile_map: {
                  strength: { main: "strength_main", secondary: "strength_secondary", accessory: "strength_accessory" },
                  hypertrophy: { main: "hypertrophy_main", secondary: "hypertrophy_secondary", accessory: "hypertrophy_accessory" },
                },
                lever_profiles: {
                  strength_main: {
                    priority_order: ["load", "reps", "hold", "deload"],
                    load_increment_profile: "barbell_strength",
                    deload_profile: "strength_local",
                  },
                  hypertrophy_main: {
                    priority_order: ["reps", "load", "hold", "deload"],
                    load_increment_profile: "compound_moderate",
                    deload_profile: "standard_local",
                  },
                },
              },
            },
            progression_by_rank_json: {
              intermediate: {
                evidence_requirement_multiplier: 1,
                rir_progress_gate_offset: 0,
                load_increment_scale: 1,
              },
            },
          }],
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

test("valid strength request at top of rep range returns increase_load", async () => {
  const handler = createProgressionSandboxHandler(createDbMock({
    exerciseRow: { is_loadable: true, equipment_items_slugs: ["barbell", "rack"] },
  }));
  const res = mockRes();

  await handler(mockReq({
    program_type: "strength",
    fitness_rank: 1,
    exercise_id: "bb_back_squat",
    purpose: "main",
    reps_prescribed: "4-6",
    intensity_prescription: "2 RIR",
    history: [
      { weight_kg: 100, reps_completed: 6, rir_actual: 3 },
      { weight_kg: 100, reps_completed: 6, rir_actual: 2.5 },
    ],
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, "increase_load");
  assert.equal(res.body.recommended_load_kg, 105);
});

test("valid hypertrophy request below top of range returns increase_reps", async () => {
  const handler = createProgressionSandboxHandler(createDbMock({
    exerciseRow: { is_loadable: true, equipment_items_slugs: ["dumbbells"] },
  }));
  const res = mockRes();

  await handler(mockReq({
    program_type: "hypertrophy",
    fitness_rank: 1,
    exercise_id: "db_bench_press",
    purpose: "main",
    reps_prescribed: "8-10",
    intensity_prescription: "2 RIR",
    history: [
      { weight_kg: 30, reps_completed: 9, rir_actual: 2.5 },
    ],
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, "increase_reps");
  assert.equal(res.body.recommended_reps_target, 10);
});

test("two underperformance exposures return deload_local", async () => {
  const handler = createProgressionSandboxHandler(createDbMock({
    exerciseRow: { is_loadable: true, equipment_items_slugs: ["barbell"] },
  }));
  const res = mockRes();

  await handler(mockReq({
    program_type: "strength",
    fitness_rank: 1,
    exercise_id: "bb_back_squat",
    purpose: "main",
    reps_prescribed: "4-6",
    intensity_prescription: "2 RIR",
    history: [
      { weight_kg: 100, reps_completed: 3, rir_actual: 0.5 },
      { weight_kg: 100, reps_completed: 3, rir_actual: 0 },
    ],
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, "deload_local");
});

test("on-target exposures return hold", async () => {
  const handler = createProgressionSandboxHandler(createDbMock({
    exerciseRow: { is_loadable: true, equipment_items_slugs: ["barbell"] },
  }));
  const res = mockRes();

  await handler(mockReq({
    program_type: "strength",
    fitness_rank: 1,
    exercise_id: "bb_back_squat",
    purpose: "main",
    reps_prescribed: "4-6",
    intensity_prescription: "2 RIR",
    history: [
      { weight_kg: 100, reps_completed: 5, rir_actual: 2 },
      { weight_kg: 100, reps_completed: 5, rir_actual: 2 },
    ],
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, "increase_reps");
});

test("conditioning returns not_applicable", async () => {
  const handler = createProgressionSandboxHandler(createDbMock({
    exerciseRow: { is_loadable: true, equipment_items_slugs: ["treadmill"] },
  }));
  const res = mockRes();

  await handler(mockReq({
    program_type: "conditioning",
    fitness_rank: 1,
    exercise_id: "run_interval",
    purpose: "main",
    reps_prescribed: "30-60",
    intensity_prescription: "2 RIR",
    history: [
      { weight_kg: 100, reps_completed: 5, rir_actual: 2 },
    ],
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.outcome, "not_applicable");
});

test("missing reps_prescribed returns 400", async () => {
  const handler = createProgressionSandboxHandler(createDbMock());
  const res = mockRes();

  await handler(mockReq({
    program_type: "strength",
    fitness_rank: 1,
    purpose: "main",
    intensity_prescription: "2 RIR",
    history: [{ weight_kg: 100, reps_completed: 5, rir_actual: 2 }],
  }), res);

  assert.equal(res.statusCode, 400);
});

test("fitness_rank outside range returns 400", async () => {
  const handler = createProgressionSandboxHandler(createDbMock());
  const res = mockRes();

  await handler(mockReq({
    program_type: "strength",
    fitness_rank: 5,
    purpose: "main",
    reps_prescribed: "4-6",
    intensity_prescription: "2 RIR",
    history: [{ weight_kg: 100, reps_completed: 5, rir_actual: 2 }],
  }), res);

  assert.equal(res.statusCode, 400);
});

test("empty history returns 400", async () => {
  const handler = createProgressionSandboxHandler(createDbMock());
  const res = mockRes();

  await handler(mockReq({
    program_type: "strength",
    fitness_rank: 1,
    purpose: "main",
    reps_prescribed: "4-6",
    intensity_prescription: "2 RIR",
    history: [],
  }), res);

  assert.equal(res.statusCode, 400);
});

test("history entry missing reps_completed returns 400", async () => {
  const handler = createProgressionSandboxHandler(createDbMock());
  const res = mockRes();

  await handler(mockReq({
    program_type: "strength",
    fitness_rank: 1,
    purpose: "main",
    reps_prescribed: "4-6",
    intensity_prescription: "2 RIR",
    history: [{ weight_kg: 100, rir_actual: 2 }],
  }), res);

  assert.equal(res.statusCode, 400);
});

test("valid request returns evidence shape", async () => {
  const handler = createProgressionSandboxHandler(createDbMock({
    exerciseRow: { is_loadable: true, equipment_items_slugs: ["barbell"] },
  }));
  const res = mockRes();

  await handler(mockReq({
    program_type: "strength",
    fitness_rank: 1,
    exercise_id: "bb_back_squat",
    purpose: "main",
    reps_prescribed: "4-6",
    intensity_prescription: "2 RIR",
    history: [
      { weight_kg: 100, reps_completed: 6, rir_actual: 3 },
      { weight_kg: 100, reps_completed: 6, rir_actual: 2.5 },
    ],
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.evidence.target_low, 4);
  assert.equal(res.body.evidence.target_high, 6);
  assert.equal(res.body.evidence.required_rir, 2);
});

test("valid request surfaces config_used profile name", async () => {
  const handler = createProgressionSandboxHandler(createDbMock({
    exerciseRow: { is_loadable: true, equipment_items_slugs: ["barbell"] },
  }));
  const res = mockRes();

  await handler(mockReq({
    program_type: "strength",
    fitness_rank: 1,
    exercise_id: "bb_back_squat",
    purpose: "main",
    reps_prescribed: "4-6",
    intensity_prescription: "2 RIR",
    history: [
      { weight_kg: 100, reps_completed: 6, rir_actual: 3 },
    ],
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.config_used.profile_name, "strength_main");
  assert.equal(res.body.config_used.rank_key, "intermediate");
});
