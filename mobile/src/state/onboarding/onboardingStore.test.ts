import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ONBOARDING_DRAFT, type ProfileLike } from "./types.js";
import { fromProfile } from "./onboardingStore.js";

test("fromProfile maps camelCase profile fields into onboarding draft", () => {
  const draft = fromProfile({
    goals: ["Strength"],
    fitnessLevel: "Intermediate",
    injuryFlags: ["Shoulder issues", "No known issues"],
    goalNotes: "Build strength",
    equipmentPresetCode: "commercial_gym",
    selectedEquipmentCodes: ["barbell", "bench"],
    preferredDays: ["Mon", "Thurs"],
    scheduleConstraints: "No Sundays",
    heightCm: 182,
    weightKg: 86,
    minutesPerSession: 50,
    sex: "Male",
    ageRange: "25-34",
    anchorLifts: [
      {
        estimationFamily: "squat",
        exerciseId: "bb_back_squat",
        loadKg: 100,
        reps: 5,
        rir: 2,
        skipped: false,
      },
    ],
    anchorLiftsSkipped: true,
    onboardingStepCompleted: 3,
  } as ProfileLike);

  assert.deepEqual(draft, {
    ...DEFAULT_ONBOARDING_DRAFT,
    goals: ["Strength"],
    fitnessLevel: "Intermediate",
    injuryFlags: ["No known issues"],
    goalNotes: "Build strength",
    equipmentPresetCode: "commercial_gym",
    selectedEquipmentCodes: ["barbell", "bench"],
    equipmentPreset: "commercial_gym",
    equipmentItemCodes: ["barbell", "bench"],
    preferredDays: ["Mon", "Thurs"],
    scheduleConstraints: "No Sundays",
    heightCm: 182,
    weightKg: 86,
    minutesPerSession: 50,
    sex: "Male",
    ageRange: "25-34",
    anchorLifts: [],
    anchorLiftsSkipped: true,
    onboardingStepCompleted: 3,
  } satisfies ProfileLike);
});

test("fromProfile maps snake_case profile fields into onboarding draft", () => {
  const draft = fromProfile({
    main_goals: ["Hypertrophy"],
    fitness_level: "Advanced",
    injury_flags: ["Knee issues"],
    goal_notes: "Muscle gain",
    equipment_preset_slug: "home_gym",
    equipment_items_slugs: ["dumbbell", "bands"],
    preferred_days: ["Tues", "Sat"],
    schedule_constraints: "Morning sessions",
    height_cm: "175",
    weight_kg: "72",
    minutes_per_session: 40,
    sex: "Female",
    age_range: "35-44",
    anchor_lifts_skipped: true,
    onboarding_step_completed: 2,
  } as ProfileLike);

  assert.deepEqual(draft, {
    ...DEFAULT_ONBOARDING_DRAFT,
    goals: ["Hypertrophy"],
    fitnessLevel: "Advanced",
    injuryFlags: ["Knee issues"],
    goalNotes: "Muscle gain",
    equipmentPresetCode: "home_gym",
    selectedEquipmentCodes: ["dumbbell", "bands"],
    equipmentPreset: "home_gym",
    equipmentItemCodes: ["dumbbell", "bands"],
    preferredDays: ["Tues", "Sat"],
    scheduleConstraints: "Morning sessions",
    heightCm: 175,
    weightKg: 72,
    minutesPerSession: 40,
    sex: "Female",
    ageRange: "35-44",
    anchorLifts: [],
    anchorLiftsSkipped: true,
    onboardingStepCompleted: 2,
  });
});

test("fromProfile falls back safely when keys are missing or invalid", () => {
  const draft = fromProfile({
    goals: ["Not a real goal"],
    fitnessLevel: "Expert",
    injuryFlags: ["Not real"],
    minutesPerSession: 999,
    heightCm: "abc",
    weightKg: "",
    preferredDays: ["Funday"],
  } as any);

  assert.deepEqual(draft, {
    ...DEFAULT_ONBOARDING_DRAFT,
    anchorLifts: [],
    anchorLiftsSkipped: false,
    onboardingStepCompleted: 0,
  });
});

test("fromProfile restores anchorLiftsSkipped and always resets anchorLifts to an empty array", () => {
  const draft = fromProfile({
    fitnessLevel: "Intermediate",
    anchorLifts: [
      {
        estimationFamily: "hinge",
        exerciseId: "bb_rdl",
        loadKg: 120,
        reps: 6,
        rir: 1,
        skipped: false,
      },
    ],
    anchorLiftsSkipped: true,
  } as ProfileLike);

  assert.equal(draft.anchorLiftsSkipped, true);
  assert.deepEqual(draft.anchorLifts, []);
});
