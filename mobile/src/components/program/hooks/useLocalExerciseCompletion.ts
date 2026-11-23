import { useCallback, useEffect, useState } from "react";
import type React from "react";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import type { SegmentLogRow } from "../../../api/segmentLog";
import { getExerciseComplete, setExerciseComplete } from "../../../utils/localWorkoutLog";
import { getExerciseSetCount } from "../sessionUxLogic";

type Exercise = ProgramDayFullResponse["segments"][number]["exercises"][number];
const noServerRows: SegmentLogRow[] = [];
const noCompletedIds = new Set<string>();

export function useLocalExerciseCompletion(
  loggableExercises: Exercise[],
  programDayId: string,
  { serverDayComplete = false, serverRows = noServerRows, prescribedSets, onReconciled }: {
    serverDayComplete?: boolean;
    serverRows?: SegmentLogRow[];
    prescribedSets?: number;
    onReconciled?: (id: string) => void;
  } = {},
): {
  completedExerciseIds: Set<string>;
  setCompletedExerciseIds: React.Dispatch<React.SetStateAction<Set<string>>>;
} {
  const [completion, setCompletion] = useState({ day: programDayId, ids: new Set<string>() });
  const setCompletedExerciseIds = useCallback<React.Dispatch<React.SetStateAction<Set<string>>>>(value => {
    setCompletion(current => {
      const ids = current.day === programDayId ? current.ids : new Set<string>();
      return { day: programDayId, ids: typeof value === "function" ? value(ids) : value };
    });
  }, [programDayId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Only confirmed server rows qualify; phone-only outbox ticks are not server truth.
      const orders = new Map<string, Set<number>>();
      for (const row of serverRows) {
        if (!Number.isInteger(row.orderIndex) || row.orderIndex < 1) continue;
        if (!orders.has(row.programExerciseId)) orders.set(row.programExerciseId, new Set());
        orders.get(row.programExerciseId)!.add(row.orderIndex);
      }
      const entries = await Promise.all(loggableExercises.map(async exercise => {
        const id = exercise.id ?? "";
        const local = await getExerciseComplete(programDayId, id);
        const saved = orders.get(id);
        const count = prescribedSets ?? getExerciseSetCount(exercise);
        const allSaved = count > 0 && Array.from({ length: count }, (_, index) => index + 1).every(order => saved?.has(order));
        const fromServer = Boolean(saved?.size && (serverDayComplete || allSaved));
        return { id, local, fromServer };
      }));
      if (cancelled) return;
      for (const entry of entries) {
        if (entry.fromServer && !entry.local) {
          void setExerciseComplete(programDayId, entry.id, true)
            .then(() => { if (!cancelled) onReconciled?.(entry.id); }).catch(() => {});
        }
      }
      setCompletion(current => {
        const validIds = new Set(loggableExercises.map(exercise => exercise.id));
        const ids = new Set(current.day === programDayId ? [...current.ids].filter(id => validIds.has(id)) : []);
        for (const entry of entries) if (entry.local || entry.fromServer) ids.add(entry.id);
        if (current.day === programDayId && ids.size === current.ids.size && [...ids].every(id => current.ids.has(id))) return current;
        return { day: programDayId, ids };
      });
    })();
    return () => { cancelled = true; };
  }, [loggableExercises, programDayId, serverDayComplete, serverRows, prescribedSets, onReconciled]);

  return { completedExerciseIds: completion.day === programDayId ? completion.ids : noCompletedIds, setCompletedExerciseIds };
}
