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
    expect(result.fieldErrors.goals).toBe(ERROR_MESSAGES.goalsRequired);
});
test("validateStep(1) reports missing fitness level", () => {
    const result = validateStep(1, { ...makeValidDraft(), fitnessLevel: null });
    expect(result.fieldErrors.fitnessLevel).toBe(ERROR_MESSAGES.fitnessLevelRequired);
});
test("validateStep(1) reports missing injury flags", () => {
    const result = validateStep(1, { ...makeValidDraft(), injuryFlags: [] });
    expect(result.fieldErrors.injuryFlags).toBe(ERROR_MESSAGES.injuryFlagsRequired);
});
test("validateStep(1) passes for valid draft", () => {
    const result = validateStep(1, makeValidDraft());
    expect(result.isValid).toBe(true);
    expect(result.fieldErrors).toEqual({});
});
test("validateStep(1) reports only fitness level when goals are present", () => {
    const result = validateStep(1, { ...makeValidDraft(), fitnessLevel: null });
    expect(result.fieldErrors.fitnessLevel).toBe(ERROR_MESSAGES.fitnessLevelRequired);
    expect("goals" in result.fieldErrors).toBe(false);
});
test("validateStep(2) reports missing equipment preset", () => {
    const result = validateStep(2, { ...makeValidDraft(), equipmentPresetCode: null, equipmentPreset: null });
    expect(result.fieldErrors.equipmentPreset).toBe(ERROR_MESSAGES.equipmentPresetRequired);
});
test("validateStep(2) reports missing equipment items", () => {
    const result = validateStep(2, {
        ...makeValidDraft(),
        selectedEquipmentCodes: [],
        equipmentItemCodes: [],
    });
    expect(result.fieldErrors.equipmentItemCodes).toBe(ERROR_MESSAGES.equipmentItemsRequired);
});
test("validateStep(2) passes when equipment preset and items are present", () => {
    const result = validateStep(2, makeValidDraft());
    expect(result.isValid).toBe(true);
});
test("validateStep(2b) is always valid", () => {
    const result = validateStep("2b", { ...DEFAULT_ONBOARDING_DRAFT });
    expect(result.isValid).toBe(true);
    expect(result.fieldErrors).toEqual({});
});
test("validateStep(3) reports missing preferred days", () => {
    const result = validateStep(3, { ...makeValidDraft(), preferredDays: [] });
    expect(result.fieldErrors.preferredDays).toBe(ERROR_MESSAGES.preferredDaysRequired);
});
test("validateStep(3) reports missing minutes per session", () => {
    const result = validateStep(3, { ...makeValidDraft(), minutesPerSession: null });
    expect(result.fieldErrors.minutesPerSession).toBe(ERROR_MESSAGES.minutesRequired);
});
test("validateStep(3) ignores body metric ranges", () => {
    const result = validateStep(3, { ...makeValidDraft(), heightCm: 99 });
    expect(result.fieldErrors.heightCm).toBe(undefined);
});
test("validateStep(3) accepts height at lower boundary", () => {
    const result = validateStep(3, { ...makeValidDraft(), heightCm: 100 });
    expect(result.fieldErrors.heightCm).toBe(undefined);
});
test("validateStep(3) accepts height at upper boundary", () => {
    const result = validateStep(3, { ...makeValidDraft(), heightCm: 250 });
    expect(result.fieldErrors.heightCm).toBe(undefined);
});
test("validateStep(3) ignores body weight ranges", () => {
    const result = validateStep(3, { ...makeValidDraft(), weightKg: 29 });
    expect(result.fieldErrors.weightKg).toBe(undefined);
});
test("validateStep(3) reports missing sex", () => {
    const result = validateStep(3, { ...makeValidDraft(), sex: null });
    expect(result.fieldErrors.sex).toBe(ERROR_MESSAGES.sexRequired);
});
test("validateStep(3) rejects under-18 age range", () => {
    const result = validateStep(3, { ...makeValidDraft(), ageRange: "Under 18" });
    expect(result.fieldErrors.ageRange).toBe(ERROR_MESSAGES.ageRangeUnder18);
});
test("validateStep(3) passes for valid draft", () => {
    const result = validateStep(3, makeValidDraft());
    expect(result.isValid).toBe(true);
});
test("validateStep(4) is always valid", () => {
    const result = validateStep(4, { ...makeValidDraft(), heightCm: null, weightKg: null });
    expect(result.isValid).toBe(true);
    expect(result.fieldErrors).toEqual({});
});
test("validateAll reports all steps valid for valid draft", () => {
    expect(validateAll(makeValidDraft())).toEqual({
        step1Valid: true,
        step2Valid: true,
        step3Valid: true,
        step4Valid: true,
    });
});
test("validateAll reports invalid step 1 independently", () => {
    const result = validateAll({ ...makeValidDraft(), goals: [] });
    expect(result.step1Valid).toBe(false);
    expect(result.step2Valid).toBe(true);
    expect(result.step3Valid).toBe(true);
});
