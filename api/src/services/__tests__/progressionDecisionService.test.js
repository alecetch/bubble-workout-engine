import test from "node:test";
import assert from "node:assert/strict";
import { getDaysSinceLastTraining, buildExposures, markTrust, applyJumpCap, resolveLayoffAdjustment, makeProgressionDecisionService } from "../progressionDecisionService.js";

function createDbMock() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("FROM program_generation_config")) {
        return {
          rows: [{
            config_key: "strength_default_v1",
            program_generation_config_json: {
              progression: {
                lever_profiles: {
                  strength_main: {
                    priority_order: ["load", "reps", "hold", "deload"],
                    load_increment_profile: "barbell_strength",
                    deload_profile: "strength_local",
                  },
                },
                slot_profile_map: {
                  strength: { main: "strength_main" },
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
      if (sql.includes("FROM program_exercise pe") && sql.includes("JOIN program_day pd")) {
        return {
          rows: [{
            program_exercise_id: "pe-1",
            program_day_id: "pd-1",
            exercise_id: "bb_back_squat",
            exercise_name: "Back Squat",
            purpose: "main",
            sets_prescribed: 4,
            reps_prescribed: "5",
            reps_unit: "reps",
            intensity_prescription: "~2 RIR",
            rest_seconds: 180,
            is_loadable: true,
            week_number: 1,
            day_number: 1,
            global_day_index: 1,
            equipment_items_slugs: ["barbell"],
            movement_class: "compound",
            movement_pattern_primary: "squat",
          }],
        };
      }
      if (sql.includes("FROM segment_exercise_log sel")) {
        return {
          rows: [
            {
              log_id: "log-2", program_day_id: "session-log-2", order_index: 1, created_at: "2026-04-02T12:00:00Z",
              exercise_id: "bb_back_squat",
              purpose: "main",
              weight_kg: 100,
              reps_completed: 5,
              rir_actual: 2.5,
              exposure_date: "2026-04-01",
            },
            {
              log_id: "log-1", program_day_id: "session-log-1", order_index: 1, created_at: "2026-04-01T12:00:00Z",
              exercise_id: "bb_back_squat",
              purpose: "main",
              weight_kg: 100,
              reps_completed: 5,
              rir_actual: 2,
              exposure_date: "2026-03-25",
            },
          ],
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

test("buildDecision recommends load progression for successful strength history", () => {
  const service = makeProgressionDecisionService({ query: async () => ({ rows: [] }) });
  const decision = service._test.buildDecision({
    row: {
      exercise_id: "bb_back_squat",
      purpose: "main",
      reps_prescribed: "5",
      intensity_prescription: "~2 RIR",
      is_loadable: true,
      equipment_items_slugs: ["barbell"],
    },
    programType: "strength",
    profileName: "strength_main",
    profile: { deload_profile: "strength_local", load_increment_profile: "barbell_strength" },
    rankOverride: { evidence_requirement_multiplier: 1, rir_progress_gate_offset: 0, load_increment_scale: 1 },
    history: [
      { log_id: "a", program_day_id: "session-a", order_index: 1, created_at: "2026-04-02T12:00:00Z", weight_kg: 100, reps_completed: 5, rir_actual: 2.5 },
      { log_id: "b", program_day_id: "session-b", order_index: 1, created_at: "2026-04-01T12:00:00Z", weight_kg: 100, reps_completed: 5, rir_actual: 2.0 },
    ],
    config: service._test.makeDefaultProgressionConfig("strength"),
  });

  assert.equal(decision.outcome, "increase_load");
  assert.equal(decision.primary_lever, "load");
  assert.equal(decision.recommended_load_kg, 105);
});

test("buildDecision recommends hypertrophy rep progression before load", () => {
  const service = makeProgressionDecisionService({ query: async () => ({ rows: [] }) });
  const decision = service._test.buildDecision({
    row: {
      exercise_id: "db_bench_press",
      purpose: "main",
      reps_prescribed: "8-10",
      intensity_prescription: "~2 RIR",
      is_loadable: true,
      equipment_items_slugs: ["dumbbells"],
    },
    programType: "hypertrophy",
    profileName: "hypertrophy_main",
    profile: { deload_profile: "standard_local", load_increment_profile: "compound_moderate" },
    rankOverride: { evidence_requirement_multiplier: 1, rir_progress_gate_offset: 0, load_increment_scale: 1 },
    history: [
      { log_id: "a", program_day_id: "session-a", order_index: 1, created_at: "2026-04-02T12:00:00Z", weight_kg: 30, reps_completed: 9, rir_actual: 2.5 },
    ],
    config: service._test.makeDefaultProgressionConfig("hypertrophy"),
  });

  assert.equal(decision.outcome, "increase_reps");
  assert.equal(decision.recommended_reps_target, 10);
});

test("buildDecision uses purpose-matched exact history only", () => {
  const service = makeProgressionDecisionService({ query: async () => ({ rows: [] }) });
  const decision = service._test.buildDecision({
    row: {
      exercise_id: "bb_back_squat",
      purpose: "main",
      reps_prescribed: "5",
      intensity_prescription: "~2 RIR",
      is_loadable: true,
      equipment_items_slugs: ["barbell"],
    },
    programType: "strength",
    profileName: "strength_main",
    profile: { deload_profile: "strength_local", load_increment_profile: "barbell_strength" },
    rankOverride: { evidence_requirement_multiplier: 1, rir_progress_gate_offset: 0, load_increment_scale: 1 },
    history: [],
    config: service._test.makeDefaultProgressionConfig("strength"),
  });

  assert.equal(decision, null);
});

test("mergeProgressionConfig accepts camelCase progression keys and deep-merges profile overrides", () => {
  const service = makeProgressionDecisionService({ query: async () => ({ rows: [] }) });
  const defaults = service._test.makeDefaultProgressionConfig("strength");
  const merged = service._test.mergeProgressionConfig(defaults, {
    progression: {
      slotProfileMap: {
        strength: { main: "strength_main" },
      },
      leverProfiles: {
        strength_main: {
          load_increment_profile: "micro_strength",
        },
      },
      loadIncrementProfiles: {
        micro_strength: {
          default_rounding_kg: 1.25,
          bands: [{ min_load_kg: 0, increment_kg: 1.25 }],
        },
      },
      deloadRules: {
        strength_local: {
          response: { load_drop_pct: 7.5 },
        },
      },
    },
  });

  assert.equal(merged.slot_profile_map.strength.main, "strength_main");
  assert.equal(merged.lever_profiles.strength_main.priority_order[0], "load");
  assert.equal(merged.lever_profiles.strength_main.load_increment_profile, "micro_strength");
  assert.equal(merged.load_increment_profiles.micro_strength.default_rounding_kg, 1.25);
  assert.equal(merged.deload_rules.strength_local.underperformance_exposure_threshold, 2);
  assert.equal(merged.deload_rules.strength_local.response.load_drop_pct, 7.5);
});

test("applyProgressionRecommendations updates program exercises and persists decisions", async () => {
  const db = createDbMock();
  const service = makeProgressionDecisionService(db);

  const result = await service.applyProgressionRecommendations({
    programId: "program-1",
    userId: "user-1",
    programType: "strength",
    fitnessRank: 1,
  });

  assert.equal(result.updated, 1);
  assert.equal(result.decisions[0].outcome, "increase_load");
  assert.ok(db.calls.some((call) => call.sql.includes("INSERT INTO exercise_progression_state")));
  const historyQuery = db.calls.find((call) => call.sql.includes("pd.is_completed = TRUE"));
  const stateInsert = db.calls.find((call) => call.sql.includes("INSERT INTO exercise_progression_state"));
  assert.match(historyQuery.sql, /pd\.is_completed = TRUE/);
  assert.match(historyQuery.sql, /max\(sel\.created_at\) OVER \(PARTITION BY sel\.program_day_id\) DESC/);
  assert.match(historyQuery.sql, /sel\.order_index ASC, sel\.created_at ASC/);
  assert.doesNotMatch(historyQuery.sql, /scheduled_date/);
  assert.match(stateInsert.sql, /COALESCE\(exercise_progression_state\.progress_streak, 0\) \+ 1/);
  assert.match(stateInsert.sql, /COALESCE\(exercise_progression_state\.underperformance_streak, 0\) \+ 1/);
  assert.ok(db.calls.some((call) => call.sql.includes("UPDATE program_exercise")));
  assert.ok(db.calls.some((call) => call.sql.includes("INSERT INTO exercise_progression_decision")));
});

test("applyProgressionRecommendations clears stale progression fields and updates all future matching exposures", async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("FROM program_generation_config")) {
        return {
          rows: [{
            config_key: "strength_default_v1",
            program_generation_config_json: {
              progression: {
                lever_profiles: {
                  strength_main: {
                    priority_order: ["load", "reps", "hold", "deload"],
                    load_increment_profile: "barbell_strength",
                    deload_profile: "strength_local",
                  },
                },
                slot_profile_map: {
                  strength: { main: "strength_main" },
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
      if (sql.includes("FROM program_exercise pe") && sql.includes("JOIN program_day pd")) {
        return {
          rows: [
            {
              program_exercise_id: "pe-1",
              program_day_id: "pd-1",
              exercise_id: "bb_back_squat",
              exercise_name: "Back Squat",
              purpose: "main",
              sets_prescribed: 4,
              reps_prescribed: "5",
              reps_unit: "reps",
              intensity_prescription: "~2 RIR",
              rest_seconds: 180,
              is_loadable: true,
              week_number: 1,
              day_number: 1,
              global_day_index: 1,
              equipment_items_slugs: ["barbell"],
              movement_class: "compound",
              movement_pattern_primary: "squat",
            },
            {
              program_exercise_id: "pe-2",
              program_day_id: "pd-2",
              exercise_id: "bb_back_squat",
              exercise_name: "Back Squat",
              purpose: "main",
              sets_prescribed: 4,
              reps_prescribed: "5",
              reps_unit: "reps",
              intensity_prescription: "~2 RIR",
              rest_seconds: 180,
              is_loadable: true,
              week_number: 2,
              day_number: 1,
              global_day_index: 8,
              equipment_items_slugs: ["barbell"],
              movement_class: "compound",
              movement_pattern_primary: "squat",
            },
            {
              program_exercise_id: "pe-3",
              program_day_id: "pd-3",
              exercise_id: "bb_back_squat",
              exercise_name: "Back Squat",
              purpose: "main",
              sets_prescribed: 4,
              reps_prescribed: "5",
              reps_unit: "reps",
              intensity_prescription: "~2 RIR",
              rest_seconds: 180,
              is_loadable: true,
              week_number: 3,
              day_number: 1,
              global_day_index: 15,
              equipment_items_slugs: ["barbell"],
              movement_class: "compound",
              movement_pattern_primary: "squat",
            },
          ],
        };
      }
      if (sql.includes("FROM segment_exercise_log sel")) {
        return {
          rows: [
            {
              log_id: "log-2", program_day_id: "session-log-2", order_index: 1, created_at: "2026-04-02T12:00:00Z",
              exercise_id: "bb_back_squat",
              purpose: "main",
              weight_kg: 100,
              reps_completed: 5,
              rir_actual: 2.5,
              exposure_date: "2026-04-01",
            },
          ],
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const service = makeProgressionDecisionService(db);
  const result = await service.applyProgressionRecommendations({
    programId: "program-1",
    userId: "user-1",
    programType: "strength",
    fitnessRank: 1,
    completedProgramDayId: "pd-1",
  });

  assert.equal(result.updated, 1);
  const clearCall = calls.find((call) => call.sql.includes("SET") && call.sql.includes("progression_outcome = NULL"));
  assert.ok(clearCall);
  const updateCalls = calls.filter((call) => call.sql.includes("UPDATE program_exercise"));
  assert.equal(updateCalls.length, 2);
  const targetedUpdate = updateCalls.find((call) => Array.isArray(call.params?.[0]));
  assert.ok(targetedUpdate);
  assert.deepEqual(targetedUpdate.params[0], ["pe-2", "pe-3"]);
  assert.equal(updateCalls.some((call) => call.params?.[0] === "pe-1"), false);
});

test("applyProgressionRecommendations does not borrow history from a different purpose", async () => {
  const db = {
    async query(sql) {
      if (sql.includes("FROM program_generation_config")) {
        return {
          rows: [{
            config_key: "strength_default_v1",
            program_generation_config_json: {
              progression: {
                lever_profiles: {
                  strength_main: {
                    priority_order: ["load", "reps", "hold", "deload"],
                    load_increment_profile: "barbell_strength",
                    deload_profile: "strength_local",
                  },
                },
                slot_profile_map: {
                  strength: { main: "strength_main" },
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
      if (sql.includes("FROM program_exercise pe") && sql.includes("JOIN program_day pd")) {
        return {
          rows: [{
            program_exercise_id: "pe-1",
            program_day_id: "pd-1",
            exercise_id: "bb_back_squat",
            exercise_name: "Back Squat",
            purpose: "main",
            sets_prescribed: 4,
            reps_prescribed: "5",
            reps_unit: "reps",
            intensity_prescription: "~2 RIR",
            rest_seconds: 180,
            is_loadable: true,
            week_number: 1,
            day_number: 1,
            global_day_index: 1,
            equipment_items_slugs: ["barbell"],
            movement_class: "compound",
            movement_pattern_primary: "squat",
          }],
        };
      }
      if (sql.includes("FROM segment_exercise_log sel")) {
        return {
          rows: [{
            log_id: "log-1", program_day_id: "session-log-1", order_index: 1, created_at: "2026-04-01T12:00:00Z",
            exercise_id: "bb_back_squat",
            purpose: "accessory",
            weight_kg: 100,
            reps_completed: 5,
            rir_actual: 3,
            exposure_date: "2026-04-01",
          }],
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const service = makeProgressionDecisionService(db);
  const result = await service.applyProgressionRecommendations({
    programId: "program-1",
    userId: "user-1",
    programType: "strength",
    fitnessRank: 1,
  });

  assert.equal(result.updated, 0);
  assert.equal(result.decisions.length, 0);
});

test("applyProgressionRecommendations seeds all matching occurrences in a newly generated program", async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("FROM program_generation_config")) {
        return {
          rows: [{
            config_key: "hypertrophy_default_v1",
            program_generation_config_json: {
              progression: {
                lever_profiles: {
                  hypertrophy_main: {
                    priority_order: ["reps", "load", "hold", "deload"],
                    load_increment_profile: "compound_moderate",
                    deload_profile: "standard_local",
                  },
                },
                slot_profile_map: {
                  hypertrophy: { main: "hypertrophy_main" },
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
      if (sql.includes("FROM program_exercise pe") && sql.includes("JOIN program_day pd")) {
        return {
          rows: [
            {
              program_exercise_id: "pe-1",
              program_day_id: "pd-1",
              exercise_id: "bb_back_squat",
              exercise_name: "Back Squat",
              purpose: "main",
              sets_prescribed: 5,
              reps_prescribed: "8-10",
              reps_unit: "reps",
              intensity_prescription: "~2 RIR",
              rest_seconds: 180,
              is_loadable: true,
              week_number: 1,
              day_number: 1,
              global_day_index: 1,
              equipment_items_slugs: ["barbell"],
              movement_class: "compound",
              movement_pattern_primary: "squat",
            },
            {
              program_exercise_id: "pe-2",
              program_day_id: "pd-2",
              exercise_id: "bb_back_squat",
              exercise_name: "Back Squat",
              purpose: "main",
              sets_prescribed: 5,
              reps_prescribed: "8-10",
              reps_unit: "reps",
              intensity_prescription: "~2 RIR",
              rest_seconds: 180,
              is_loadable: true,
              week_number: 2,
              day_number: 1,
              global_day_index: 8,
              equipment_items_slugs: ["barbell"],
              movement_class: "compound",
              movement_pattern_primary: "squat",
            },
          ],
        };
      }
      if (sql.includes("FROM segment_exercise_log sel")) {
        return {
          rows: [
            {
              log_id: "log-1", program_day_id: "session-log-1", order_index: 1, created_at: "2026-04-01T12:00:00Z",
              exercise_id: "bb_back_squat",
              purpose: "main",
              weight_kg: 100,
              reps_completed: 9,
              rir_actual: 2,
              exposure_date: "2026-04-01",
            },
          ],
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const service = makeProgressionDecisionService(db);
  const result = await service.applyProgressionRecommendations({
    programId: "program-2",
    userId: "user-1",
    programType: "hypertrophy",
    fitnessRank: 1,
  });

  assert.equal(result.updated, 1);
  const targetedUpdate = calls.find((call) => call.sql.includes("WHERE id = ANY($1::uuid[])"));
  assert.ok(targetedUpdate);
  assert.deepEqual(targetedUpdate.params[0], ["pe-1", "pe-2"]);
  const decisionInsert = calls.find((call) => call.sql.includes("INSERT INTO exercise_progression_decision"));
  assert.ok(decisionInsert);
  assert.equal(decisionInsert.params[3], "pe-1");
});

test("blank RIR rows are not treated as zero and do not trigger a false deload", async () => {
  const db = {
    async query(sql) {
      if (sql.includes("FROM program_generation_config")) {
        return {
          rows: [{
            config_key: "hypertrophy_default_v1",
            program_generation_config_json: {
              progression: {
                lever_profiles: {
                  hypertrophy_main: {
                    priority_order: ["reps", "load", "hold", "deload"],
                    load_increment_profile: "compound_moderate",
                    deload_profile: "standard_local",
                  },
                },
                slot_profile_map: {
                  hypertrophy: { main: "hypertrophy_main" },
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
      if (sql.includes("FROM program_exercise pe") && sql.includes("JOIN program_day pd")) {
        return {
          rows: [
            {
              program_exercise_id: "pe-1",
              program_day_id: "pd-1",
              exercise_id: "leg_press",
              exercise_name: "Leg Press",
              purpose: "main",
              sets_prescribed: 5,
              reps_prescribed: "6-10",
              reps_unit: "reps",
              intensity_prescription: "~2 RIR",
              rest_seconds: 120,
              is_loadable: true,
              week_number: 1,
              day_number: 1,
              global_day_index: 1,
              equipment_items_slugs: ["machine"],
              movement_class: "compound",
              movement_pattern_primary: "squat",
            },
            {
              program_exercise_id: "pe-2",
              program_day_id: "pd-2",
              exercise_id: "leg_press",
              exercise_name: "Leg Press",
              purpose: "main",
              sets_prescribed: 5,
              reps_prescribed: "6-10",
              reps_unit: "reps",
              intensity_prescription: "~2 RIR",
              rest_seconds: 120,
              is_loadable: true,
              week_number: 2,
              day_number: 1,
              global_day_index: 8,
              equipment_items_slugs: ["machine"],
              movement_class: "compound",
              movement_pattern_primary: "squat",
            },
          ],
        };
      }
      if (sql.includes("FROM segment_exercise_log sel")) {
        return {
          rows: [
            { log_id: "log-5", program_day_id: "session-log-5", order_index: 1, created_at: "2026-04-01T12:00:00Z", exercise_id: "leg_press", purpose: "main", weight_kg: 115, reps_completed: 8, rir_actual: 3, exposure_date: "2026-04-16" },
            { log_id: "log-4", program_day_id: "session-log-4", order_index: 1, created_at: "2026-04-01T12:00:00Z", exercise_id: "leg_press", purpose: "main", weight_kg: 115, reps_completed: 8, rir_actual: null, exposure_date: "2026-04-16" },
            { log_id: "log-3", program_day_id: "session-log-3", order_index: 1, created_at: "2026-04-01T12:00:00Z", exercise_id: "leg_press", purpose: "main", weight_kg: 115, reps_completed: 8, rir_actual: null, exposure_date: "2026-04-16" },
          ],
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };

  const service = makeProgressionDecisionService(db);
  const result = await service.applyProgressionRecommendations({
    programId: "program-1",
    userId: "user-1",
    programType: "hypertrophy",
    fitnessRank: 1,
    completedProgramDayId: "pd-1",
  });

  assert.equal(result.updated, 1);
  assert.equal(result.decisions[0].outcome, "increase_reps");
  assert.equal(result.decisions[0].evidence.latest_rir, 3);
  assert.equal(result.decisions[0].evidence.underperformance_exposures, 0);
});

for (const outcome of ["increase_load", "increase_reps", "deload_local"]) {
  test(`weekly deload holds ${outcome} only on final-week rows`, async () => {
    const base = createDbMock();
    const calls = [];
    const db = { async query(sql, params) {
      calls.push({ sql, params });
      const result = await base.query(sql, params);
      if (sql.includes("FROM program_generation_config")) result.rows[0].progression_by_rank_json.intermediate.deload = { week: 4 };
      if (sql.includes("FROM program_exercise pe") && sql.includes("JOIN program_day pd")) {
        const row = result.rows[0];
        result.rows = [1, 2, 3, 4].map(week => ({ ...row, program_exercise_id: `pe-${week}`, program_day_id: `pd-${week}`, global_day_index: week, week_number: week }));
      }
      if (sql.includes("FROM segment_exercise_log sel")) {
        if (outcome === "increase_reps") result.rows = [{ ...result.rows[0], reps_completed: 4 }];
        if (outcome === "deload_local") result.rows.forEach(row => { row.reps_completed = 1; row.rir_actual = 0; });
      }
      return result;
    } };
    const result = await makeProgressionDecisionService(db).applyProgressionRecommendations({ programId: "p", userId: "u", programType: "strength", fitnessRank: 1, completedProgramDayId: "pd-1" });
    assert.equal(result.decisions[0].outcome, outcome);
    const writes = calls.filter(call => call.sql.includes("WHERE id = ANY($1::uuid[])"));
    const final = writes.find(call => call.params[0].includes("pe-4"));
    const build = writes.find(call => call.params[0].includes("pe-2"));
    assert.ok(final); assert.ok(build);
    if (outcome === "deload_local") {
      assert.equal(final.params[1], outcome);
      assert.ok(final.params[6] < 100);
    } else {
      assert.equal(final.params[1], "hold");
      assert.equal(final.params[6], 100);
      assert.equal(final.params[7], null);
      assert.ok(JSON.parse(final.params[5]).includes("Deload week: keep load steady."));
      assert.equal(build.params[1], outcome);
      if (outcome === "increase_load") assert.equal(build.params[6], 105);
      else assert.equal(build.params[7], 5);
    }
    // Global progression state still records the earned decision, not the deload row hold.
    const state = calls.find(call => call.sql.includes("INSERT INTO exercise_progression_state"));
    assert.equal(state.params[9], outcome);
  });
}

function sessionRows(id, load, reps = [5, 5, 5], day = Number(id)) {
  return reps.map((r, i) => ({ log_id: `${id}-${i}`, program_day_id: String(id), order_index: i + 1,
    created_at: new Date(Date.UTC(2026, 0, day)), weight_kg: load, reps_completed: r, rir_actual: 2 }));
}
function safetyDecision(rows, overrides = {}) {
  const service = makeProgressionDecisionService({});
  const config = service._test.makeDefaultProgressionConfig("strength");
  return service._test.buildDecision({ row: { exercise_id: "squat", purpose: "main", is_loadable: true,
    reps_prescribed: "5", intensity_prescription: "2 RIR", equipment_items_slugs: ["barbell"] },
    profileName: "strength_main", profile: { deload_profile: "strength_local" }, programType: "strength",
    rankOverride: { evidence_requirement_multiplier: 2 }, config, history: rows, ...overrides });
}
test("whole sessions count successes and confidence, not sets", () => {
  const one = safetyDecision(sessionRows(1, 100));
  assert.notEqual(one.outcome, "increase_load");
  assert.equal(one.evidence.sessions_considered, 1); assert.equal(one.confidence_score, 50);
  const three = safetyDecision([1,2,3].flatMap(id => sessionRows(id, 100)));
  assert.equal(three.outcome, "increase_load"); assert.equal(three.evidence.sessions_considered, 3);
});
test("ramp sets do not count as failures and all row permutations agree", () => {
  const rows = sessionRows(1, 100, [1,2,5,5,5]); rows[0].weight_kg = 60; rows[1].weight_kg = 80;
  const exposure = buildExposures(rows)[0];
  assert.equal(exposure.workingLoadKg, 100); assert.equal(exposure.workingSets.length, 3);
  const expected = safetyDecision(rows);
  function permutations(items) { return items.length ? items.flatMap((x,i) => permutations(items.filter((_,j) => j !== i)).map(tail => [x,...tail])) : [[]]; }
  for (const perm of permutations(rows)) assert.deepEqual(safetyDecision(perm), expected);
  assert.deepEqual(buildExposures([...rows].reverse())[0].sets.map(s => s.order_index), [1,2,3,4,5]);
});
test("limiting set and deload need two separate failed sessions", () => {
  const failed = sessionRows(1, 100, [5,3,3]);
  assert.equal(buildExposures(failed)[0].limitingSet.order_index, 3);
  assert.notEqual(safetyDecision(failed).outcome, "deload_local");
  assert.equal(safetyDecision([...failed,...sessionRows(2,100,[5,5,3])]).outcome, "deload_local");
  const ties = sessionRows(1,100,[3,3,3]); ties[0].rir_actual=0;
  assert.equal(buildExposures(ties)[0].limitingSet.order_index,1);
});
for (const [trusted, step, input, expected] of [[20,2.5,30,22.5],[60,5,70,65],[200,2.5,210,205]])
  test(`jump cap at ${trusted} kg`, () => assert.deepEqual(applyJumpCap(input,trusted,step), { loadKg: expected, capped: true }));
test("decision records a capped increase and reason", () => {
  const config=makeProgressionDecisionService({})._test.makeDefaultProgressionConfig("strength");
  config.load_increment_profiles.barbell_strength={ default_rounding_kg: 7, bands: [] };
  const d=safetyDecision([1,2,3].flatMap(id=>sessionRows(id,60)), {config});
  assert.equal(d.evidence.cap_applied,true); assert.ok(d.reasons.includes("Capped to a safe step from your last confirmed weight."));
  assert.ok(d.recommended_load_kg<=67);
});
test("bounds exclude impossible sets and retain ignored counts including discarded sessions", () => {
  const rows=[...sessionRows(1,100), ...sessionRows(2,1000),...sessionRows(3,100,[150])];
  const d=safetyDecision(rows); assert.equal(d.evidence.ignored_set_count,4);
  assert.equal(d.recommended_load_kg,100); assert.equal(d.outcome,"hold");
});
test("large high and low jumps are unconfirmed until the next session confirms", () => {
  for (const load of [225,40]) {
    const d=safetyDecision([...sessionRows(1,100),...sessionRows(2,load)]);
    assert.equal(d.outcome,"hold"); assert.equal(d.recommended_load_kg,100);
    assert.equal(d.evidence.unconfirmed_session,true); assert.match(d.reasons[0],/until it's confirmed/);
  }
  const exposures=markTrust(buildExposures([...sessionRows(1,100),...sessionRows(2,160),...sessionRows(3,158)]));
  assert.ok(exposures.every(e=>e.trusted)); assert.equal(exposures[1].workingLoadKg,160);
});
for (const [days,band,load] of [[14,"none",105],[15,"hold",100],[28,"hold",100],[29,"reduce",90],[56,"reduce",90],[57,"major",80]])
  test(`layoff boundary ${days} days`,()=> {
    const d=resolveLayoffAdjustment({daysSinceLastTraining:days,trustedLoadKg:101,recommendedLoadKg:105,increment:2.5});
    assert.equal(d.band,band); assert.equal(d.loadKg,load);
    if(days>14) assert.equal(d.reason,`Welcome back. We've eased your weight after ${Math.floor(days/7)} weeks off.`);
  });
test("layoff singular wording and partial config defaults",()=> {
  const service=makeProgressionDecisionService({});
  const config=service._test.mergeProgressionConfig(service._test.makeDefaultProgressionConfig("strength"),{progression:{safety:{layoff_hold_days:7}}});
  assert.equal(config.safety.max_weight_kg,400); assert.equal(config.safety.layoff_hold_days,7);
  assert.match(resolveLayoffAdjustment({daysSinceLastTraining:7,trustedLoadKg:100,recommendedLoadKg:105,increment:2.5,safety:config.safety}).reason,/1 week off/);
});
test("evidence stops at a gap of more than 28 days using actual training time",()=> {
  const d=safetyDecision([...sessionRows(1,100,[5,5,5],1),...sessionRows(2,100,[5,5,5],31)]);
  assert.equal(d.evidence.sessions_considered,1); assert.notEqual(d.outcome,"increase_load");
});
test("seeded random histories never build on an unconfirmed or impossible load",()=> {
  let seed=712;
  const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
  for(let i=0;i<200;i++) {
    const rows=Array.from({length:6},(_,j)=>sessionRows(j+1,[40,60,100,160,225,1000][Math.floor(random()*6)],[Math.floor(random()*8)+1,5,5])).flat();
    const d=safetyDecision(rows); if(!d)continue;
    const trusted=d.evidence.trusted_load_kg; assert.ok(trusted<=400);
    const step=makeProgressionDecisionService({})._test.resolveLoadIncrement("strength_main",makeProgressionDecisionService({})._test.makeDefaultProgressionConfig("strength"),{equipment_items_slugs:["barbell"]},trusted,{});
    if(d.recommended_load_kg!=null) assert.ok(d.recommended_load_kg<=trusted+Math.max(step,Math.min(trusted*.1,2*step))+1e-9);
    if(d.evidence.unconfirmed_session) { assert.equal(d.outcome,"hold"); assert.equal(d.recommended_load_kg,trusted); }
  }
});

test("last training uses one non-draft query and an injected whole-day clock",async()=>{
  let count=0;
  const db={async query(sql,params){count++;assert.match(sql,/is_draft = FALSE/);assert.deepEqual(params,["user"]);return {rows:[{last_trained_at:"2026-01-01T12:00:00Z"}]};}};
  assert.equal(await getDaysSinceLastTraining(db,"user",new Date("2026-01-16T11:59:00Z")),14);assert.equal(count,1);
});
test("trust marking does not mutate session inputs",()=>{
  const original=buildExposures([...sessionRows(1,100),...sessionRows(2,225)]);
  const marked=markTrust(original);assert.equal(original[0].trusted,undefined);assert.equal(marked[0].trusted,false);
});
