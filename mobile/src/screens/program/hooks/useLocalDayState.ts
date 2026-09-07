import { useCallback, useEffect, useState } from "react";
import type React from "react";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import type { SaveSegmentLogPayload } from "../../../api/segmentLog";
import {
  getExerciseComplete,
  getSegmentLog,
  getWorkoutComplete,
  setWorkoutComplete,
  type SegmentLogEntry,
} from "../../../utils/localWorkoutLog";

type SegmentDetail = ProgramDayFullResponse["segments"][number];

export function useLocalDayState(
  programDayId: string,
  orderedSegments: SegmentDetail[],
  allExerciseIds: string[],
  serverIsCompleted: boolean | null,
): {
  segmentLogs: Record<string, SegmentLogEntry>;
  setSegmentLogs: React.Dispatch<React.SetStateAction<Record<string, SegmentLogEntry>>>;
  segmentLogRows: Record<string, SaveSegmentLogPayload["rows"]>;
  setSegmentLogRows: React.Dispatch<React.SetStateAction<Record<string, SaveSegmentLogPayload["rows"]>>>;
  workoutComplete: boolean;
  setWorkoutCompleteState: React.Dispatch<React.SetStateAction<boolean>>;
  allExerciseCardsComplete: boolean;
  completedExerciseIds: Set<string>;
  refreshExerciseCompletion: () => void;
} {
  const [segmentLogs, setSegmentLogs] = useState<Record<string, SegmentLogEntry>>({});
  const [segmentLogRows, setSegmentLogRows] = useState<Record<string, SaveSegmentLogPayload["rows"]>>({});
  const [workoutComplete, setWorkoutCompleteState] = useState(false);
  const [allExerciseCardsComplete, setAllExerciseCardsComplete] = useState(false);
  const [completedExerciseIds, setCompletedExerciseIds] = useState<Set<string>>(new Set());

  const refreshExerciseCompletion = useCallback(() => {
    void (async () => {
      const completed = await Promise.all(
        allExerciseIds.map(async (programExerciseId) => ({
          programExerciseId,
          complete: await getExerciseComplete(programDayId, programExerciseId),
        })),
      );
      const nextCompletedExerciseIds = new Set(
        completed
          .filter((entry) => entry.complete)
          .map((entry) => entry.programExerciseId),
      );
      setCompletedExerciseIds(nextCompletedExerciseIds);
      setAllExerciseCardsComplete(nextCompletedExerciseIds.size === allExerciseIds.length);
    })();
  }, [allExerciseIds, programDayId]);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalState(): Promise<void> {
      const localCompletion = await getWorkoutComplete(programDayId);
      const entries = await Promise.all(
        orderedSegments.map(async (segment) => ({
          segmentId: segment.id,
          log: await getSegmentLog(programDayId, segment.id),
        })),
      );
      const exerciseCompletion = await Promise.all(
        allExerciseIds.map(async (programExerciseId) => ({
          programExerciseId,
          complete: await getExerciseComplete(programDayId, programExerciseId),
        })),
      );

      if (cancelled) return;

      const logsMap: Record<string, SegmentLogEntry> = {};
      entries.forEach((entry) => {
        if (entry.log) logsMap[entry.segmentId] = entry.log;
      });

      const resolvedCompletion = localCompletion || Boolean(serverIsCompleted);
      if (Boolean(serverIsCompleted) && !localCompletion) {
        void setWorkoutComplete(programDayId, true);
      }

      setSegmentLogs(logsMap);
      setWorkoutCompleteState(resolvedCompletion);
      const nextCompletedExerciseIds = new Set(
        exerciseCompletion
          .filter((entry) => entry.complete)
          .map((entry) => entry.programExerciseId),
      );
      setCompletedExerciseIds(nextCompletedExerciseIds);
      setAllExerciseCardsComplete(nextCompletedExerciseIds.size === allExerciseIds.length);
    }

    void loadLocalState();
    return () => {
      cancelled = true;
    };
  }, [allExerciseIds, orderedSegments, programDayId, serverIsCompleted]);

  return {
    segmentLogs,
    setSegmentLogs,
    segmentLogRows,
    setSegmentLogRows,
    workoutComplete,
    setWorkoutCompleteState,
    allExerciseCardsComplete,
    completedExerciseIds,
    refreshExerciseCompletion,
  };
}
