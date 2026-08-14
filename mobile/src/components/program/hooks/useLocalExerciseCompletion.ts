import { useEffect, useState } from "react";
import type React from "react";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import { getExerciseComplete } from "../../../utils/localWorkoutLog";

type Exercise = ProgramDayFullResponse["segments"][number]["exercises"][number];

export function useLocalExerciseCompletion(
  loggableExercises: Exercise[],
  programDayId: string,
): {
  completedExerciseIds: Set<string>;
  setCompletedExerciseIds: React.Dispatch<React.SetStateAction<Set<string>>>;
} {
  const [completedExerciseIds, setCompletedExerciseIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        loggableExercises.map(async (exercise) => ({
          id: exercise.id ?? "",
          complete: await getExerciseComplete(programDayId, exercise.id ?? ""),
        })),
      );
      if (cancelled) return;
      setCompletedExerciseIds(new Set(entries.filter((entry) => entry.complete).map((entry) => entry.id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [loggableExercises, programDayId]);

  return { completedExerciseIds, setCompletedExerciseIds };
}
