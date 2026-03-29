import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePreferredDays,
  buildSynthProfile,
  createPreviewHandler,
  RANK_TO_LEVEL,
  VALID_PRESETS,
  ALL_PROGRAM_TYPES,
} from "../adminPreview.js";

// ── resolvePreferredDays ──────────────────────────────────────────────────────

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

// ── buildSynthProfile ─────────────────────────────────────────────────────────

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

// ── constants ─────────────────────────────────────────────────────────────────

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

// ── createPreviewHandler ──────────────────────────────────────────────────────

function mockRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

function makeReq(body) {
  return { body };
}

function stubDb(equipmentSlugs = [], allowedIds = [], exerciseRows = []) {
  const client = {
    query: async (sql) => {
      if (sql.includes("equipment_items")) return { rows: equipmentSlugs.map(s => ({ exercise_slug: s })) };
      if (sql.includes("exercise_catalogue")) return { rows: exerciseRows };
      return { rows: [] };
    },
    release: () => {},
  };
  return { connect: async () => client, _getAllowed: async () => allowedIds };
}

test("returns 400 for invalid fitness_rank", async () => {
  const handler = createPreviewHandler({
    db: stubDb(),
    getAllowed: async () => [],
    buildInputs: () => ({}),
    pipeline: async () => ({ program: {}, debug: {} }),
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 5, equipment_preset: "commercial_gym" }), res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes("fitness_rank"));
});

test("returns 400 for unknown equipment_preset", async () => {
  const handler = createPreviewHandler({
    db: stubDb(),
    getAllowed: async () => [],
    buildInputs: () => ({}),
    pipeline: async () => ({ program: {}, debug: {} }),
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 1, equipment_preset: "moon_gym" }), res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error.includes("moon_gym"));
});

test("returns 400 when program_types is empty after filtering", async () => {
  const handler = createPreviewHandler({
    db: stubDb(),
    getAllowed: async () => [],
    buildInputs: () => ({}),
    pipeline: async () => ({ program: {}, debug: {} }),
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 1, equipment_preset: "commercial_gym", program_types: ["invalid_type"] }), res);
  assert.equal(res.statusCode, 400);
});

test("calls pipeline once per requested program type", async () => {
  const called = [];
  const handler = createPreviewHandler({
    db: stubDb(["barbell"], ["ex-1"]),
    getAllowed: async () => ["ex-1"],
    buildInputs: () => ({ clientProfile: { response: {} }, exercises: { response: { results: [] } }, configs: { catalogBuilds: { response: { results: [] } }, genConfigs: { response: { results: [] } } } }),
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

test("defaults to all 4 program types when program_types not specified", async () => {
  const called = [];
  const handler = createPreviewHandler({
    db: stubDb([], []),
    getAllowed: async () => [],
    buildInputs: () => ({ clientProfile: { response: {} }, exercises: { response: { results: [] } }, configs: { catalogBuilds: { response: { results: [] } }, genConfigs: { response: { results: [] } } } }),
    pipeline: async ({ programType }) => {
      called.push(programType);
      return { program: { weeks: [] }, debug: {} };
    },
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 1, equipment_preset: "commercial_gym" }), res);
  assert.deepEqual(called.sort(), ["conditioning", "hypertrophy", "hyrox", "strength"]);
});

test("failed pipeline type is reported with ok:false, not thrown", async () => {
  const handler = createPreviewHandler({
    db: stubDb([], []),
    getAllowed: async () => [],
    buildInputs: () => ({ clientProfile: { response: {} }, exercises: { response: { results: [] } }, configs: { catalogBuilds: { response: { results: [] } }, genConfigs: { response: { results: [] } } } }),
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

test("meta includes allowed_exercise_count and equipment_slugs", async () => {
  const handler = createPreviewHandler({
    db: stubDb(["barbell", "dumbbells"], ["ex-1", "ex-2"]),
    getAllowed: async () => ["ex-1", "ex-2"],
    buildInputs: () => ({ clientProfile: { response: {} }, exercises: { response: { results: [] } }, configs: { catalogBuilds: { response: { results: [] } }, genConfigs: { response: { results: [] } } } }),
    pipeline: async () => ({ program: { weeks: [] }, debug: {} }),
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 2, equipment_preset: "commercial_gym", program_types: ["hypertrophy"] }), res);
  assert.equal(res.body.meta.allowed_exercise_count, 2);
  assert.equal(res.body.meta.fitness_rank, 2);
  assert.equal(res.body.meta.fitness_level, "advanced");
  assert.equal(res.body.meta.equipment_preset, "commercial_gym");
});

test("pipeline request uses correct allowed_ids_csv", async () => {
  let capturedRequest;
  const handler = createPreviewHandler({
    db: stubDb(["barbell"], ["ex-10", "ex-20"]),
    getAllowed: async () => ["ex-10", "ex-20"],
    buildInputs: () => ({ clientProfile: { response: {} }, exercises: { response: { results: [] } }, configs: { catalogBuilds: { response: { results: [] } }, genConfigs: { response: { results: [] } } } }),
    pipeline: async ({ request }) => {
      capturedRequest = request;
      return { program: { weeks: [] }, debug: {} };
    },
  });
  const res = mockRes();
  await handler(makeReq({ fitness_rank: 0, equipment_preset: "no_equipment", program_types: ["hypertrophy"] }), res);
  assert.equal(capturedRequest.allowed_ids_csv, "ex-10,ex-20");
  assert.equal(capturedRequest.fitness_rank, 0);
});
