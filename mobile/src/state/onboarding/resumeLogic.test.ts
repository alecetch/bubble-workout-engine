import { DEFAULT_ONBOARDING_DRAFT, type OnboardingDraft } from "./types.js";
import { getResumeStep } from "./resumeLogic.js";
function makeCompleteDraft(): OnboardingDraft {
    return {
        ...DEFAULT_ONBOARDING_DRAFT,
        goals: ["Hypertrophy"],
        fitnessLevel: "Intermediate",
        injuryFlags: ["No known issues"],
        equipmentPresetCode: "commercial_gym",
        selectedEquipmentCodes: ["barbell"],
        equipmentPreset: "commercial_gym",
        equipmentItemCodes: ["barbell"],
        preferredDays: ["Mon", "Wed", "Fri"],
        minutesPerSession: 50,
        heightCm: 180,
        weightKg: 80,
        sex: "Male",
        ageRange: "25-34",
    };
}
test("getResumeStep returns step 1 when goals are missing", () => {
    expect(getResumeStep({ ...makeCompleteDraft(), goals: [] })).toBe(1);
});
test("getResumeStep returns step 2 when step 1 is valid and step 2 is invalid", () => {
    const draft = {
        ...makeCompleteDraft(),
        equipmentPresetCode: null,
        equipmentPreset: null,
        selectedEquipmentCodes: [],
        equipmentItemCodes: [],
    };
    expect(getResumeStep(draft)).toBe(2);
});
test("getResumeStep returns 2b for non-beginners with no anchor lifts and not skipped", () => {
    const draft = {
        ...makeCompleteDraft(),
        anchorLifts: [],
        anchorLiftsSkipped: false,
    };
    expect(getResumeStep(draft)).toBe("2b");
});
test("getResumeStep skips 2b when non-beginner has skipped anchor lifts", () => {
    const draft = {
        ...makeCompleteDraft(),
        anchorLiftsSkipped: true,
        preferredDays: [],
    };
    expect(getResumeStep(draft)).toBe(3);
});
test("getResumeStep skips 2b when non-beginner has at least one anchor lift", () => {
    const draft = {
        ...makeCompleteDraft(),
        anchorLiftsSkipped: false,
        anchorLifts: [{
                estimationFamily: "squat",
                exerciseId: "bb_back_squat",
                loadKg: 100,
                reps: 5,
                rir: 2,
                skipped: false,
            }],
        preferredDays: [],
    };
    expect(getResumeStep(draft)).toBe(3);
});
test("getResumeStep always skips 2b for beginners", () => {
    const draft = {
        ...makeCompleteDraft(),
        fitnessLevel: "Beginner" as const,
        preferredDays: [],
    };
    expect(getResumeStep(draft)).toBe(3);
});
test("getResumeStep returns done for valid non-beginner draft when 2b was skipped", () => {
    const draft = {
        ...makeCompleteDraft(),
        anchorLiftsSkipped: true,
    };
    expect(getResumeStep(draft)).toBe("done");
});
test("getResumeStep returns done for valid non-beginner draft with anchor lifts", () => {
    const draft = {
        ...makeCompleteDraft(),
        anchorLifts: [{
                estimationFamily: "squat",
                exerciseId: "bb_back_squat",
                loadKg: 100,
                reps: 5,
                rir: 2,
                skipped: false,
            }],
    };
    expect(getResumeStep(draft)).toBe("done");
});
test("getResumeStep returns step 3 when earlier steps are complete but step 3 is invalid", () => {
    const draft = {
        ...makeCompleteDraft(),
        anchorLiftsSkipped: true,
        preferredDays: [],
    };
    expect(getResumeStep(draft)).toBe(3);
});
