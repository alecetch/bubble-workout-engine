import { authGetJson } from "./client";

export type ExerciseGuidance = {
  exerciseId: string;
  name: string;
  coachingCues: string[];
  techniqueCue: string | null;
  techniqueSetup: string | null;
  techniqueExecution: string[];
  techniqueMistakes: string[];
  techniqueVideoUrl: string | null;
  loadGuidance: string | null;
  loggingGuidance: string | null;
  targetRegions: string[];
  movementPattern: string | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeGuidance(raw: unknown): ExerciseGuidance {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    exerciseId: asString(g.exerciseId) ?? "",
    name: asString(g.name) ?? "",
    coachingCues: asStringArray(g.coachingCues),
    techniqueCue: asString(g.techniqueCue),
    techniqueSetup: asString(g.techniqueSetup),
    techniqueExecution: asStringArray(g.techniqueExecution),
    techniqueMistakes: asStringArray(g.techniqueMistakes),
    techniqueVideoUrl: asString(g.techniqueVideoUrl),
    loadGuidance: asString(g.loadGuidance),
    loggingGuidance: asString(g.loggingGuidance),
    targetRegions: asStringArray(g.targetRegions),
    movementPattern: asString(g.movementPattern),
  };
}

export async function fetchExerciseGuidance(exerciseId: string): Promise<ExerciseGuidance> {
  const raw = await authGetJson<{ ok: boolean; guidance: unknown }>(
    `/api/exercise/${encodeURIComponent(exerciseId)}/guidance`,
  );
  return normalizeGuidance(raw?.guidance ?? {});
}
