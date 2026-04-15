import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePreferredDays,
  buildSynthProfile,
  buildPreviewInputs,
  shapeToCsvRows,
  rowsToCsv,
  createPreviewHandler,
  createExportHandler,
  CSV_COLUMNS,
  RANK_TO_LEVEL,
  VALID_PRESETS,
  ALL_PROGRAM_TYPES,
} from "../adminPreview.js";

function mockRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

function mockCsvRes() {
  const r = { headers: {}, statusCode: 200, body: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
}

function makeReq(body) {
  return { body };
}

function stubDb(equipmentSlugs = [], exerciseRows = [], repRuleRows = [], familyFactorRows = []) {
  const query = async (sql, params = []) => {
    if (sql.includes("equipment_items")) return { rows: equipmentSlugs.map((s) => ({ exercise_slug: s })) };
    if (sql.includes("exercise_catalogue")) return { rows: exerciseRows };
    if (sql.includes("program_rep_rule")) return { rows: repRuleRows };
    if (sql.includes("exercise_load_estimation_family_config")) return { rows: familyFactorRows };
    if (sql.includes("program_generation_config")) {
      return {
        rows: [{
          config_key: `${params[0] ?? "hypertrophy"}_default_v1`,
          is_active: true,
          program_generation_config_json: {},
          program_type: params[0] ?? "hypertrophy",
          progression_by_rank_json: {
            intermediate: {
              evidence_requirement_multiplier: 1,
              rir_progress_gate_offset: 0,
              load_increment_scale: 1,
            },
          },
          schema_version: 1,
        }],
      };
    }
    return { rows: [] };
  };
  const client = {
    query,
    release: () => {},
  };
  return { connect: async () => client, query };
}

function makeBuildInputsResult() {
  return {
    clientProfile: { response: {} },
    exercises: { response: { results: [] } },
    configs: { catalogBuilds: { response: { results: [] } }, genConfigs: { response: { results: [] } } },
  };
}

function makeItem(exId, overrides = {}) {
  return {
    ex_id: exId,
    slot: overrides.slot ?? "A:squat",
    sets: overrides.sets ?? 3,
    reps_prescribed: overrides.reps_prescribed ?? "8-10",
    reps_unit: overrides.reps_unit ?? "reps",
    tempo_prescribed: overrides.tempo_prescribed ?? "3-1-1-0",
    rir_target: overrides.rir_target ?? 2,
    rest_after_set_sec: overrides.rest_after_set_sec ?? 75,
    rep_rule_id: overrides.rep_rule_id ?? "rule-1",
  };
}

function makeSegment(index, itemCount, overrides = {}) {
  return {
    purpose: overrides.purpose ?? "main",
    segment_type: overrides.segment_type ?? "single",
    rounds: overrides.rounds ?? 2,
    items: Array.from({ length: itemCount }, (_, itemIndex) =>
      makeItem(index * 100 + itemIndex + 1, overrides.itemOverrides ?? {}),
    ),
  };
}

function makePreview(weeks) {
  return {
    ok: true,
    program: { weeks, narration: {} },
    debug: { step1: { config_key: "hypertrophy_default_v1" } },
  };
}

function makeMeta(overrides = {}) {
  return {
    fitness_rank: 1,
    fitness_level: "intermediate",
    equipment_preset: "commercial_gym",
    days_per_week: 3,
    duration_mins: 50,
    allowed_exercise_count: 80,
    exercise_name_map: { "42": "Barbell Squat" },
    rep_rule_map: {},
    ...overrides,
  };
}

test("resolvePreferredDays(3) returns mon/wed/fri", () => {
  assert.deepEqual(resolvePreferredDays(3), ["mon", "wed", "fri"]);
});

test("resolvePreferredDays(4) returns 4 days", () => {
  assert.equal(resolvePreferredDays(4).length, 4);
});

test("resolvePreferredDays(5) returns 5 days", () => {
  assert.equal(resolvePreferredDays(5).length, 5);
});

test("resolvePreferredDays falls back to 3-day schedule for unknown value", () => {
  assert.deepEqual(resolvePreferredDays(99), ["mon", "wed", "fri"]);
});

test("buildSynthProfile maps fitness rank to level string", () => {
  const p = buildSynthProfile({ fitnessRank: 2, equipmentSlugs: [], daysPerWeek: 3, durationMins: 50, equipmentPreset: "commercial_gym" });
  assert.equal(p.fitnessLevel, "advanced");
  assert.equal(p.minutesPerSession, 50);
  assert.equal(p.equipmentPreset, "commercial_gym");
});

test("buildSynthProfile includes equipment slugs", () => {
  const slugs = ["barbell", "dumbbells"];
  const p = buildSynthProfile({ fitnessRank: 1, equipmentSlugs: slugs, daysPerWeek: 3, durationMins: 50, equipmentPreset: "commercial_gym" });
  assert.deepEqual(p.equipmentItemCodes, slugs);
});

test("buildSynthProfile has empty injuryFlags", () => {
  const p = buildSynthProfile({ fitnessRank: 0, equipmentSlugs: [], daysPerWeek: 3, durationMins: 50, equipmentPreset: "no_equipment" });
  assert.deepEqual(p.injuryFlags, []);
});

test("buildSynthProfile preferredDays length matches daysPerWeek", () => {
  const p = buildSynthProfile({ fitnessRank: 1, equipmentSlugs: [], daysPerWeek: 4, durationMins: 50, equipmentPreset: "commercial_gym" });
  assert.equal(p.preferredDays.length, 4);
});

test("RANK_TO_LEVEL covers all 4 ranks", () => {
  assert.equal(RANK_TO_LEVEL[0], "beginner");
  assert.equal(RANK_TO_LEVEL[1], "intermediate");
  assert.equal(RANK_TO_LEVEL[2], "advanced");
  assert.equal(RANK_TO_LEVEL[3], "elite");
});

test("VALID_PRESETS includes all 5 presets", () => {
  assert.equal(VALID_PRESETS.length, 5);
  assert.ok(VALID_PRESETS.includes("commercial_gym"));
  assert.ok(VALID_PRESETS.includes("no_equipment"));
  assert.ok(VALID_PRESETS.includes("crossfit_hyrox_gym"));
});

test("ALL_PROGRAM_TYPES includes all 4 types", () => {
  assert.deepEqual(ALL_PROGRAM_TYPES, ["hypertrophy", "strength", "conditioning", "hyrox"]);
});

test("buildPreviewInputs assembles shared preview inputs", async () => {
  const exerciseRows = [
    { exercise_id: "ex-1", name: "Squat", load_estimation_metadata: { estimation_family: "squat" } },
    { exercise_id: "ex-2", name: "Row" },
  ];
  const repRuleRows = [{ rule_id: "rule-1", program_type: "hypertrophy" }];
  const db = stubDb(["barbell"], exerciseRows, repRuleRows);
  const buildInputsCalls = [];
  const result = await buildPreviewInputs(
    db,
    async () => ["ex-1"],
    (...args) => {
      buildInputsCalls.push(args);
      return makeBuildInputsResult();
    },
    { fitnessRank: 1, equipmentPreset: "commercial_gym", daysPerWeek: 3, durationMins: 50 },
  );

  assert.deepEqual(result.equipmentSlugs, ["barbell"]);
  assert.deepEqual(result.allowedIds, ["ex-1"]);
  assert.equal(result.exerciseNameMap["ex-1"], "Squat");
  assert.equal(result.estimationFamilyByExerciseId["ex-1"], "squat");
  assert.equal(result.repRuleMap["rule-1"].program_type, "hypertrophy");
  assert.equal(result.pipelineRequest.allowed_ids_csv, "ex-1");
  assert.equal(buildInputsCalls.length, 1);
  assert.deepEqual(buildInputsCalls[0][1], exerciseRows);
  assert.deepEqual(result.inputs.allowed_exercise_ids, ["ex-1"]);
  assert.ok(result.familyFactors instanceof Map);
});

test("shapeToCsvRows returns empty array for failed preview", () => {
  assert.deepEqual(shapeToCsvRows("hypertrophy", { ok: false, error: "boom" }, makeMeta()), []);
});

test("shapeToCsvRows returns empty array for program with no weeks", () => {
  assert.deepEqual(shapeToCsvRows("hypertrophy", makePreview([]), makeMeta()), []);
});

test("shapeToCsvRows row count equals total exercise items", () => {
  const weeks = Array.from({ length: 2 }, (_, weekIndex) => ({
    week_index: weekIndex + 1,
    days: [{
      day_index: 1,
      day_focus_slug: "lower",
      duration_mins: 50,
      segments: [makeSegment(weekIndex * 2 + 1, 3), makeSegment(weekIndex * 2 + 2, 3)],
    }],
  }));
  const rows = shapeToCsvRows("hypertrophy", makePreview(weeks), makeMeta());
  assert.equal(rows.length, 12);
});

test("shapeToCsvRows context columns are correctly propagated", () => {
  const weeks = [{
    week_index: 1,
    days: [{
      day_index: 2,
      day_focus_slug: "upper",
      duration_mins: 60,
      segments: [{
        purpose: "main",
        segment_type: "single",
        rounds: 3,
        items: [makeItem(42)],
      }],
    }],
  }];
  const preview = makePreview(weeks);
  preview.program.narration = { weeks: [{ phase_label: "Build" }] };
  const row = shapeToCsvRows("hypertrophy", preview, makeMeta())[0];
  assert.equal(row.program_type, "hypertrophy");
  assert.equal(row.fitness_level, "intermediate");
  assert.equal(row.equipment_preset, "commercial_gym");
  assert.equal(row.config_key, "hypertrophy_default_v1");
  assert.equal(row.week_number, "1");
  assert.equal(row.day_number, "2");
  assert.equal(row.segment_purpose, "main");
  assert.equal(row.exercise_name, "Barbell Squat");
});

test("shapeToCsvRows exercise_order is 1-based and resets per segment", () => {
  const preview = makePreview([{
    week_index: 1,
    days: [{
      day_index: 1,
      day_focus_slug: "lower",
      duration_mins: 50,
      segments: [{
        purpose: "main",
        segment_type: "single",
        rounds: 1,
        items: [makeItem(1), makeItem(2), makeItem(3)],
      }],
    }],
  }]);
  const rows = shapeToCsvRows("hypertrophy", preview, makeMeta());
  assert.deepEqual(rows.map((row) => row.exercise_order), ["1", "2", "3"]);
});

test("shapeToCsvRows resolves exercise_name from name map", () => {
  const preview = makePreview([{
    week_index: 1,
    days: [{
      day_index: 1,
      day_focus_slug: "lower",
      duration_mins: 50,
      segments: [{ purpose: "main", segment_type: "single", rounds: 1, items: [makeItem(42)] }],
    }],
  }]);
  const row = shapeToCsvRows("hypertrophy", preview, makeMeta())[0];
  assert.equal(row.exercise_name, "Barbell Squat");
});

test("shapeToCsvRows falls back to empty string when exercise_name is missing", () => {
  const preview = makePreview([{
    week_index: 1,
    days: [{
      day_index: 1,
      day_focus_slug: "lower",
      duration_mins: 50,
      segments: [{ purpose: "main", segment_type: "single", rounds: 1, items: [makeItem(999)] }],
    }],
  }]);
  const row = shapeToCsvRows("hypertrophy", preview, makeMeta())[0];
  assert.equal(row.exercise_name, "");
});

test("shapeToCsvRows includes all 27 columns in every row", () => {
  const preview = makePreview([{
    week_index: 1,
    days: [{
      day_index: 1,
      day_focus_slug: "lower",
      duration_mins: 50,
      segments: [{ purpose: "main", segment_type: "single", rounds: 1, items: [makeItem(42)] }],
    }],
  }]);
  const row = shapeToCsvRows("hypertrophy", preview, makeMeta())[0];
  assert.deepEqual(Object.keys(row), CSV_COLUMNS);
});

test("shapeToCsvRows returns empty array for unknown fieldSet", () => {
  const preview = makePreview([{
    week_index: 1,
    days: [{
      day_index: 1,
      day_focus_slug: "lower",
      duration_mins: 50,
      segments: [{ purpose: "main", segment_type: "single", rounds: 1, items: [makeItem(42)] }],
    }],
  }]);
  assert.deepEqual(shapeToCsvRows("hypertrophy", preview, makeMeta(), "debug"), []);
});

test("rowsToCsv returns empty string for empty input", () => {
  assert.equal(rowsToCsv([]), "");
});

test("rowsToCsv single row produces header and data", () => {
  assert.equal(rowsToCsv([{ a: "1", b: "2" }]), "a,b\r\n1,2\r\n");
});

test("rowsToCsv quotes values containing commas", () => {
  assert.equal(rowsToCsv([{ a: "hello, world" }]), "a\r\n\"hello, world\"\r\n");
});

test("rowsToCsv escapes double quotes", () => {
  assert.equal(rowsToCsv([{ a: 'say "hi"' }]), "a\r\n\"say \"\"hi\"\"\"\r\n");
});

test("rowsToCsv preserves key insertion order", () => {
  const csv = rowsToCsv([{ b: "2", a: "1" }]);
  assert.equal(csv.split("\r\n")[0], "b,a");
});

test("createPreviewHandler returns 400 for invalid fitness_rank", async () => {
  const handler = createPreviewHandler({
    db: stubDb(),
    getAllowed: async () => [],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({ program: {}, debug: {} }),
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 5, equipment_preset: "commercial_gym" }), res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes("fitness_rank"));
});

test("createPreviewHandler returns 400 for unknown equipment_preset", async () => {
  const handler = createPreviewHandler({
    db: stubDb(),
    getAllowed: async () => [],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({ program: {}, debug: {} }),
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 1, equipment_preset: "moon_gym" }), res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes("moon_gym"));
});

test("createPreviewHandler returns 400 when program_types is empty after filtering", async () => {
  const handler = createPreviewHandler({
    db: stubDb(),
    getAllowed: async () => [],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({ program: {}, debug: {} }),
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 1, equipment_preset: "commercial_gym", program_types: ["invalid_type"] }), res);
  assert.equal(res.statusCode, 400);
});

test("createPreviewHandler calls pipeline once per requested program type", async () => {
  const called = [];
  const handler = createPreviewHandler({
    db: stubDb(["barbell"], []),
    getAllowed: async () => ["ex-1"],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async ({ programType }) => {
      called.push(programType);
      return { program: { weeks: [], program_title: programType }, debug: {} };
    },
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 1, equipment_preset: "commercial_gym", program_types: ["hypertrophy", "strength"] }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.ok);
  assert.deepEqual(called.sort(), ["hypertrophy", "strength"]);
  assert.ok(res.body.previews.hypertrophy.ok);
  assert.ok(res.body.previews.strength.ok);
});

test("createPreviewHandler defaults to all 4 program types when program_types not specified", async () => {
  const called = [];
  const handler = createPreviewHandler({
    db: stubDb([], []),
    getAllowed: async () => [],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async ({ programType }) => {
      called.push(programType);
      return { program: { weeks: [] }, debug: {} };
    },
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 1, equipment_preset: "commercial_gym" }), res);
  assert.deepEqual(called.sort(), ["conditioning", "hypertrophy", "hyrox", "strength"]);
});

test("createPreviewHandler reports failed pipeline type with ok:false", async () => {
  const handler = createPreviewHandler({
    db: stubDb([], []),
    getAllowed: async () => [],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async ({ programType }) => {
      if (programType === "hyrox") throw new Error("hyrox exploded");
      return { program: { weeks: [] }, debug: {} };
    },
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 1, equipment_preset: "commercial_gym" }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.ok);
  assert.equal(res.body.previews.hyrox.ok, false);
  assert.ok(res.body.previews.hyrox.error.includes("hyrox exploded"));
  assert.ok(res.body.previews.hypertrophy.ok);
});

test("createPreviewHandler meta includes allowed_exercise_count and equipment_slugs", async () => {
  const handler = createPreviewHandler({
    db: stubDb(["barbell", "dumbbells"], []),
    getAllowed: async () => ["ex-1", "ex-2"],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({ program: { weeks: [] }, debug: {} }),
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 2, equipment_preset: "commercial_gym", program_types: ["hypertrophy"] }), res);
  assert.equal(res.body.meta.allowed_exercise_count, 2);
  assert.equal(res.body.meta.fitness_rank, 2);
  assert.equal(res.body.meta.fitness_level, "advanced");
  assert.equal(res.body.meta.equipment_preset, "commercial_gym");
});

test("createPreviewHandler pipeline request uses correct allowed_ids_csv", async () => {
  let capturedRequest;
  let capturedInputs;
  const handler = createPreviewHandler({
    db: stubDb(["barbell"], []),
    getAllowed: async () => ["ex-10", "ex-20"],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async ({ request, inputs }) => {
      capturedRequest = request;
      capturedInputs = inputs;
      return { program: { weeks: [] }, debug: {} };
    },
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 0, equipment_preset: "no_equipment", program_types: ["hypertrophy"] }), res);
  assert.equal(capturedRequest.allowed_ids_csv, "ex-10,ex-20");
  assert.equal(capturedRequest.fitness_rank, 0);
  assert.deepEqual(capturedInputs.allowed_exercise_ids, ["ex-10", "ex-20"]);
});

test("createPreviewHandler uses real profile when client_profile_id is supplied", async () => {
  let buildInputsProfile = null;
  let capturedRequest = null;
  const profile = {
    id: "cp-1",
    fitnessLevel: "advanced",
    equipmentPreset: "commercial_gym",
    equipmentItemCodes: ["barbell", "leg_press"],
    injuryFlags: ["knee_issues"],
    preferredDays: ["Tue", "Thu", "Sat"],
    minutesPerSession: 60,
    goals: ["hypertrophy"],
    programType: "hypertrophy",
  };
  const handler = createPreviewHandler({
    db: stubDb([], []),
    getProfile: async (profileId) => {
      assert.equal(profileId, "cp-1");
      return profile;
    },
    getAllowed: async (_client, filters) => {
      assert.equal(filters.fitness_rank, 2);
      assert.deepEqual(filters.equipment_items_slugs, ["barbell", "leg_press"]);
      assert.deepEqual(filters.injury_flags_slugs, ["knee_issues"]);
      return ["leg_press"];
    },
    buildInputs: (incomingProfile) => {
      buildInputsProfile = incomingProfile;
      return makeBuildInputsResult();
    },
    pipeline: async ({ request }) => {
      capturedRequest = request;
      return { program: { weeks: [] }, debug: {} };
    },
  });
  const res = mockRes();

  await handler(makeReq({ client_profile_id: "cp-1", program_types: ["hypertrophy"] }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.preview_context.mode, "real_profile");
  assert.equal(res.body.preview_context.profile_id, "cp-1");
  assert.equal(buildInputsProfile.minutesPerSession, 60);
  assert.deepEqual(buildInputsProfile.preferredDays, ["tue", "thu", "sat"]);
  assert.deepEqual(buildInputsProfile.equipmentItemCodes, ["barbell", "leg_press"]);
  assert.equal(capturedRequest.duration_mins, 60);
  assert.equal(capturedRequest.days_per_week, 3);
  assert.equal(capturedRequest.fitness_rank, 2);
  assert.equal(capturedRequest.preferred_days_json, "tue,thu,sat");
});

test("createPreviewHandler uses real profile when user_id is supplied", async () => {
  let calledUserId = null;
  const handler = createPreviewHandler({
    db: stubDb([], []),
    getProfileByUser: async (userId) => {
      calledUserId = userId;
      return {
        id: "cp-2",
        fitnessLevel: "intermediate",
        equipmentPreset: "minimal_equipment",
        equipmentItemCodes: ["dumbbells"],
        injuryFlags: [],
        preferredDays: ["Mon", "Wed"],
        minutesPerSession: 40,
      };
    },
    getAllowed: async () => [],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({ program: { weeks: [] }, debug: {} }),
  });
  const res = mockRes();

  await handler(makeReq({ user_id: "user-123", program_types: ["hypertrophy"] }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(calledUserId, "user-123");
  assert.equal(res.body.preview_context.mode, "real_profile");
  assert.equal(res.body.preview_context.profile_id, "cp-2");
});

test("createPreviewHandler returns 404 when requested real profile is missing", async () => {
  const handler = createPreviewHandler({
    db: stubDb([], []),
    getProfile: async () => null,
    getAllowed: async () => [],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({ program: { weeks: [] }, debug: {} }),
  });
  const res = mockRes();

  await handler(makeReq({ client_profile_id: "missing-profile", program_types: ["hypertrophy"] }), res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.error, "Client profile not found");
});

test("createPreviewHandler reports synthetic mode when no real profile identifiers are supplied", async () => {
  const handler = createPreviewHandler({
    db: stubDb(["barbell"], []),
    getAllowed: async () => [],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({ program: { weeks: [] }, debug: {} }),
  });
  const res = mockRes();

  await handler(makeReq({ fitness_rank: 1, equipment_preset: "commercial_gym", program_types: ["hypertrophy"] }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.preview_context.mode, "synthetic");
  assert.equal(res.body.preview_context.profile_id, null);
});

test("POST /preview/generate includes starting_loads when anchor_lifts match exercise family", async () => {
  const handler = createPreviewHandler({
    db: stubDb(["barbell"], [
      {
        exercise_id: "bb_back_squat",
        name: "Back Squat",
        is_loadable: true,
        equipment_items_slugs: ["barbell"],
        load_estimation_metadata: { estimation_family: "squat" },
      },
    ]),
    getAllowed: async () => ["bb_back_squat"],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({
      program: {
        weeks: [{
          week_index: 1,
          days: [{
            day_index: 1,
            segments: [{
              purpose: "main",
              segment_type: "single",
              items: [{
                ex_id: "bb_back_squat",
                reps_prescribed: "5",
                rir_target: 2,
              }],
            }],
          }],
        }],
      },
      debug: {},
    }),
  });
  const res = mockRes();
  await handler(makeReq({
    fitness_rank: 1,
    equipment_preset: "commercial_gym",
    program_types: ["strength"],
    anchor_lifts: [{ estimationFamily: "squat", loadKg: 100, reps: 5, rir: 2 }],
  }), res);

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.starting_loads.strength));
  const match = res.body.starting_loads.strength.find((entry) => entry.exercise_id === "bb_back_squat");
  assert.ok(match);
  assert.ok(match.guideline_load_kg > 0);
  assert.equal(match.confidence, "medium");
  assert.equal(match.source, "same_family");
  assert.ok(Array.isArray(match.reasoning));
  assert.ok(match.set_1_rule);
});

test("POST /preview/generate skips cleanly when no matching anchor family exists", async () => {
  const handler = createPreviewHandler({
    db: stubDb(["barbell"], [
      {
        exercise_id: "bb_back_squat",
        name: "Back Squat",
        is_loadable: true,
        equipment_items_slugs: ["barbell"],
        load_estimation_metadata: { estimation_family: "squat" },
      },
    ]),
    getAllowed: async () => ["bb_back_squat"],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({
      program: {
        weeks: [{
          week_index: 1,
          days: [{
            day_index: 1,
            segments: [{
              purpose: "main",
              segment_type: "single",
              items: [{ ex_id: "bb_back_squat", reps_prescribed: "5", rir_target: 2 }],
            }],
          }],
        }],
      },
      debug: {},
    }),
  });
  const res = mockRes();

  await handler(makeReq({
    fitness_rank: 1,
    equipment_preset: "commercial_gym",
    program_types: ["strength"],
    anchor_lifts: [{ estimationFamily: "hinge", loadKg: 100, reps: 5, rir: 2 }],
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.starting_loads.strength[0].skipped_reason, "no_anchor_match");
});

test("POST /preview/generate marks non-loadable exercises as skipped in starting_loads", async () => {
  const handler = createPreviewHandler({
    db: stubDb(["mat"], [
      {
        exercise_id: "dead_bug",
        name: "Dead Bug",
        is_loadable: false,
        equipment_items_slugs: [],
        load_estimation_metadata: { estimation_family: "core" },
      },
    ]),
    getAllowed: async () => ["dead_bug"],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({
      program: {
        weeks: [{
          week_index: 1,
          days: [{
            day_index: 1,
            segments: [{
              purpose: "accessory",
              segment_type: "single",
              items: [{ ex_id: "dead_bug", reps_prescribed: "10-12", rir_target: 2 }],
            }],
          }],
        }],
      },
      debug: {},
    }),
  });
  const res = mockRes();

  await handler(makeReq({
    fitness_rank: 1,
    equipment_preset: "commercial_gym",
    program_types: ["strength"],
    anchor_lifts: [{ estimationFamily: "squat", loadKg: 100, reps: 5, rir: 2 }],
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.starting_loads.strength[0].skipped_reason, "not_loadable");
});

test("POST /preview/generate marks exercises without estimation family as skipped in starting_loads", async () => {
  const handler = createPreviewHandler({
    db: stubDb(["barbell"], [
      {
        exercise_id: "bb_back_squat",
        name: "Back Squat",
        is_loadable: true,
        equipment_items_slugs: ["barbell"],
        load_estimation_metadata: {},
      },
    ]),
    getAllowed: async () => ["bb_back_squat"],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({
      program: {
        weeks: [{
          week_index: 1,
          days: [{
            day_index: 1,
            segments: [{
              purpose: "main",
              segment_type: "single",
              items: [{ ex_id: "bb_back_squat", reps_prescribed: "5", rir_target: 2 }],
            }],
          }],
        }],
      },
      debug: {},
    }),
  });
  const res = mockRes();

  await handler(makeReq({
    fitness_rank: 1,
    equipment_preset: "commercial_gym",
    program_types: ["strength"],
    anchor_lifts: [{ estimationFamily: "squat", loadKg: 100, reps: 5, rir: 2 }],
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.starting_loads.strength[0].skipped_reason, "no_estimation_family");
});

test("POST /preview/generate returns empty starting_loads when no anchor_lifts", async () => {
  const handler = createPreviewHandler({
    db: stubDb(["barbell"], []),
    getAllowed: async () => [],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({ program: { weeks: [] }, debug: {} }),
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 1, equipment_preset: "commercial_gym", program_types: ["strength"] }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.starting_loads, {});
});

test("createExportHandler returns 400 for invalid field_set", async () => {
  const handler = createExportHandler({
    db: stubDb(),
    getAllowed: async () => [],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({ program: { weeks: [] }, debug: {} }),
  });
  const res = mockCsvRes();
  await handler(makeReq({ fitness_ranks: [1], field_set: "narration" }), res);
  assert.equal(res.statusCode, 400);
});

test("createExportHandler returns 400 for out-of-range fitness_rank", async () => {
  const handler = createExportHandler({
    db: stubDb(),
    getAllowed: async () => [],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({ program: { weeks: [] }, debug: {} }),
  });
  const res = mockCsvRes();
  await handler(makeReq({ fitness_ranks: [5] }), res);
  assert.equal(res.statusCode, 400);
});

test("createExportHandler returns 400 for unknown equipment_preset", async () => {
  const handler = createExportHandler({
    db: stubDb(),
    getAllowed: async () => [],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({ program: { weeks: [] }, debug: {} }),
  });
  const res = mockCsvRes();
  await handler(makeReq({ equipment_presets: ["moon_gym"] }), res);
  assert.equal(res.statusCode, 400);
});

test("createExportHandler sets CSV headers", async () => {
  const handler = createExportHandler({
    db: stubDb(["barbell"], []),
    getAllowed: async () => ["42"],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({
      program: {
        weeks: [{
          week_index: 1,
          days: [{
            day_index: 1,
            day_focus_slug: "lower",
            duration_mins: 50,
            segments: [{ purpose: "main", segment_type: "single", rounds: 1, items: [makeItem(42)] }],
          }],
        }],
        narration: { weeks: [{ phase_label: "Build" }] },
      },
      debug: { step1: { config_key: "hypertrophy_default_v1" } },
    }),
  });
  const res = mockCsvRes();
  await handler(makeReq({
    fitness_ranks: [1],
    equipment_presets: ["commercial_gym"],
    program_types: ["hypertrophy"],
    days_per_week: 3,
    duration_mins: 50,
    field_set: "core",
  }), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Content-Type"], /^text\/csv/);
  assert.match(res.headers["Content-Disposition"], /attachment/);
});

test("createExportHandler CSV body contains header row", async () => {
  const handler = createExportHandler({
    db: stubDb(["barbell"], []),
    getAllowed: async () => ["42"],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async () => ({
      program: {
        weeks: [{
          week_index: 1,
          days: [{
            day_index: 1,
            day_focus_slug: "lower",
            duration_mins: 50,
            segments: [{ purpose: "main", segment_type: "single", rounds: 1, items: [makeItem(42)] }],
          }],
        }],
        narration: { weeks: [{ phase_label: "Build" }] },
      },
      debug: { step1: { config_key: "hypertrophy_default_v1" } },
    }),
  });
  const res = mockCsvRes();
  await handler(makeReq({
    fitness_ranks: [1],
    equipment_presets: ["commercial_gym"],
    program_types: ["hypertrophy"],
    days_per_week: 3,
    duration_mins: 50,
    field_set: "core",
  }), res);
  assert.equal(res.body.split("\r\n")[0], CSV_COLUMNS.join(","));
});

test("createExportHandler pipeline failure for one combination does not abort export", async () => {
  const handler = createExportHandler({
    db: stubDb(["barbell"], []),
    getAllowed: async () => ["42"],
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async ({ programType }) => {
      if (programType === "strength") throw new Error("boom");
      return {
        program: {
          weeks: [{
            week_index: 1,
            days: [{
              day_index: 1,
              day_focus_slug: "lower",
              duration_mins: 50,
              segments: [{ purpose: "main", segment_type: "single", rounds: 1, items: [makeItem(42)] }],
            }],
          }],
          narration: { weeks: [{ phase_label: "Build" }] },
        },
        debug: { step1: { config_key: "hypertrophy_default_v1" } },
      };
    },
  });
  const res = mockCsvRes();
  await handler(makeReq({
    fitness_ranks: [1],
    equipment_presets: ["commercial_gym"],
    program_types: ["hypertrophy", "strength"],
    field_set: "core",
  }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.startsWith(CSV_COLUMNS.join(",")));
});

test("createExportHandler deduplicates DB work per unique rank and preset pair", async () => {
  let getAllowedCalls = 0;
  const handler = createExportHandler({
    db: stubDb(["barbell"], []),
    getAllowed: async () => {
      getAllowedCalls += 1;
      return ["42"];
    },
    buildInputs: () => makeBuildInputsResult(),
    pipeline: async ({ programType }) => ({
      program: {
        weeks: [{
          week_index: 1,
          days: [{
            day_index: 1,
            day_focus_slug: programType,
            duration_mins: 50,
            segments: [{ purpose: "main", segment_type: "single", rounds: 1, items: [makeItem(42)] }],
          }],
        }],
        narration: { weeks: [{ phase_label: "Build" }] },
      },
      debug: { step1: { config_key: `${programType}_default_v1` } },
    }),
  });
  const res = mockCsvRes();
  await handler(makeReq({
    fitness_ranks: [1, 2],
    equipment_presets: ["commercial_gym"],
    program_types: ["hypertrophy", "strength"],
    field_set: "core",
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(getAllowedCalls, 2);
});
