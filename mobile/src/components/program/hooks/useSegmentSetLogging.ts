import type { OutboxEntry } from "../../../sync/setLogOutbox";
import { useEffect, useState } from "react";
import type React from "react";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import type { SegmentLogRow } from "../../../api/segmentLog";
import {
  buildInitialSetInputMap,
  findNextUncheckedSetKey,
  guidelinePrefill,
  repsPrefill,
  type SetInputState,
} from "../sessionUxLogic";

type Exercise = ProgramDayFullResponse["segments"][number]["exercises"][number];

function isUnloadedExercise(exercise: Exercise): boolean {
  return exercise.isUnloaded === true || exercise.isLoadable === false;
}

export function useSegmentSetLogging(params: {
  outboxEntries?: OutboxEntry[];
  outboxLoaded?: boolean;
  loggableExercises: Exercise[];
  existingLogsQuery: { data: SegmentLogRow[] | undefined; isLoading: boolean };
  inlineLoggingOpen: boolean;
  isRoundBased: boolean;
  totalRounds: number;
  preserveInputs?: boolean;
  onRoundStateReset?: (completedRounds: Set<number>) => void;
  onInitialize?: () => void;
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
    onInitialize,
    preserveInputs,
  } = params;
  const [inputMap, setInputMap] = useState<Record<string, SetInputState[]>>({});
  const [exerciseRirMap, setExerciseRirMap] = useState<Record<string, number | null>>({});
  const [doneSetKeys, setDoneSetKeys] = useState<Set<string>>(new Set());
  const [activeSetKey, setActiveSetKey] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!inlineLoggingOpen && !preserveInputs) {
      setInitialized(false);
    }
  }, [inlineLoggingOpen, preserveInputs]);

  useEffect(() => {
    if (!inlineLoggingOpen || initialized || existingLogsQuery.isLoading || params.outboxLoaded === false) return;
    const queued = params.outboxEntries ?? [];
    const byKey = new Map((existingLogsQuery.data ?? []).map(row => [`${row.programExerciseId}:${row.orderIndex}`, row]));
    queued.forEach(entry => byKey.set(`${entry.row.programExerciseId}:${entry.row.orderIndex}`, entry.row));
    const existingRows = [...byKey.values()];
    const overlay = (inputs: Record<string, SetInputState[]>) => {
      for (const { row } of queued) {
        const sets = inputs[row.programExerciseId];
        if (sets && row.orderIndex > 0) while (sets.length < row.orderIndex) {
          sets.push({ ...(sets[sets.length - 1] ?? { weight: "", reps: "", rirActual: null }) });
        }
        const input = sets?.[row.orderIndex - 1];
        if (input) { input.weight = row.weightKg == null ? "" : String(row.weightKg);
          input.reps = row.repsCompleted == null ? "" : String(row.repsCompleted); input.rirActual = row.rirActual; }
      }
      return inputs;
    };
    const restoreKeys = (inputs: Record<string, SetInputState[]>) => new Set(
      existingRows.filter(row => row.programExerciseId && Number.isInteger(row.orderIndex) &&
        inputs[row.programExerciseId]?.[row.orderIndex - 1])
        .map(row => `${row.programExerciseId}:${row.orderIndex - 1}`),
    );
    onInitialize?.();
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
      setInputMap(overlay(nextInputMap));
      setExerciseRirMap(
        existingRows.reduce<Record<string, number | null>>((acc, row) => {
          if (!row.programExerciseId) return acc;
          if (row.orderIndex !== totalRounds) return acc;
          acc[row.programExerciseId] = row.rirActual ?? null;
          return acc;
        }, {}),
      );
      const restoredKeys = restoreKeys(nextInputMap);
      setDoneSetKeys(restoredKeys);
      const completedRounds = new Set(
        Array.from({ length: totalRounds }, (_, index) => index).filter(index =>
          loggableExercises.length > 0 && loggableExercises.every(exercise => restoredKeys.has(`${exercise.id}:${index}`))),
      );
      onRoundStateReset?.(completedRounds);
      if (loggableExercises.length === 0) return;
      setExerciseRirMap(current => ({ ...current, ...Object.fromEntries(queued.map(e => [e.row.programExerciseId, e.row.rirActual])) }));
      setInitialized(true);
      return;
    }
    const nextInputMap = overlay(buildInitialSetInputMap(loggableExercises, existingRows));
    const restoredKeys = restoreKeys(nextInputMap);
    setInputMap(overlay(nextInputMap));
    setExerciseRirMap(
      existingRows.reduce<Record<string, number | null>>((acc, row) => {
        if (!row.programExerciseId) return acc;
        if (acc[row.programExerciseId] != null) return acc;
        acc[row.programExerciseId] = row.rirActual ?? null;
        return acc;
      }, {}),
    );
    setDoneSetKeys(restoredKeys);
    setActiveSetKey(findNextUncheckedSetKey(loggableExercises, restoredKeys));
    if (loggableExercises.length === 0) return;
    setExerciseRirMap(current => ({ ...current, ...Object.fromEntries(queued.map(e => [e.row.programExerciseId, e.row.rirActual])) }));
    setInitialized(true);
  }, [
    params.outboxEntries,
    params.outboxLoaded,
    existingLogsQuery.data,
    existingLogsQuery.isLoading,
    inlineLoggingOpen,
    initialized,
    preserveInputs,
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
