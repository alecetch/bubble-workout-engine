import test from "node:test";
import assert from "node:assert/strict";
import { makeProgressionDecisionService } from "../progressionDecisionService.js";

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
              log_id: "log-2",
              exercise_id: "bb_back_squat",
              purpose: "main",
              weight_kg: 100,
              reps_completed: 5,
              rir_actual: 2.5,
              exposure_date: "2026-04-01",
            },
            {
              log_id: "log-1",
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
      { log_id: "a", weight_kg: 100, reps_completed: 5, rir_actual: 2.5 },
      { log_id: "b", weight_kg: 100, reps_completed: 5, rir_actual: 2.0 },
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
      { log_id: "a", weight_kg: 30, reps_completed: 9, rir_actual: 2.5 },
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
  const historyQuery = db.calls.find((call) => call.sql.includes("FROM segment_exercise_log sel"));
  const stateInsert = db.calls.find((call) => call.sql.includes("INSERT INTO exercise_progression_state"));
  assert.match(historyQuery.sql, /pd\.is_completed = TRUE/);
  assert.match(stateInsert.sql, /COALESCE\(exercise_progression_state\.progress_streak, 0\) \+ 1/);
  assert.match(stateInsert.sql, /COALESCE\(exercise_progression_state\.underperformance_streak, 0\) \+ 1/);
  assert.ok(db.calls.some((call) => call.sql.includes("UPDATE program_exercise")));
  assert.ok(db.calls.some((call) => call.sql.includes("INSERT INTO exercise_progression_decision")));
});

test("applyProgressionRecommendations clears stale progression fields and updates only the first matching exposure", async () => {
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
          ],
        };
      }
      if (sql.includes("FROM segment_exercise_log sel")) {
        return {
          rows: [
            {
              log_id: "log-2",
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
  });

  assert.equal(result.updated, 1);
  const clearCall = calls.find((call) => call.sql.includes("SET") && call.sql.includes("progression_outcome = NULL"));
  assert.ok(clearCall);
  const updateCalls = calls.filter((call) => call.sql.includes("UPDATE program_exercise"));
  assert.equal(updateCalls.length, 2);
  const targetedUpdate = updateCalls.find((call) => call.params?.[0] === "pe-1");
  assert.ok(targetedUpdate);
  assert.equal(updateCalls.some((call) => call.params?.[0] === "pe-2"), false);
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
            log_id: "log-1",
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
