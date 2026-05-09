import { beforeEach, describe, expect, it } from "vitest";
import { useOnboardingStore } from "./onboardingStore";
import { DEFAULT_ONBOARDING_DRAFT } from "./types";

function resetStore(): void {
  useOnboardingStore.setState({
    userId: null,
    clientProfileId: null,
    draft: DEFAULT_ONBOARDING_DRAFT,
    currentStep: 1,
    attempted: { step1: false, step2: false, step2b: false, step3: false },
    touched: {},
    fieldErrors: {},
    isSaving: false,
  });
}

function profile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    goals: ["Strength"],
    fitnessLevel: "Intermediate",
    preferred_days: ["Mon", "Wed"],
    minutes_per_session: 45,
    scheduleConstraints: "",
    heightCm: null,
    weightKg: null,
    sex: null,
    ageRange: null,
    equipment_items_slugs: [],
    equipment_preset_slug: null,
    onboardingStepCompleted: 1,
    injuryFlags: [],
    goalNotes: null,
    ...overrides,
  };
}

describe("useOnboardingStore", () => {
  beforeEach(resetStore);

  it("starts with the expected draft shape", () => {
    const draft = useOnboardingStore.getState().draft;
    expect(draft).toBeDefined();
    expect(draft.goals).toEqual([]);
    expect(draft.fitnessLevel).toBeNull();
  });

  it("resetFromProfile maps goals", () => {
    useOnboardingStore.getState().resetFromProfile(profile());
    expect(useOnboardingStore.getState().draft.goals).toContain("Strength");
  });

  it("resetFromProfile maps fitnessLevel", () => {
    useOnboardingStore.getState().resetFromProfile(profile());
    expect(useOnboardingStore.getState().draft.fitnessLevel).toBe("Intermediate");
  });

  it("resetFromProfile maps preferred_days to preferredDays", () => {
    useOnboardingStore.getState().resetFromProfile(profile({ preferred_days: ["Mon", "Fri"] }));
    expect(useOnboardingStore.getState().draft.preferredDays).toEqual(["Mon", "Fri"]);
  });

  it("resetFromProfile maps equipment_items_slugs", () => {
    useOnboardingStore.getState().resetFromProfile(
      profile({ equipment_items_slugs: ["barbell", "dumbbells"] }),
    );
    expect(useOnboardingStore.getState().draft.selectedEquipmentCodes).toEqual([
      "barbell",
      "dumbbells",
    ]);
    expect(useOnboardingStore.getState().draft.equipmentItemCodes).toEqual([
      "barbell",
      "dumbbells",
    ]);
  });

  it("resetFromProfile maps equipment_preset_slug", () => {
    useOnboardingStore.getState().resetFromProfile(profile({ equipment_preset_slug: "full_gym" }));
    expect(useOnboardingStore.getState().draft.equipmentPresetCode).toBe("full_gym");
    expect(useOnboardingStore.getState().draft.equipmentPreset).toBe("full_gym");
  });

  it("resetFromProfile maps minutes_per_session", () => {
    useOnboardingStore.getState().resetFromProfile(profile({ minutes_per_session: 60 }));
    expect(useOnboardingStore.getState().draft.minutesPerSession).toBe(60);
  });

  it("resetFromProfile maps onboardingStepCompleted", () => {
    useOnboardingStore.getState().resetFromProfile(profile({ onboardingStepCompleted: 2 }));
    expect(useOnboardingStore.getState().draft.onboardingStepCompleted).toBeGreaterThanOrEqual(2);
  });

  it("can clear a populated draft by resetting from an empty profile", () => {
    useOnboardingStore.getState().resetFromProfile(profile());
    useOnboardingStore.getState().resetFromProfile({});
    expect(useOnboardingStore.getState().draft.goals).toEqual([]);
  });

  it("uses the latest resetFromProfile payload without merging stale goals", () => {
    useOnboardingStore.getState().resetFromProfile(profile({ goals: ["Strength"] }));
    useOnboardingStore.getState().resetFromProfile(profile({ goals: ["Conditioning"] }));
    expect(useOnboardingStore.getState().draft.goals).toEqual(["Conditioning"]);
  });
});
