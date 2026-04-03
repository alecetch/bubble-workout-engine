import { authGetJson, authPostJson } from "./client";

export type SegmentLogRow = {
  id?: string;
  programExerciseId: string;
  weightKg: number | null;
  repsCompleted: number | null;
  orderIndex: number;
};

export type SaveSegmentLogPayload = {
  userId?: string;
  programId: string;
  programDayId: string;
  workoutSegmentId: string;
  rows: Array<{
    programExerciseId: string;
    orderIndex: number;
    weightKg: number | null;
    repsCompleted: number | null;
  }>;
};

export async function getSegmentExerciseLogs(params: {
  userId?: string;
  workoutSegmentId: string;
  programDayId: string;
}): Promise<SegmentLogRow[]> {
  try {
    const query = new URLSearchParams();
    if (params.userId) query.set("user_id", params.userId);
    query.set("workout_segment_id", params.workoutSegmentId);
    query.set("program_day_id", params.programDayId);

    const response = await authGetJson<{ rows: unknown[] }>(`/api/segment-log?${query.toString()}`);
    const rows = Array.isArray(response?.rows) ? response.rows : [];

    return rows.map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
        id: row.id != null ? String(row.id) : undefined,
        programExerciseId: String(row.program_exercise_id ?? ""),
        weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
        repsCompleted: row.reps_completed != null ? Number(row.reps_completed) : null,
        orderIndex: Number(row.order_index ?? 0),
      };
    });
  } catch {
    return [];
  }
}

export async function saveSegmentExerciseLogs(
  payload: SaveSegmentLogPayload,
): Promise<void> {
  await authPostJson<unknown, Record<string, unknown>>("/api/segment-log", {
      user_id: payload.userId,
      program_id: payload.programId,
      program_day_id: payload.programDayId,
      workout_segment_id: payload.workoutSegmentId,
      rows: payload.rows.map((r) => ({
        program_exercise_id: r.programExerciseId,
        order_index: r.orderIndex,
        weight_kg: r.weightKg,
        reps_completed: r.repsCompleted,
      })),
  });
}

