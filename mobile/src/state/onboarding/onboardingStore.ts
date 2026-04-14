import { create } from "zustand";
import {
  AGE_RANGES,
  DAYS_OF_WEEK,
  DEFAULT_ONBOARDING_DRAFT,
  FITNESS_LEVELS,
  GOAL_TYPES,
  INJURY_FLAGS,
  MINUTES_PER_SESSION,
  NO_KNOWN_ISSUES,
  SEX_OPTIONS,
  type AgeRange,
  type DayOfWeek,
  type EquipmentPreset,
  type FieldErrors,
  type FitnessLevel,
  type GoalType,
  type InjuryFlag,
  type MinutesPerSession,
  type OnboardingDraft,
  type OnboardingStep,
  type ProfileLike,
  type StepAttemptedState,
  type Sex,
} from "./types.js";

type OnboardingState = {
  userId: string | null;
  clientProfileId: string | null;
  draft: OnboardingDraft;
  currentStep: OnboardingStep;
  attempted: StepAttemptedState;
  touched: Record<string, boolean>;
  fieldErrors: FieldErrors;
  isSaving: boolean;
  setIdentity: (payload: { userId: string; clientProfileId: string | null }) => void;
  setDraft: (partial: Partial<OnboardingDraft>) => void;
  setTouched: (fieldKey: string) => void;
  setAttempted: (step: OnboardingStep) => void;
  setCurrentStep: (step: OnboardingStep) => void;
  setFieldErrors: (errors: FieldErrors) => void;
  setIsSaving: (value: boolean) => void;
  resetFromProfile: (profileLike: ProfileLike) => void;
  applyInjuryExclusivity: (nextInjuryFlags: InjuryFlag[]) => InjuryFlag[];
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function matchesLiteral<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return (allowed as readonly string[]).includes(raw) ? (raw as T[number]) : null;
}

function toGoalTypes(value: unknown): GoalType[] {
  return toStringArray(value).filter((item): item is GoalType =>
    (GOAL_TYPES as readonly string[]).includes(item),
  );
}

function toFitnessLevel(value: unknown): FitnessLevel | null {
  return matchesLiteral(value, FITNESS_LEVELS);
}

function toInjuryFlags(value: unknown): InjuryFlag[] {
  return toStringArray(value).filter((item): item is InjuryFlag =>
    (INJURY_FLAGS as readonly string[]).includes(item),
  );
}

function toEquipmentPreset(value: unknown): EquipmentPreset | null {
  const raw = String(value ?? "").trim();
  return raw ? raw : null;
}

function toDays(value: unknown): DayOfWeek[] {
  return toStringArray(value).filter((item): item is DayOfWeek =>
    (DAYS_OF_WEEK as readonly string[]).includes(item),
  );
}

function toMinutes(value: unknown): MinutesPerSession | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return (MINUTES_PER_SESSION as readonly number[]).includes(n) ? (n as MinutesPerSession) : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toSex(value: unknown): Sex | null {
  return matchesLiteral(value, SEX_OPTIONS);
}

function toAgeRange(value: unknown): AgeRange | null {
  return matchesLiteral(value, AGE_RANGES);
}

function applyExclusivity(flags: InjuryFlag[]): InjuryFlag[] {
  const unique = Array.from(new Set(flags));
  if (unique.includes(NO_KNOWN_ISSUES)) {
    return [NO_KNOWN_ISSUES];
  }
  return unique.filter((flag) => flag !== NO_KNOWN_ISSUES);
}

export function fromProfile(profileLike: ProfileLike): OnboardingDraft {
  const goals = toGoalTypes(profileLike.goals ?? profileLike.main_goals ?? profileLike.mainGoals ?? []);
  const fitnessLevel = toFitnessLevel(
    profileLike.fitnessLevel ?? profileLike.fitness_level ?? profileLike.fitness_level_slug,
  );
  const injuryFlags = applyExclusivity(
    toInjuryFlags(profileLike.injuryFlags ?? profileLike.injury_flags ?? profileLike.injury_flags_slugs ?? []),
  );
  const equipmentPreset = toEquipmentPreset(
    profileLike.equipmentPresetCode ??
      profileLike.equipmentPreset ??
      profileLike.equipment_preset ??
      profileLike.equipment_preset_slug,
  );
  const selectedEquipmentCodes = toStringArray(
    profileLike.selectedEquipmentCodes ??
      profileLike.equipmentItemCodes ??
      profileLike.equipment_item_codes ??
      profileLike.equipment_items_slugs ??
      [],
  );
  const preferredDays = toDays(profileLike.preferredDays ?? profileLike.preferred_days ?? []);

  return {
    goals,
    fitnessLevel,
    injuryFlags,
    goalNotes: String(profileLike.goalNotes ?? profileLike.goal_notes ?? ""),
    equipmentPresetCode: equipmentPreset,
    selectedEquipmentCodes,
    equipmentPreset,
    equipmentItemCodes: selectedEquipmentCodes,
    preferredDays,
    scheduleConstraints: String(profileLike.scheduleConstraints ?? profileLike.schedule_constraints ?? ""),
    heightCm: toNumberOrNull(profileLike.heightCm ?? profileLike.height_cm),
    weightKg: toNumberOrNull(profileLike.weightKg ?? profileLike.weight_kg),
    minutesPerSession: toMinutes(profileLike.minutesPerSession ?? profileLike.minutes_per_session),
    sex: toSex(profileLike.sex),
    ageRange: toAgeRange(profileLike.ageRange ?? profileLike.age_range),
    anchorLifts: [],
    anchorLiftsSkipped: Boolean(profileLike.anchorLiftsSkipped ?? profileLike.anchor_lifts_skipped ?? false),
    onboardingStepCompleted:
      (Number(profileLike.onboardingStepCompleted ?? profileLike.onboarding_step_completed ?? 0) as 0 | 1 | 2 | 3) ||
      0,
  };
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  userId: null,
  clientProfileId: null,
  draft: DEFAULT_ONBOARDING_DRAFT,
  currentStep: 1,
  attempted: {
    step1: false,
    step2: false,
    step2b: false,
    step3: false,
  },
  touched: {},
  fieldErrors: {},
  isSaving: false,
  setIdentity: ({ userId, clientProfileId }) => {
    set({ userId, clientProfileId });
  },
  setDraft: (partial) => {
    set((state) => {
      const merged = { ...state.draft, ...partial };
      if (Object.prototype.hasOwnProperty.call(partial, "equipmentPresetCode")) {
        merged.equipmentPreset = partial.equipmentPresetCode ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(partial, "selectedEquipmentCodes")) {
        merged.equipmentItemCodes = partial.selectedEquipmentCodes ?? [];
      }
      if (Object.prototype.hasOwnProperty.call(partial, "equipmentPreset")) {
        merged.equipmentPresetCode = partial.equipmentPreset ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(partial, "equipmentItemCodes")) {
        merged.selectedEquipmentCodes = partial.equipmentItemCodes ?? [];
      }
      if (partial.injuryFlags) {
        merged.injuryFlags = applyExclusivity(partial.injuryFlags);
      }
      return { draft: merged };
    });
  },
  setTouched: (fieldKey) => {
    set((state) => ({ touched: { ...state.touched, [fieldKey]: true } }));
  },
  setAttempted: (step) => {
    const stepKey = `step${step}` as keyof StepAttemptedState;
    set((state) => ({
      attempted: { ...state.attempted, [stepKey]: true },
    }));
  },
  setCurrentStep: (step) => {
    set({ currentStep: step });
  },
  setFieldErrors: (errors) => {
    set({ fieldErrors: errors });
  },
  setIsSaving: (value) => {
    set({ isSaving: value });
  },
  resetFromProfile: (profileLike) => {
    const draft = {
      ...DEFAULT_ONBOARDING_DRAFT,
      ...fromProfile(profileLike),
    };

    set({
      draft,
      touched: {},
      fieldErrors: {},
      attempted: {
        step1: false,
        step2: false,
        step2b: false,
        step3: false,
      },
      currentStep: 1,
      isSaving: false,
    });
  },
  applyInjuryExclusivity: (nextInjuryFlags) => {
    const normalized = applyExclusivity(nextInjuryFlags);
    set((state) => ({
      draft: {
        ...state.draft,
        injuryFlags: normalized,
      },
    }));
    return normalized;
  },
}));

export function getOnboardingDraft(): OnboardingDraft {
  return useOnboardingStore.getState().draft;
}

export function applyInjuryExclusivity(nextInjuryFlags: InjuryFlag[]): InjuryFlag[] {
  return useOnboardingStore.getState().applyInjuryExclusivity(nextInjuryFlags);
}

export function setOnboardingDraft(partial: Partial<OnboardingDraft>): void {
  useOnboardingStore.getState().setDraft(partial);
}
