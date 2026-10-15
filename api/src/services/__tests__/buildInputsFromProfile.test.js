import test from "node:test";
import assert from "node:assert/strict";
import { buildInputsFromProfile } from "../buildInputsFromProfile.js";

test('both engine catalogue representations retain substitute flags', () => {
  for (const is_substitute of [true, 'true', false, undefined]) {
    const inputs = buildInputsFromProfile({}, [{ exercise_id: 'station', is_substitute }]);
    const expected = is_substitute === true || is_substitute === 'true';
    assert.equal(inputs.exercises.response.results[0].is_substitute, expected);
    assert.equal(inputs.configs.catalogBuilds.response.results[0].catalog_json.ex[0].is_substitute, expected);
  }
});

function makeProfile(overrides = {}) {
  return {
    preferredDays: ["Mon", "Wed", "Fri"],
    equipmentItemCodes: ["Barbell", "Dumbbells"],
    injuryFlags: [],
    goals: ["Strength"],
    minutesPerSession: 60,
    fitnessLevel: "beginner",
    equipmentPreset: "Commercial Gym",
    goalNotes: "",
    scheduleConstraints: "",
    heightCm: null,
    weightKg: null,
    ...overrides,
  };
}

test("buildInputsFromProfile slugifies equipmentItemCodes", () => {
  const result = buildInputsFromProfile(makeProfile(), []);

  assert.deepEqual(
    result.clientProfile.response.equipment_items_slugs,
    ["barbell", "dumbbells"],
  );
});

test("buildInputsFromProfile slugifies equipmentPreset", () => {
  const result = buildInputsFromProfile(
    makeProfile({ equipmentPreset: "Commercial Gym", equipmentItemCodes: [] }),
    [],
  );

  assert.equal(result.clientProfile.response.equipment_preset_slug, "commercial_gym");
});

test("buildInputsFromProfile keeps empty equipmentItemCodes as []", () => {
  const result = buildInputsFromProfile(
    makeProfile({ equipmentItemCodes: [], equipmentPreset: null }),
    [],
  );

  assert.ok(Object.hasOwn(result.clientProfile.response, "equipment_items_slugs"));
  assert.deepEqual(result.clientProfile.response.equipment_items_slugs, []);
});

test("buildInputsFromProfile maps null equipmentItemCodes to []", () => {
  const result = buildInputsFromProfile(
    makeProfile({ equipmentItemCodes: null, equipmentPreset: null }),
    [],
  );

  assert.deepEqual(result.clientProfile.response.equipment_items_slugs, []);
});

test("buildInputsFromProfile does not set allowed_exercise_ids", () => {
  const result = buildInputsFromProfile(
    makeProfile({ equipmentItemCodes: ["barbell"], equipmentPreset: "commercial_gym" }),
    [],
  );

  assert.ok(
    !Object.hasOwn(result, "allowed_exercise_ids"),
    "allowed_exercise_ids must be resolved separately from getAllowedExerciseIds",
  );
});
