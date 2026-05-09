export const GOAL_TYPES = [
  "Strength",
  "Hypertrophy",
  "Conditioning",
  "HYROX Workout",
] as const;

export type GoalType = (typeof GOAL_TYPES)[number];

export type EquipmentPreset = string;

export type AnchorLiftEntry = {
  estimationFamily: string;
  exerciseId: string | null;
  loadKg: number | null;
  reps: number | null;
  rir: number | null;
  skipped: boolean;
  source?: string | null;
  sourceDetailJson?: Record<string, unknown> | null;
};

export const ESTIMATION_FAMILIES = [
  "squat",
  "hinge",
  "horizontal_press",
  "vertical_press",
  "horizontal_pull",
  "vertical_pull",
] as const;

export type EstimationFamily = (typeof ESTIMATION_FAMILIES)[number];

export const ESTIMATION_FAMILY_LABELS: Record<EstimationFamily, string> = {
  squat: "Squat",
  hinge: "Hinge (Deadlift / RDL)",
  horizontal_press: "Horizontal Press (Bench / Push)",
  vertical_press: "Vertical Press (Overhead)",
  horizontal_pull: "Horizontal Pull (Row)",
  vertical_pull: "Vertical Pull (Pulldown / Pull-up)",
};

export type RirOption = {
  label: string;
  value: number;
};

export const RIR_OPTIONS: RirOption[] = [
  { label: "Max effort (0 RIR)", value: 0 },
  { label: "Hard (~1 RIR)", value: 1 },
  { label: "Moderate (~2-3 RIR)", value: 2.5 },
  { label: "Easy (4+ RIR)", value: 4 },
];

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

export const AGE_RANGES = ["Under 18", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export type OnboardingDraft = {
  goals: GoalType[];
  fitnessLevel: FitnessLevel | null;
  injuryFlags: InjuryFlag[];
  goalNotes: string;
  equipmentPresetCode: EquipmentPreset | null;
  selectedEquipmentCodes: string[];
  // Backward compatibility for existing API payload mapping.
  equipmentPreset: EquipmentPreset | null;
  equipmentItemCodes: string[];
  preferredDays: DayOfWeek[];
  scheduleConstraints: string;
  heightCm: number | null;
  weightKg: number | null;
  minutesPerSession: MinutesPerSession | null;
  sex: Sex | null;
  ageRange: AgeRange | null;
  anchorLifts: AnchorLiftEntry[];
  anchorLiftsSkipped: boolean;
  onboardingStepCompleted: 0 | 1 | 2 | 3;
};

export type OnboardingStep = 1 | 2 | "2b" | 3;

export type StepAttemptedState = {
  step1: boolean;
  step2: boolean;
  step2b: boolean;
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
