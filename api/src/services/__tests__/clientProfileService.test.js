import test from "node:test";
import assert from "node:assert/strict";
import { makeClientProfileService, toApiShape } from "../clientProfileService.js";

function mockDb(responses) {
  let callIndex = 0;
  return {
    async query(_sql, _params) {
      const response = responses[callIndex++];
      if (!response) throw new Error(`Unexpected DB call at index ${callIndex - 1}`);
      if (response instanceof Error) throw response;
      return response;
    },
  };
}

test("toApiShape maps all DB columns to camelCase API fields", () => {
  const row = {
    id: "profile-uuid-123",
    user_id: "pg-user-123",
    bubble_client_profile_id: "buid-123",
    main_goals_slugs: ["strength"],
    fitness_level_slug: "intermediate",
    injury_flags: ["knee_issues"],
    goal_notes: "focus on legs",
    equipment_preset_slug: "commercial_gym",
    equipment_items_slugs: ["barbell", "dumbbells"],
    preferred_days: ["mon", "wed"],
    schedule_constraints: "no evenings",
    height_cm: 180,
    weight_kg: 80.5,
    minutes_per_session: 60,
    sex: "male",
    age_range: "25_34",
    onboarding_step_completed: 3,
    onboarding_completed_at: "2026-01-01T00:00:00Z",
    program_type_slug: "strength",
  };

  assert.deepEqual(toApiShape(row), {
    id: "profile-uuid-123",
    userId: "pg-user-123",
    goals: ["strength"],
    fitnessLevel: "intermediate",
    injuryFlags: ["knee_issues"],
    goalNotes: "focus on legs",
    equipmentPreset: "commercial_gym",
    equipmentItemCodes: ["barbell", "dumbbells"],
    preferredDays: ["mon", "wed"],
    scheduleConstraints: "no evenings",
    heightCm: 180,
    weightKg: 80.5,
    minutesPerSession: 60,
    sex: "male",
    ageRange: "25_34",
    onboardingStepCompleted: 3,
    onboardingCompletedAt: "2026-01-01T00:00:00Z",
    programType: "strength",
  });
});

test("toApiShape applies null/empty defaults for missing fields", () => {
  const result = toApiShape({ bubble_client_profile_id: "buid-empty" });
  assert.deepEqual(result.goals, []);
  assert.deepEqual(result.injuryFlags, []);
  assert.deepEqual(result.equipmentItemCodes, []);
  assert.deepEqual(result.preferredDays, []);
  assert.equal(result.goalNotes, "");
  assert.equal(result.scheduleConstraints, "");
  assert.equal(result.onboardingStepCompleted, 0);
  assert.equal(result.fitnessLevel, null);
  assert.equal(result.equipmentPreset, null);
  assert.equal(result.programType, null);
});

test("upsertUser returns { id } from RETURNING row", async () => {
  let capturedParams;
  const db = {
    async query(_sql, params) {
      capturedParams = params;
      return { rowCount: 1, rows: [{ id: "pg-uuid-abc" }] };
    },
  };
  const svc = makeClientProfileService(db);
  const result = await svc.upsertUser("bubble-user-1");
  assert.deepEqual(result, { id: "pg-uuid-abc" });
  assert.deepEqual(capturedParams, ["bubble-user-1"]);
});

test("upsertUser propagates DB error", async () => {
  const svc = makeClientProfileService(mockDb([new Error("connection refused")]));
  await assert.rejects(() => svc.upsertUser("x"), /connection refused/);
});

test("upsertProfile returns new profile UUID when INSERT succeeds", async () => {
  const svc = makeClientProfileService(mockDb([{ rowCount: 1, rows: [{ id: "profile-uuid-1" }] }]));
  const result = await svc.upsertProfile("pg-user-uuid", "bubble-user-1");
  assert.equal(result, "profile-uuid-1");
});

test("upsertProfile falls back to SELECT when INSERT conflicts (rowCount 0)", async () => {
  const svc = makeClientProfileService(mockDb([
    { rowCount: 0, rows: [] },
    { rowCount: 1, rows: [{ id: "existing-profile-uuid" }] },
  ]));
  const result = await svc.upsertProfile("pg-user-uuid", "bubble-user-1");
  assert.equal(result, "existing-profile-uuid");
});

test("upsertProfile returns null when both INSERT and SELECT return nothing", async () => {
  const svc = makeClientProfileService(mockDb([
    { rowCount: 0, rows: [] },
    { rowCount: 0, rows: [] },
  ]));
  const result = await svc.upsertProfile("pg-user-uuid", "bubble-user-1");
  assert.equal(result, null);
});

test("getProfileByBubbleUserId returns null when no row found", async () => {
  const svc = makeClientProfileService(mockDb([{ rowCount: 0, rows: [] }]));
  const result = await svc.getProfileByUserId("user-1");
  assert.equal(result, null);
});

test("getProfileByUserId returns toApiShape(row) when row found", async () => {
  const svc = makeClientProfileService(mockDb([
    { rowCount: 1, rows: [{ id: "profile-xyz", bubble_client_profile_id: "legacy-profile", main_goals_slugs: ["strength"] }] },
  ]));
  const result = await svc.getProfileByUserId("user-1");
  assert.equal(result.id, "profile-xyz");
  assert.deepEqual(result.goals, ["strength"]);
});

test("getProfileById returns toApiShape(row) when row found", async () => {
  const svc = makeClientProfileService(mockDb([
    { rowCount: 1, rows: [{ id: "profile-xyz", bubble_client_profile_id: "legacy-profile" }] },
  ]));
  const result = await svc.getProfileById("profile-xyz");
  assert.equal(result.id, "profile-xyz");
});

test("patchProfile returns null when no row matches", async () => {
  const svc = makeClientProfileService(mockDb([{ rowCount: 0, rows: [] }]));
  const result = await svc.patchProfile("buid-xyz", { fitnessLevel: "intermediate" });
  assert.equal(result, null);
});

test("patchProfile builds SET clause for known fields only", async () => {
  let capturedSql = "";
  const db = {
    async query(sql, _params) {
      capturedSql = sql;
      return { rowCount: 1, rows: [{ bubble_client_profile_id: "buid-xyz" }] };
    },
  };
  const svc = makeClientProfileService(db);
  await svc.patchProfile("buid-xyz", { fitnessLevel: "advanced", goals: ["strength"] });
  assert.match(capturedSql, /fitness_level_slug = \$1/);
  assert.match(capturedSql, /main_goals_slugs = \$2/);
  assert.match(capturedSql, /updated_at = now\(\)/);
  assert.match(capturedSql, /WHERE id::text = \$3/);
  assert.match(capturedSql, /OR bubble_client_profile_id = \$3/);
});

test("patchProfile ignores fields not in profileFieldToColumn", async () => {
  let capturedSql = "";
  const db = {
    async query(sql, _params) {
      capturedSql = sql;
      return { rowCount: 1, rows: [{ bubble_client_profile_id: "buid-xyz" }] };
    },
  };
  const svc = makeClientProfileService(db);
  await svc.patchProfile("buid-xyz", { unknownField: "x", fitnessLevel: "beginner" });
  assert.doesNotMatch(capturedSql, /unknown_field/);
  assert.match(capturedSql, /fitness_level_slug/);
});

test("patchProfile skips fields with undefined value", async () => {
  let capturedSql = "";
  const db = {
    async query(sql, _params) {
      capturedSql = sql;
      return { rowCount: 1, rows: [{ bubble_client_profile_id: "buid-xyz" }] };
    },
  };
  const svc = makeClientProfileService(db);
  await svc.patchProfile("buid-xyz", { fitnessLevel: undefined, goals: ["strength"] });
  assert.doesNotMatch(capturedSql, /fitness_level_slug/);
  assert.match(capturedSql, /main_goals_slugs/);
});

test("patchProfile empty patch only updates updated_at", async () => {
  let capturedSql = "";
  const db = {
    async query(sql, _params) {
      capturedSql = sql;
      return { rowCount: 1, rows: [{ bubble_client_profile_id: "buid-xyz" }] };
    },
  };
  const svc = makeClientProfileService(db);
  await svc.patchProfile("buid-xyz", {});
  assert.match(capturedSql, /updated_at = now\(\)/);
  assert.doesNotMatch(capturedSql, /fitness_level_slug/);
});

test("patchProfile returns toApiShape of updated row", async () => {
  const svc = makeClientProfileService(mockDb([
    { rowCount: 1, rows: [{ id: "profile-xyz", bubble_client_profile_id: "buid-xyz", fitness_level_slug: "advanced" }] },
  ]));
  const result = await svc.patchProfile("buid-xyz", { fitnessLevel: "advanced" });
  assert.equal(result.id, "profile-xyz");
  assert.equal(result.fitnessLevel, "advanced");
});
