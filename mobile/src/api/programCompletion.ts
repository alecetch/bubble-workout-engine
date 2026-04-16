import { authGetJson, authPostJson } from "./client";

export type ProgramCompletionPersonalRecord = {
  exerciseId: string;
  exerciseName: string;
  bestWeightKg: number;
};

export type ProgramCompletionProfile = {
  fitnessRank: number;
  fitnessLevelSlug: string | null;
  goals: string[];
  minutesPerSession: number | null;
  preferredDays: string[];
  equipmentItemsSlugs: string[];
  equipmentPresetSlug: string | null;
};

export type ReEnrollmentOption = {
  option: "same_settings" | "progress_level" | "change_goals";
  label: string;
  fitnessRank: number;
};

export type ProgramLifecycleStatus = "in_progress" | "completed";
export type ProgramCompletedMode = "as_scheduled" | "with_skips" | null;

export type ProgramCompletionSummary = {
  programId: string;
  programTitle: string;
  programType: string | null;
  weeksCompleted: number;
  daysCompleted: number;
  daysTotal: number;
  missedWorkoutsCount: number;
  isLastScheduledDayComplete: boolean;
  lifecycleStatus: ProgramLifecycleStatus;
  completedMode: ProgramCompletedMode;
  completedAt: string | null;
  completionRatio: number;
  exercisesProgressed: number;
  exercisesTracked: number;
  avgProgressionScore: number;
  avgConfidence: "low" | "medium" | "high" | null;
  personalRecords: ProgramCompletionPersonalRecord[];
  currentProfile: ProgramCompletionProfile;
  suggestedNextRank: number;
  reEnrollmentOptions: ReEnrollmentOption[];
};

export type ProgramEndCheck = {
  programId: string;
  programTitle: string;
  lifecycleStatus: ProgramLifecycleStatus;
  completedMode: ProgramCompletedMode;
  totalDays: number;
  completedDays: number;
  missedWorkoutsCount: number;
  isLastScheduledDayComplete: boolean;
  canCompleteWithSkips: boolean;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const text = asString(value).trim();
  return text || null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeConfidence(value: unknown): ProgramCompletionSummary["avgConfidence"] {
  const text = asNullableString(value);
  return text === "low" || text === "medium" || text === "high" ? text : null;
}

function normalizeLifecycleStatus(value: unknown): ProgramLifecycleStatus {
  const text = asNullableString(value);
  return text === "completed" ? "completed" : "in_progress";
}

function normalizeCompletedMode(value: unknown): ProgramCompletedMode {
  const text = asNullableString(value);
  return text === "as_scheduled" || text === "with_skips" ? text : null;
}

function normalizeReEnrollmentOption(value: unknown): ReEnrollmentOption | null {
  const row = asObject(value);
  const option = asString(row.option);
  if (option !== "same_settings" && option !== "progress_level" && option !== "change_goals") {
    return null;
  }

  return {
    option,
    label: asString(row.label, option),
    fitnessRank: asNumber(row.fitness_rank ?? row.fitnessRank, 0),
  };
}

function normalizeProgramCompletionSummary(raw: unknown): ProgramCompletionSummary {
  const root = asObject(raw);
  const currentProfile = asObject(root.current_profile ?? root.currentProfile);

  return {
    programId: asString(root.program_id ?? root.programId),
    programTitle: asString(root.program_title ?? root.programTitle, "Training Program"),
    programType: asNullableString(root.program_type ?? root.programType),
    weeksCompleted: asNumber(root.weeks_completed ?? root.weeksCompleted, 0),
    daysCompleted: asNumber(root.days_completed ?? root.daysCompleted, 0),
    daysTotal: asNumber(root.days_total ?? root.daysTotal, 0),
    missedWorkoutsCount: asNumber(root.missed_workouts_count ?? root.missedWorkoutsCount, 0),
    isLastScheduledDayComplete: asBoolean(
      root.is_last_scheduled_day_complete ?? root.isLastScheduledDayComplete,
    ),
    lifecycleStatus: normalizeLifecycleStatus(root.lifecycle_status ?? root.lifecycleStatus),
    completedMode: normalizeCompletedMode(root.completed_mode ?? root.completedMode),
    completedAt: asNullableString(root.completed_at ?? root.completedAt),
    completionRatio: asNumber(root.completion_ratio ?? root.completionRatio, 0),
    exercisesProgressed: asNumber(root.exercises_progressed ?? root.exercisesProgressed, 0),
    exercisesTracked: asNumber(root.exercises_tracked ?? root.exercisesTracked, 0),
    avgProgressionScore: asNumber(root.avg_progression_score ?? root.avgProgressionScore, 0),
    avgConfidence: normalizeConfidence(root.avg_confidence ?? root.avgConfidence),
    personalRecords: asArray(root.personal_records ?? root.personalRecords).map((item) => {
      const row = asObject(item);
      return {
        exerciseId: asString(row.exercise_id ?? row.exerciseId),
        exerciseName: asString(row.exercise_name ?? row.exerciseName),
        bestWeightKg: asNumber(row.best_weight_kg ?? row.bestWeightKg, 0),
      };
    }),
    currentProfile: {
      fitnessRank: asNumber(currentProfile.fitness_rank ?? currentProfile.fitnessRank, 0),
      fitnessLevelSlug: asNullableString(
        currentProfile.fitness_level_slug ?? currentProfile.fitnessLevelSlug,
      ),
      goals: asArray(currentProfile.goals).map((goal) => asString(goal)).filter(Boolean),
      minutesPerSession: currentProfile.minutes_per_session == null && currentProfile.minutesPerSession == null
        ? null
        : asNumber(currentProfile.minutes_per_session ?? currentProfile.minutesPerSession, 0),
      preferredDays: asArray(
        currentProfile.preferred_days ?? currentProfile.preferredDays,
      ).map((day) => asString(day)).filter(Boolean),
      equipmentItemsSlugs: asArray(
        currentProfile.equipment_items_slugs ?? currentProfile.equipmentItemsSlugs,
      ).map((item) => asString(item)).filter(Boolean),
      equipmentPresetSlug: asNullableString(
        currentProfile.equipment_preset_slug ?? currentProfile.equipmentPresetSlug,
      ),
    },
    suggestedNextRank: asNumber(root.suggested_next_rank ?? root.suggestedNextRank, 0),
    reEnrollmentOptions: asArray(
      root.re_enrollment_options ?? root.reEnrollmentOptions,
    )
      .map(normalizeReEnrollmentOption)
      .filter((option): option is ReEnrollmentOption => Boolean(option)),
  };
}

function normalizeProgramEndCheck(raw: unknown): ProgramEndCheck {
  const root = asObject(raw);
  return {
    programId: asString(root.program_id ?? root.programId),
    programTitle: asString(root.program_title ?? root.programTitle, "Training Program"),
    lifecycleStatus: normalizeLifecycleStatus(root.lifecycle_status ?? root.lifecycleStatus),
    completedMode: normalizeCompletedMode(root.completed_mode ?? root.completedMode),
    totalDays: asNumber(root.total_days ?? root.totalDays, 0),
    completedDays: asNumber(root.completed_days ?? root.completedDays, 0),
    missedWorkoutsCount: asNumber(root.missed_workouts_count ?? root.missedWorkoutsCount, 0),
    isLastScheduledDayComplete: asBoolean(
      root.is_last_scheduled_day_complete ?? root.isLastScheduledDayComplete,
    ),
    canCompleteWithSkips: asBoolean(root.can_complete_with_skips ?? root.canCompleteWithSkips),
  };
}

export async function getProgramCompletionSummary(
  programId: string,
): Promise<ProgramCompletionSummary> {
  const raw = await authGetJson<unknown>(
    `/api/program/${encodeURIComponent(programId)}/completion-summary`,
  );
  return normalizeProgramCompletionSummary(raw);
}

export async function getProgramEndCheck(programId: string): Promise<ProgramEndCheck> {
  const raw = await authGetJson<unknown>(`/api/program/${encodeURIComponent(programId)}/end-check`);
  return normalizeProgramEndCheck(raw);
}

export async function completeProgram(
  programId: string,
  mode: "as_scheduled" | "with_skips",
): Promise<{ ok: boolean; programId: string; lifecycleStatus: ProgramLifecycleStatus; completedMode: ProgramCompletedMode }> {
  const raw = await authPostJson<unknown, { mode: "as_scheduled" | "with_skips" }>(
    `/api/program/${encodeURIComponent(programId)}/complete`,
    { mode },
  );
  const root = asObject(raw);
  return {
    ok: asBoolean(root.ok),
    programId: asString(root.program_id ?? root.programId),
    lifecycleStatus: normalizeLifecycleStatus(root.lifecycle_status ?? root.lifecycleStatus),
    completedMode: normalizeCompletedMode(root.completed_mode ?? root.completedMode),
  };
}
