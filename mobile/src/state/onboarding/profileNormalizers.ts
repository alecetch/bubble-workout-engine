import { AGE_RANGES, FITNESS_LEVELS, SEX_OPTIONS, type AgeRange, type DayOfWeek, type FitnessLevel, type GoalType, type Sex } from "./types";

function toSlug(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeGoals(values: unknown): GoalType[] {
  const aliases = new Map<string, GoalType>([
    ["strength", "Strength"],
    ["hypertrophy", "Hypertrophy"],
    ["conditioning", "Conditioning"],
    ["hyrox", "HYROX Workout"],
    ["hyrox_workout", "HYROX Workout"],
    ["hyrox_competition", "HYROX Workout"],
  ]);
  const raw = Array.isArray(values) ? values : [];
  return Array.from(new Set(raw.map((value) => aliases.get(toSlug(value))).filter((value): value is GoalType => Boolean(value))));
}

export function normalizeDays(values: unknown): DayOfWeek[] {
  const aliases = new Map<string, DayOfWeek>([
    ["mon", "Mon"],
    ["monday", "Mon"],
    ["tue", "Tues"],
    ["tues", "Tues"],
    ["tuesday", "Tues"],
    ["wed", "Wed"],
    ["wednesday", "Wed"],
    ["thu", "Thurs"],
    ["thur", "Thurs"],
    ["thurs", "Thurs"],
    ["thursday", "Thurs"],
    ["fri", "Fri"],
    ["friday", "Fri"],
    ["sat", "Sat"],
    ["saturday", "Sat"],
    ["sun", "Sun"],
    ["sunday", "Sun"],
  ]);
  const raw = Array.isArray(values) ? values : [];
  return Array.from(new Set(raw.map((value) => aliases.get(toSlug(value))).filter((value): value is DayOfWeek => Boolean(value))));
}

export function normalizeFitnessLevel(value: unknown): FitnessLevel | null {
  const slug = toSlug(value);
  return FITNESS_LEVELS.find((item) => toSlug(item) === slug) ?? null;
}

export function normalizeSex(value: unknown): Sex | null {
  const slug = toSlug(value);
  return SEX_OPTIONS.find((item) => toSlug(item) === slug) ?? null;
}

export function normalizeAgeRange(value: unknown): AgeRange | null {
  const slug = toSlug(value);
  return AGE_RANGES.find((item) => toSlug(item) === slug) ?? null;
}
