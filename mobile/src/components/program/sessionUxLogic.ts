import type { ProgramDayFullResponse } from "../../api/programViewer";
import type { SaveSegmentLogPayload, SegmentLogRow } from "../../api/segmentLog";

export type GuidelinePrefillExercise = {
  guidelineLoad?: { value?: number | string | null } | null;
  progressionRecommendation?: {
    recommendedLoadKg?: number | null;
    recommendedRepsTarget?: number | null;
  } | null;
  intensity?: string | null;
  reps?: string | null;
};

export type SetInputState = {
  weight: string;
  reps: string;
  rirActual: number | null;
};

type Exercise = ProgramDayFullResponse["segments"][number]["exercises"][number];
type Segment = ProgramDayFullResponse["segments"][number];

export function parseWeightPrefill(intensity: string | null | undefined): string {
  const v = parseFloat((intensity ?? "").trim());
  return Number.isFinite(v) && v > 0 ? String(v) : "";
}

export function parseRepsPrefill(reps: string | null | undefined): string {
  const raw = (reps ?? "").trim();
  if (/^\d+$/.test(raw)) {
    const v = parseInt(raw, 10);
    return v >= 1 ? String(v) : "10";
  }
  const rangeMatch = raw.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1], 10);
    const hi = parseInt(rangeMatch[2], 10);
    return String(Math.round((lo + hi) / 2));
  }
  return "10";
}

export function repsPrefill(ex: GuidelinePrefillExercise): string {
  const recommendedRepsTarget = ex.progressionRecommendation?.recommendedRepsTarget;
  if (
    recommendedRepsTarget != null &&
    Number.isFinite(Number(recommendedRepsTarget)) &&
    Number(recommendedRepsTarget) > 0
  ) {
    return String(Number(recommendedRepsTarget));
  }
  return parseRepsPrefill(ex.reps);
}

export function guidelinePrefill(ex: GuidelinePrefillExercise): string {
  const recommendedLoadKg = ex.progressionRecommendation?.recommendedLoadKg;
  if (recommendedLoadKg != null && Number.isFinite(Number(recommendedLoadKg)) && Number(recommendedLoadKg) > 0) {
    return String(Number(recommendedLoadKg));
  }
  const glv = ex.guidelineLoad?.value;
  if (glv != null && Number.isFinite(Number(glv)) && Number(glv) > 0) {
    return String(Number(glv));
  }
  return parseWeightPrefill(ex.intensity);
}

export function getExerciseSetCount(exercise: { sets?: number | string | null | undefined }): number {
  return Math.max(1, parseInt(String(exercise.sets ?? "1"), 10) || 1);
}

export function buildInitialSetInputMap(
  exercises: Exercise[],
  existingRows: SegmentLogRow[] = [],
): Record<string, SetInputState[]> {
  const initial: Record<string, SetInputState[]> = {};

  for (const ex of exercises) {
    const key = ex.id ?? "";
    const setCount = getExerciseSetCount(ex);
    const prefillWeight = ex.isLoadable === false || ex.isUnloaded === true ? "" : guidelinePrefill(ex);
    const prefillReps = repsPrefill(ex);
    initial[key] = Array.from({ length: setCount }, () => ({
      weight: prefillWeight,
      reps: prefillReps,
      rirActual: null,
    }));
  }

  for (const row of existingRows) {
    const key = row.programExerciseId;
    if (!initial[key]) continue;
    const idx = (row.orderIndex ?? 1) - 1;
    if (idx < 0 || idx >= initial[key].length) continue;
    if (row.weightKg != null) initial[key][idx].weight = String(row.weightKg);
    if (row.repsCompleted != null) initial[key][idx].reps = String(row.repsCompleted);
    if (row.rirActual != null) initial[key][idx].rirActual = row.rirActual;
  }

  return initial;
}

export function buildSegmentLogRows(
  exercises: Exercise[],
  inputMap: Record<string, SetInputState[]>,
): SaveSegmentLogPayload["rows"] {
  const rows: SaveSegmentLogPayload["rows"] = [];

  exercises.forEach((ex) => {
    const key = ex.id ?? "";
    if (ex.isLoadable === false || ex.isUnloaded === true) {
      const sets = inputMap[key] ?? [];
      const fallbackSets = sets.length > 0
        ? sets
        : Array.from({ length: getExerciseSetCount(ex) }, () => ({
            weight: "",
            reps: repsPrefill(ex),
            rirActual: null,
          }));
      fallbackSets.forEach((set, i) => {
        const rRaw = parseInt(set.reps, 10);
        rows.push({
          programExerciseId: key,
          orderIndex: i + 1,
          weightKg: null,
          repsCompleted: Number.isInteger(rRaw) && rRaw > 0 ? rRaw : null,
          rirActual: set.rirActual ?? null,
        });
      });
      return;
    }
    const sets = inputMap[key] ?? [];
    sets.forEach((set, i) => {
      const wRaw = parseFloat(set.weight);
      const rRaw = parseInt(set.reps, 10);
      rows.push({
        programExerciseId: key,
        orderIndex: i + 1,
        weightKg: Number.isFinite(wRaw) && wRaw > 0 ? wRaw : null,
        repsCompleted: Number.isInteger(rRaw) && rRaw > 0 ? rRaw : null,
        rirActual: set.rirActual ?? null,
      });
    });
  });

  return rows;
}

function isUnloadedExercise(exercise: Exercise): boolean {
  return exercise.isUnloaded === true || exercise.isLoadable === false;
}

export function formatRoundSummary(
  exercises: Exercise[],
  totalRounds: number,
  completedRoundCount: number,
  inputMap: Record<string, SetInputState[]>,
  doneSetKeys: Set<string>,
): string | null {
  if (completedRoundCount === 0) return null;
  const firstExercise = exercises.find((exercise) => exercise.id);
  if (!firstExercise?.id) return null;
  const completedRounds = Array.from({ length: totalRounds }, (_value, index) => index)
    .filter((index) => exercises.some((exercise) => doneSetKeys.has(`${exercise.id ?? exercise.exerciseId ?? exercise.name}:${index}`)));
  const lastRoundIndex = completedRounds[completedRounds.length - 1] ?? completedRoundCount - 1;
  const last = inputMap[firstExercise.id]?.[lastRoundIndex];
  if (!last) return null;
  const reps = parseInt(last.reps, 10);
  if (!Number.isInteger(reps) || reps <= 0) return null;

  const prefix = completedRoundCount >= totalRounds
    ? `${totalRounds} rounds`
    : `${completedRoundCount}/${totalRounds} rounds`;
  if (isUnloadedExercise(firstExercise)) {
    return `${prefix} · bodyweight x ${reps} ✓`;
  }

  const weight = parseFloat(last.weight);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  return `${prefix} · ${weight} kg x ${reps} ✓`;
}

export function computeSessionStatsFromSegments(
  orderedSegments: Segment[],
  segmentLogs: Record<string, unknown>,
): { totalVolumeKg: number; totalSets: number; exerciseCount: number } {
  let totalVolumeKg = 0;
  let totalSets = 0;
  const exerciseIds = new Set<string>();

  for (const segment of orderedSegments) {
    if (!segmentLogs[segment.id]) continue;
    for (const ex of segment.exercises ?? []) {
      if (!ex.isLoadable) continue;
      exerciseIds.add(ex.id ?? "");
      const setCount = getExerciseSetCount(ex);
      totalSets += setCount;
      const glv = Number(ex.guidelineLoad?.value ?? 0);
      const reps = parseInt(String(ex.reps ?? "0"), 10) || 0;
      if (glv > 0 && reps > 0) {
        totalVolumeKg += glv * reps * setCount;
      }
    }
  }

  return {
    totalVolumeKg,
    totalSets,
    exerciseCount: exerciseIds.size,
  };
}

export function computeTotalPrescribedSets(orderedSegments: Segment[]): number {
  return orderedSegments.reduce(
    (sum, segment) =>
      sum + (segment.exercises ?? [])
        .filter((exercise) => exercise.id)
        .reduce((exerciseSum, exercise) => exerciseSum + getExerciseSetCount(exercise), 0),
    0,
  );
}

export function computeSessionStatsFromLoggedRows(
  rowsBySegment: Record<string, SaveSegmentLogPayload["rows"]>,
): { totalVolumeKg: number; totalSets: number; exerciseCount: number } {
  let totalVolumeKg = 0;
  let totalSets = 0;
  const exerciseIds = new Set<string>();

  Object.values(rowsBySegment).forEach((rows) => {
    rows.forEach((row) => {
      const weightKg = Number(row.weightKg ?? 0);
      const repsCompleted = Number(row.repsCompleted ?? 0);
      totalSets += 1;
      if (row.programExerciseId) {
        exerciseIds.add(row.programExerciseId);
      }
      if (weightKg > 0 && repsCompleted > 0) {
        totalVolumeKg += weightKg * repsCompleted;
      }
    });
  });

  return {
    totalVolumeKg,
    totalSets,
    exerciseCount: exerciseIds.size,
  };
}
