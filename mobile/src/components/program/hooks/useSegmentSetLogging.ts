import { useEffect, useState } from "react";
import type React from "react";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import type { SegmentLogRow } from "../../../api/segmentLog";
import {
  buildInitialSetInputMap,
  getExerciseSetCount,
  guidelinePrefill,
  repsPrefill,
  type SetInputState,
} from "../sessionUxLogic";

type Exercise = ProgramDayFullResponse["segments"][number]["exercises"][number];

function isUnloadedExercise(exercise: Exercise): boolean {
  return exercise.isUnloaded === true || exercise.isLoadable === false;
}

function findNextUncheckedSetKey(
  exercises: Exercise[],
  doneSetKeys: Set<string>,
): string | null {
  for (const exercise of exercises) {
    const exerciseKey = exercise.id ?? exercise.exerciseId ?? exercise.name;
    const setCount = getExerciseSetCount(exercise);
    for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
      const setKey = `${exerciseKey}:${setIndex}`;
      if (!doneSetKeys.has(setKey)) {
        return setKey;
      }
    }
  }
  return null;
}

export function useSegmentSetLogging(params: {
  loggableExercises: Exercise[];
  existingLogsQuery: { data: SegmentLogRow[] | undefined; isLoading: boolean };
  inlineLoggingOpen: boolean;
  isRoundBased: boolean;
  totalRounds: number;
  onRoundStateReset?: () => void;
}): {
  inputMap: Record<string, SetInputState[]>;
  setInputMap: React.Dispatch<React.SetStateAction<Record<string, SetInputState[]>>>;
  exerciseRirMap: Record<string, number | null>;
  setExerciseRirMap: React.Dispatch<React.SetStateAction<Record<string, number | null>>>;
  doneSetKeys: Set<string>;
  setDoneSetKeys: React.Dispatch<React.SetStateAction<Set<string>>>;
  activeSetKey: string | null;
  setActiveSetKey: React.Dispatch<React.SetStateAction<string | null>>;
  initialized: boolean;
} {
  const {
    loggableExercises,
    existingLogsQuery,
    inlineLoggingOpen,
    isRoundBased,
    totalRounds,
    onRoundStateReset,
  } = params;
  const [inputMap, setInputMap] = useState<Record<string, SetInputState[]>>({});
  const [exerciseRirMap, setExerciseRirMap] = useState<Record<string, number | null>>({});
  const [doneSetKeys, setDoneSetKeys] = useState<Set<string>>(new Set());
  const [activeSetKey, setActiveSetKey] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!inlineLoggingOpen) {
      setInitialized(false);
    }
  }, [inlineLoggingOpen]);

  useEffect(() => {
    if (!inlineLoggingOpen || initialized || existingLogsQuery.isLoading) return;
    const existingRows = existingLogsQuery.data ?? [];
    if (isRoundBased) {
      const nextInputMap = Object.fromEntries(
        loggableExercises.map((exercise) => {
          const key = exercise.id ?? "";
          const prefilled = buildInitialSetInputMap([exercise], existingRows)[key] ?? [];
          const prefillWeight = isUnloadedExercise(exercise) ? "" : guidelinePrefill(exercise);
          const prefillReps = repsPrefill(exercise);
          return [
            key,
            Array.from({ length: totalRounds }, (_value, index) => {
              const existing = prefilled[index];
              const hasExistingLog = existingRows.some((row) => row.programExerciseId === key && row.orderIndex === index + 1);
              return hasExistingLog && existing
                ? existing
                : { weight: prefillWeight, reps: prefillReps, rirActual: null };
            }),
          ];
        }),
      );
      setInputMap(nextInputMap);
      setExerciseRirMap(
        existingRows.reduce<Record<string, number | null>>((acc, row) => {
          if (!row.programExerciseId) return acc;
          if (row.orderIndex !== totalRounds) return acc;
          acc[row.programExerciseId] = row.rirActual ?? null;
          return acc;
        }, {}),
      );
      setDoneSetKeys(new Set());
      onRoundStateReset?.();
      if (loggableExercises.length === 0) return;
      setInitialized(true);
      return;
    }
    setInputMap(buildInitialSetInputMap(loggableExercises, existingRows));
    setExerciseRirMap(
      existingRows.reduce<Record<string, number | null>>((acc, row) => {
        if (!row.programExerciseId) return acc;
        if (acc[row.programExerciseId] != null) return acc;
        acc[row.programExerciseId] = row.rirActual ?? null;
        return acc;
      }, {}),
    );
    setDoneSetKeys(new Set());
    setActiveSetKey(findNextUncheckedSetKey(loggableExercises, new Set()));
    if (loggableExercises.length === 0) return;
    setInitialized(true);
  }, [
    existingLogsQuery.data,
    existingLogsQuery.isLoading,
    inlineLoggingOpen,
    initialized,
    isRoundBased,
    loggableExercises,
    totalRounds,
  ]);

  return {
    inputMap,
    setInputMap,
    exerciseRirMap,
    setExerciseRirMap,
    doneSetKeys,
    setDoneSetKeys,
    activeSetKey,
    setActiveSetKey,
    initialized,
  };
}
