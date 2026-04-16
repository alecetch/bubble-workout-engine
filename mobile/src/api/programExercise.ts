import { authGetJson, authPostJson } from "./client";

export type ExerciseSwapOption = {
  exerciseId: string;
  name: string;
  isLoadable: boolean;
  matchType: string;
  rationale: string;
  loadGuidance: string | null;
};

export type ExerciseSwapOptionsResponse = {
  currentExerciseId: string;
  options: ExerciseSwapOption[];
};

export type ApplyExerciseSwapResponse = {
  programExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  originalExerciseId: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeLoadGuidance(value: unknown): string | null {
  const text = asString(value).trim();
  return text ? text : null;
}

function normalizeSwapOptionsResponse(raw: unknown): ExerciseSwapOptionsResponse {
  const root = asObject(raw);
  return {
    currentExerciseId: asString(root.current_exercise_id ?? root.currentExerciseId),
    options: asArray(root.options).map((item) => {
      const row = asObject(item);
      return {
        exerciseId: asString(row.exercise_id ?? row.exerciseId),
        name: asString(row.name),
        isLoadable: asBoolean(row.is_loadable ?? row.isLoadable),
        matchType: asString(row.match_type ?? row.matchType),
        rationale: asString(row.rationale),
        loadGuidance: normalizeLoadGuidance(row.load_guidance ?? row.loadGuidance),
      };
    }),
  };
}

function normalizeApplyExerciseSwapResponse(raw: unknown): ApplyExerciseSwapResponse {
  const root = asObject(raw);
  return {
    programExerciseId: asString(root.program_exercise_id ?? root.programExerciseId),
    exerciseId: asString(root.exercise_id ?? root.exerciseId),
    exerciseName: asString(root.exercise_name ?? root.exerciseName),
    originalExerciseId: asNullableString(root.original_exercise_id ?? root.originalExerciseId),
  };
}

export async function getExerciseSwapOptions(
  programExerciseId: string,
): Promise<ExerciseSwapOptionsResponse> {
  const raw = await authGetJson<unknown>(
    `/api/program-exercise/${encodeURIComponent(programExerciseId)}/swap-options`,
  );
  return normalizeSwapOptionsResponse(raw);
}

export async function applyExerciseSwap(
  programExerciseId: string,
  body: { exerciseId: string; reason?: string | null },
): Promise<ApplyExerciseSwapResponse> {
  const raw = await authPostJson<unknown, { exercise_id: string; reason?: string | null }>(
    `/api/program-exercise/${encodeURIComponent(programExerciseId)}/swap`,
    {
      exercise_id: body.exerciseId,
      reason: body.reason,
    },
  );
  return normalizeApplyExerciseSwapResponse(raw);
}
