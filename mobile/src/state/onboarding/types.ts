export const GOAL_TYPES = [
  "Fat loss",
  "General fitness",
  "Strength",
  "Hypertrophy",
  "Hyrox competition",
  "Turf Games competition",
  "Endurance",
  "Rehab / return from injury",
] as const;

export type GoalType = (typeof GOAL_TYPES)[number];

export const EQUIPMENT_PRESETS = [
  "Commercial gym",
  "Crosfit/Hyrox gym",
  "Decent home gym",
  "Minimal equipment",
  "No equipment",
] as const;

export type EquipmentPreset = (typeof EQUIPMENT_PRESETS)[number];

export const FITNESS_LEVELS = ["Beginner", "Intermediate", "Advanced", "Elite"] as const;
export type FitnessLevel = (typeof FITNESS_LEVELS)[number];

export const INJURY_FLAGS = [
  "Shoulder issues",
  "Knee issues",
  "Lower back / spine",
  "Ankle / Foot",
  "Wrist / Elbow",
  "Cardiovascular limitations",
  "No known issues",
] as const;

export type InjuryFlag = (typeof INJURY_FLAGS)[number];

export const MINUTES_PER_SESSION = [40, 50, 60] as const;
export type MinutesPerSession = (typeof MINUTES_PER_SESSION)[number];

export const DAYS_OF_WEEK = ["Mon", "Tues", "Wed", "Thurs", "Fri", "Sat", "Sun"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const SEX_OPTIONS = ["Male", "Female", "Prefer not to say"] as const;
export type Sex = (typeof SEX_OPTIONS)[number];

export const AGE_RANGES = ["Under 18", "18–24", "25–34", "35–44", "45–54", "55–64", "65+"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export type OnboardingDraft = {
  goals: GoalType[];
  fitnessLevel: FitnessLevel | null;
  injuryFlags: InjuryFlag[];
  goalNotes: string;
  equipmentPreset: EquipmentPreset | null;
  equipmentItemCodes: string[];
  preferredDays: DayOfWeek[];
  scheduleConstraints: string;
  heightCm: number | null;
  weightKg: number | null;
  minutesPerSession: MinutesPerSession | null;
  sex: Sex | null;
  ageRange: AgeRange | null;
  onboardingStepCompleted: 0 | 1 | 2 | 3;
};

export type OnboardingStep = 1 | 2 | 3;

export type StepAttemptedState = {
  step1: boolean;
  step2: boolean;
  step3: boolean;
};

export type FieldErrors = Record<string, string>;

export type ProfileLike = Partial<OnboardingDraft> & Record<string, unknown>;

export const NO_KNOWN_ISSUES: InjuryFlag = "No known issues";

export const DEFAULT_ONBOARDING_DRAFT: OnboardingDraft = {
  goals: [],
  fitnessLevel: null,
  injuryFlags: [],
  goalNotes: "",
  equipmentPreset: null,
  equipmentItemCodes: [],
  preferredDays: [],
  scheduleConstraints: "",
  heightCm: null,
  weightKg: null,
  minutesPerSession: null,
  sex: null,
  ageRange: null,
  onboardingStepCompleted: 0,
};
