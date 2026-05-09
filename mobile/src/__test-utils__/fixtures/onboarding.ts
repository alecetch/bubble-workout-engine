import type { OnboardingDraft } from "../../state/onboarding/types";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";

type OnboardingState = ReturnType<typeof useOnboardingStore.getState>;

export const DEFAULT_ONBOARDING_DRAFT: OnboardingDraft = {
  goals: [],
  fitnessLevel: null,
  injuryFlags: [],
  goalNotes: "",
  equipmentPresetCode: null,
  selectedEquipmentCodes: [],
  equipmentPreset: null,
  equipmentItemCodes: [],
  preferredDays: [],
  scheduleConstraints: "",
  heightCm: null,
  weightKg: null,
  minutesPerSession: null,
  sex: null,
  ageRange: null,
  anchorLifts: [],
  anchorLiftsSkipped: false,
  onboardingStepCompleted: 0,
};

export function buildOnboardingDraft(overrides?: Partial<OnboardingDraft>): OnboardingDraft {
  return { ...DEFAULT_ONBOARDING_DRAFT, ...overrides };
}

export function buildOnboardingStoreState(
  draftOverrides?: Partial<OnboardingDraft>,
  stateOverrides?: Partial<OnboardingState>,
): OnboardingState {
  const draft = buildOnboardingDraft(draftOverrides);
  return {
    userId: "user-test-1",
    clientProfileId: "profile-test-1",
    draft,
    currentStep: 1,
    attempted: { step1: false, step2: false, step2b: false, step3: false },
    touched: {},
    fieldErrors: {},
    isSaving: false,
    setIdentity: vi.fn(),
    setDraft: vi.fn(),
    setTouched: vi.fn(),
    setAttempted: vi.fn(),
    setCurrentStep: vi.fn(),
    setFieldErrors: vi.fn(),
    setIsSaving: vi.fn(),
    resetFromProfile: vi.fn(),
    applyInjuryExclusivity: vi.fn((next) => next),
    ...stateOverrides,
  };
}
