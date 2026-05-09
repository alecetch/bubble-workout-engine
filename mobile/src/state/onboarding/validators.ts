import type { FieldErrors, OnboardingDraft, OnboardingStep } from "./types";

export const ERROR_MESSAGES = {
  goalsRequired: "Select at least one goal.",
  fitnessLevelRequired: "Select your fitness level.",
  injuryFlagsRequired: "Select at least one injury option.",
  equipmentPresetRequired: "Select an equipment preset.",
  equipmentItemsRequired: "Select at least one equipment item.",
  preferredDaysRequired: "Select at least one preferred day.",
  minutesRequired: "Select minutes per session.",
  heightRequired: "Enter your height in cm.",
  heightRange: "Height must be between 100 and 250 cm.",
  weightRequired: "Enter your weight in kg.",
  weightRange: "Weight must be between 30 and 300 kg.",
  sexRequired: "Select your sex.",
  ageRangeRequired: "Select your age range.",
  ageRangeUnder18: "You must be 18 or older to continue.",
} as const;

function validateStep1(draft: OnboardingDraft): FieldErrors {
  const errors: FieldErrors = {};

  if (draft.goals.length < 1) {
    errors.goals = ERROR_MESSAGES.goalsRequired;
  }

  if (!draft.fitnessLevel) {
    errors.fitnessLevel = ERROR_MESSAGES.fitnessLevelRequired;
  }

  if (draft.injuryFlags.length < 1) {
    errors.injuryFlags = ERROR_MESSAGES.injuryFlagsRequired;
  }

  return errors;
}

function validateStep2(draft: OnboardingDraft): FieldErrors {
  const errors: FieldErrors = {};

  if (!draft.equipmentPresetCode) {
    errors.equipmentPreset = ERROR_MESSAGES.equipmentPresetRequired;
  }

  if (draft.selectedEquipmentCodes.length < 1) {
    errors.equipmentItemCodes = ERROR_MESSAGES.equipmentItemsRequired;
  }

  return errors;
}

function validateStep3(draft: OnboardingDraft): FieldErrors {
  const errors: FieldErrors = {};

  if (draft.preferredDays.length < 1) {
    errors.preferredDays = ERROR_MESSAGES.preferredDaysRequired;
  }

  if (draft.minutesPerSession == null) {
    errors.minutesPerSession = ERROR_MESSAGES.minutesRequired;
  }

  if (draft.heightCm == null) {
    errors.heightCm = ERROR_MESSAGES.heightRequired;
  } else if (draft.heightCm < 100 || draft.heightCm > 250) {
    errors.heightCm = ERROR_MESSAGES.heightRange;
  }

  if (draft.weightKg == null) {
    errors.weightKg = ERROR_MESSAGES.weightRequired;
  } else if (draft.weightKg < 30 || draft.weightKg > 300) {
    errors.weightKg = ERROR_MESSAGES.weightRange;
  }

  if (!draft.sex) {
    errors.sex = ERROR_MESSAGES.sexRequired;
  }

  if (!draft.ageRange) {
    errors.ageRange = ERROR_MESSAGES.ageRangeRequired;
  } else if (draft.ageRange === "Under 18") {
    errors.ageRange = ERROR_MESSAGES.ageRangeUnder18;
  }

  return errors;
}

export function validateStep(step: OnboardingStep, draft: OnboardingDraft): {
  isValid: boolean;
  fieldErrors: FieldErrors;
} {
  const fieldErrors =
    step === 1
      ? validateStep1(draft)
      : step === 2
        ? validateStep2(draft)
        : step === "2b"
          ? {}
          : validateStep3(draft);

  return {
    isValid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}

export function validateAll(draft: OnboardingDraft): {
  step1Valid: boolean;
  step2Valid: boolean;
  step3Valid: boolean;
} {
  const step1Valid = validateStep(1, draft).isValid;
  const step2Valid = validateStep(2, draft).isValid;
  const step3Valid = validateStep(3, draft).isValid;

  return {
    step1Valid,
    step2Valid,
    step3Valid,
  };
}
