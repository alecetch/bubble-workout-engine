import { useCallback, useEffect, useState } from "react";
import type React from "react";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import type { SaveSegmentLogPayload } from "../../../api/segmentLog";
import {
  allExercisesComplete,
  getSegmentLog,
  getWorkoutComplete,
  type SegmentLogEntry,
} from "../../../utils/localWorkoutLog";

type SegmentDetail = ProgramDayFullResponse["segments"][number];

export function useLocalDayState(
  programDayId: string,
  orderedSegments: SegmentDetail[],
  allExerciseIds: string[],
): {
  segmentLogs: Record<string, SegmentLogEntry>;
  setSegmentLogs: React.Dispatch<React.SetStateAction<Record<string, SegmentLogEntry>>>;
  segmentLogRows: Record<string, SaveSegmentLogPayload["rows"]>;
  setSegmentLogRows: React.Dispatch<React.SetStateAction<Record<string, SaveSegmentLogPayload["rows"]>>>;
  workoutComplete: boolean;
  setWorkoutCompleteState: React.Dispatch<React.SetStateAction<boolean>>;
  allExerciseCardsComplete: boolean;
  refreshExerciseCompletion: () => void;
} {
  const [segmentLogs, setSegmentLogs] = useState<Record<string, SegmentLogEntry>>({});
  const [segmentLogRows, setSegmentLogRows] = useState<Record<string, SaveSegmentLogPayload["rows"]>>({});
  const [workoutComplete, setWorkoutCompleteState] = useState(false);
  const [allExerciseCardsComplete, setAllExerciseCardsComplete] = useState(false);

  const refreshExerciseCompletion = useCallback(() => {
    void allExercisesComplete(programDayId, allExerciseIds).then(setAllExerciseCardsComplete);
  }, [allExerciseIds, programDayId]);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalState(): Promise<void> {
      const completion = await getWorkoutComplete(programDayId);
      const entries = await Promise.all(
        orderedSegments.map(async (segment) => ({
          segmentId: segment.id,
          log: await getSegmentLog(programDayId, segment.id),
        })),
      );

      if (cancelled) return;

      const logsMap: Record<string, SegmentLogEntry> = {};
      entries.forEach((entry) => {
        if (entry.log) logsMap[entry.segmentId] = entry.log;
      });

      setSegmentLogs(logsMap);
      setWorkoutCompleteState(completion);
      setAllExerciseCardsComplete(await allExercisesComplete(programDayId, allExerciseIds));
    }

    void loadLocalState();
    return () => {
      cancelled = true;
    };
  }, [allExerciseIds, orderedSegments, programDayId]);

  return {
    segmentLogs,
    setSegmentLogs,
    segmentLogRows,
    setSegmentLogRows,
    workoutComplete,
    setWorkoutCompleteState,
    allExerciseCardsComplete,
    refreshExerciseCompletion,
  };
}
