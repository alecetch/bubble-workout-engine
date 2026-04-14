import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ONBOARDING_DRAFT, type OnboardingDraft } from "./types.js";
import { ERROR_MESSAGES, validateAll, validateStep } from "./validators.js";

function makeValidDraft(): OnboardingDraft {
  return {
    ...DEFAULT_ONBOARDING_DRAFT,
    goals: ["Strength"],
    fitnessLevel: "Intermediate",
    injuryFlags: ["No known issues"],
    equipmentPresetCode: "commercial_gym",
    selectedEquipmentCodes: ["barbell"],
    equipmentPreset: "commercial_gym",
    equipmentItemCodes: ["barbell"],
    preferredDays: ["Mon", "Wed"],
    minutesPerSession: 50,
    heightCm: 180,
    weightKg: 80,
    sex: "Male",
    ageRange: "25-34",
  };
}

test("validateStep(1) reports missing goals", () => {
  const result = validateStep(1, { ...makeValidDraft(), goals: [] });
  assert.equal(result.fieldErrors.goals, ERROR_MESSAGES.goalsRequired);
});

test("validateStep(1) reports missing fitness level", () => {
  const result = validateStep(1, { ...makeValidDraft(), fitnessLevel: null });
  assert.equal(result.fieldErrors.fitnessLevel, ERROR_MESSAGES.fitnessLevelRequired);
});

test("validateStep(1) reports missing injury flags", () => {
  const result = validateStep(1, { ...makeValidDraft(), injuryFlags: [] });
  assert.equal(result.fieldErrors.injuryFlags, ERROR_MESSAGES.injuryFlagsRequired);
});

test("validateStep(1) passes for valid draft", () => {
  const result = validateStep(1, makeValidDraft());
  assert.equal(result.isValid, true);
  assert.deepEqual(result.fieldErrors, {});
});

test("validateStep(1) reports only fitness level when goals are present", () => {
  const result = validateStep(1, { ...makeValidDraft(), fitnessLevel: null });
  assert.equal(result.fieldErrors.fitnessLevel, ERROR_MESSAGES.fitnessLevelRequired);
  assert.equal("goals" in result.fieldErrors, false);
});

test("validateStep(2) reports missing equipment preset", () => {
  const result = validateStep(2, { ...makeValidDraft(), equipmentPresetCode: null, equipmentPreset: null });
  assert.equal(result.fieldErrors.equipmentPreset, ERROR_MESSAGES.equipmentPresetRequired);
});

test("validateStep(2) reports missing equipment items", () => {
  const result = validateStep(2, {
    ...makeValidDraft(),
    selectedEquipmentCodes: [],
    equipmentItemCodes: [],
  });
  assert.equal(result.fieldErrors.equipmentItemCodes, ERROR_MESSAGES.equipmentItemsRequired);
});

test("validateStep(2) passes when equipment preset and items are present", () => {
  const result = validateStep(2, makeValidDraft());
  assert.equal(result.isValid, true);
});

test("validateStep(2b) is always valid", () => {
  const result = validateStep("2b", { ...DEFAULT_ONBOARDING_DRAFT });
  assert.equal(result.isValid, true);
  assert.deepEqual(result.fieldErrors, {});
});

test("validateStep(3) reports missing preferred days", () => {
  const result = validateStep(3, { ...makeValidDraft(), preferredDays: [] });
  assert.equal(result.fieldErrors.preferredDays, ERROR_MESSAGES.preferredDaysRequired);
});

test("validateStep(3) reports missing minutes per session", () => {
  const result = validateStep(3, { ...makeValidDraft(), minutesPerSession: null });
  assert.equal(result.fieldErrors.minutesPerSession, ERROR_MESSAGES.minutesRequired);
});

test("validateStep(3) reports height below minimum", () => {
  const result = validateStep(3, { ...makeValidDraft(), heightCm: 99 });
  assert.equal(result.fieldErrors.heightCm, ERROR_MESSAGES.heightRange);
});

test("validateStep(3) reports height above maximum", () => {
  const result = validateStep(3, { ...makeValidDraft(), heightCm: 251 });
  assert.equal(result.fieldErrors.heightCm, ERROR_MESSAGES.heightRange);
});

test("validateStep(3) accepts height at lower boundary", () => {
  const result = validateStep(3, { ...makeValidDraft(), heightCm: 100 });
  assert.equal(result.fieldErrors.heightCm, undefined);
});

test("validateStep(3) accepts height at upper boundary", () => {
  const result = validateStep(3, { ...makeValidDraft(), heightCm: 250 });
  assert.equal(result.fieldErrors.heightCm, undefined);
});

test("validateStep(3) reports weight below minimum", () => {
  const result = validateStep(3, { ...makeValidDraft(), weightKg: 29 });
  assert.equal(result.fieldErrors.weightKg, ERROR_MESSAGES.weightRange);
});

test("validateStep(3) reports weight above maximum", () => {
  const result = validateStep(3, { ...makeValidDraft(), weightKg: 301 });
  assert.equal(result.fieldErrors.weightKg, ERROR_MESSAGES.weightRange);
});

test("validateStep(3) reports missing sex", () => {
  const result = validateStep(3, { ...makeValidDraft(), sex: null });
  assert.equal(result.fieldErrors.sex, ERROR_MESSAGES.sexRequired);
});

test("validateStep(3) rejects under-18 age range", () => {
  const result = validateStep(3, { ...makeValidDraft(), ageRange: "Under 18" });
  assert.equal(result.fieldErrors.ageRange, ERROR_MESSAGES.ageRangeUnder18);
});

test("validateStep(3) passes for valid draft", () => {
  const result = validateStep(3, makeValidDraft());
  assert.equal(result.isValid, true);
});

test("validateAll reports all steps valid for valid draft", () => {
  assert.deepEqual(validateAll(makeValidDraft()), {
    step1Valid: true,
    step2Valid: true,
    step3Valid: true,
  });
});

test("validateAll reports invalid step 1 independently", () => {
  const result = validateAll({ ...makeValidDraft(), goals: [] });
  assert.equal(result.step1Valid, false);
  assert.equal(result.step2Valid, true);
  assert.equal(result.step3Valid, true);
});
