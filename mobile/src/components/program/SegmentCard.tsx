import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { type LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { ApiError } from "../../api/client";
import type { ProgramDayFullResponse } from "../../api/programViewer";
import type { SaveSegmentLogPayload, SaveSegmentLogResult } from "../../api/segmentLog";
import { useSaveSegmentLogs, useSegmentExerciseLogs } from "../../api/hooks";
import { useTimerStore } from "../../state/timer/useTimerStore";
import { useSettingsStore } from "../../state/settings/useSettingsStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { PressableScale } from "../interaction/PressableScale";
import { SkeletonBlock } from "../feedback/SkeletonBlock";
import {
  formatRoundSummary,
  getExerciseSetCount,
  type SetInputState,
} from "./sessionUxLogic";
import { getSegmentPresentation, isRoundBasedSegment } from "./segmentCardLogic";
import { setExerciseComplete } from "../../utils/localWorkoutLog";
import { useLocalExerciseCompletion } from "./hooks/useLocalExerciseCompletion";
import { useRoundBasedLogging } from "./hooks/useRoundBasedLogging";
import { useSegmentSetLogging } from "./hooks/useSegmentSetLogging";
import { InlineExerciseLogBlock } from "./segmentCard/InlineExerciseLogBlock";
import { InlineRestStrip } from "./segmentCard/InlineRestStrip";
import { RoundBasedLoggingPanel } from "./segmentCard/RoundBasedLoggingPanel";
import { SegmentCardHeader } from "./segmentCard/SegmentCardHeader";
import { SegmentExerciseListItem } from "./segmentCard/SegmentExerciseListItem";

type Segment = ProgramDayFullResponse["segments"][number];
type Exercise = Segment["exercises"][number];

type SegmentCardProps = {
  segment: Segment;
  isLogged: boolean;
  exerciseSetCounts?: Record<string, number>;
  programId: string;
  programDayId: string;
  userId?: string;
  onViewExerciseDetail: (
    exerciseId: string,
    programExerciseId: string,
    exerciseName: string,
    exercise: Exercise,
  ) => void;
  onRequestSwap?: (programExerciseId: string, exerciseName: string) => void;
  onAllSetsSaved: (segmentId: string) => void;
  onSubscriptionRequired?: () => void;
  onPrsDetected?: (prs: Array<{ exerciseName: string; estimated1rmKg: number }>) => void;
  onExerciseCompleteChange?: (programExerciseId: string) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onInlinePanelOpen?: (pageY: number) => void;
  onInlinePanelClose?: (pageY: number) => void;
  onSetsLoggedChange?: (segmentId: string, doneCount: number) => void;
};

const BADGE_SEGMENT_TYPES = new Set(["superset", "giant_set", "amrap", "emom"]);
function parseMmssToSeconds(value?: string | null): number | null {
  if (!value) return null;
  const [mm, ss] = value.split(":");
  const minutes = Number(mm);
  const seconds = Number(ss);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return minutes * 60 + seconds;
}

function roundToNearestMinute(seconds: number | null): number | null {
  if (seconds == null) return null;
  return seconds % 60 > 30
    ? Math.ceil(seconds / 60) * 60
    : Math.floor(seconds / 60) * 60;
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

function isExerciseFullyLogged(exercise: Exercise, doneSetKeys: Set<string>): boolean {
  const exerciseKey = exercise.id ?? exercise.exerciseId ?? exercise.name;
  const setCount = getExerciseSetCount(exercise);
  for (let setIndex = 0; setIndex < setCount; setIndex += 1) {
    if (!doneSetKeys.has(`${exerciseKey}:${setIndex}`)) return false;
  }
  return true;
}

function isUnloadedExercise(exercise: Exercise): boolean {
  return exercise.isUnloaded === true || exercise.isLoadable === false;
}

function formatExerciseSummary(
  exercise: Exercise,
  setInputs: SetInputState[] | undefined,
  doneSetKeys: Set<string>,
): string | null {
  const exerciseKey = exercise.id ?? "";
  const loggedSets = (setInputs ?? []).filter((_set, index) => doneSetKeys.has(`${exerciseKey}:${index}`));
  if (loggedSets.length === 0) return null;
  const last = loggedSets[loggedSets.length - 1];
  const reps = parseInt(last.reps, 10);
  if (!Number.isFinite(reps) || reps <= 0) return null;
  const prescribed = getExerciseSetCount(exercise);
  const prefix = loggedSets.length >= prescribed ? `${loggedSets.length} x ${reps}` : `${loggedSets.length}/${prescribed} sets - ${loggedSets.length} x ${reps}`;
  if (isUnloadedExercise(exercise)) return `${prefix} (bodyweight) ✓`;
  const weight = parseFloat(last.weight);
  return `${prefix} @ ${Number.isFinite(weight) && weight > 0 ? weight : 0} kg ✓`;
}

export const SegmentCard = React.memo(function SegmentCard({
  segment,
  isLogged,
  exerciseSetCounts,
  programId,
  programDayId,
  userId,
  onViewExerciseDetail,
  onRequestSwap,
  onAllSetsSaved,
  onSubscriptionRequired,
  onPrsDetected,
  onExerciseCompleteChange,
  onLayout,
  onInlinePanelOpen,
  onInlinePanelClose,
  onSetsLoggedChange,
}: SegmentCardProps): React.JSX.Element {
  const presentation = getSegmentPresentation({
    segmentType: segment.segmentType,
    rounds: segment.rounds,
    notes: segment.notes,
    exercises: segment.exercises,
  });
  const initialDurationSeconds = roundToNearestMinute(
    segment.segmentDurationSeconds ?? parseMmssToSeconds(segment.segmentDurationMmss),
  );
  const exercises = Array.isArray(segment.exercises) ? segment.exercises : [];
  const loggableExercises = useMemo(
    () => exercises.filter((exercise) => exercise.id),
    [exercises],
  );
  const hasLoggableExercises = loggableExercises.length > 0;
  const isRoundBased = isRoundBasedSegment(segment.segmentType);
  const totalRounds = presentation.roundsValue;
  const showRestTimer = useSettingsStore((state) => state.showRestTimer);
  const existingLogsQuery = useSegmentExerciseLogs(segment.id, programDayId, { userId });
  const saveLogsMutation = useSaveSegmentLogs();
  const [inlineLoggingOpen, setInlineLoggingOpen] = useState(false);
  const [pbSetKeys, setPbSetKeys] = useState<Set<string>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState<number>(initialDurationSeconds ?? 0);
  const [timerRunning, setTimerRunning] = useState(false);
  const restEntry = useTimerStore((state) => state.entries[segment.id] ?? null);
  const [restDisplaySeconds, setRestDisplaySeconds] = useState(0);
  const [showAdjustControls, setShowAdjustControls] = useState(false);
  const pendingEmptyRoundRef = useRef(false);
  const {
    activeRoundIndex,
    setActiveRoundIndex,
    completedRoundIndices,
    setCompletedRoundIndices,
    expandedRoundIndices,
    setExpandedRoundIndices,
    roundSaveError,
    setRoundSaveError,
    showPostStopRir,
    setShowPostStopRir,
    resetRoundState,
  } = useRoundBasedLogging();
  const {
    inputMap,
    setInputMap,
    exerciseRirMap,
    setExerciseRirMap,
    doneSetKeys,
    setDoneSetKeys,
    activeSetKey,
    setActiveSetKey,
    initialized,
  } = useSegmentSetLogging({
    loggableExercises,
    existingLogsQuery,
    inlineLoggingOpen,
    isRoundBased,
    totalRounds,
    onRoundStateReset: () => {
      resetRoundState();
      pendingEmptyRoundRef.current = false;
    },
  });
  const { completedExerciseIds, setCompletedExerciseIds } = useLocalExerciseCompletion(
    loggableExercises,
    programDayId,
  );
  const allExercisesMarkedComplete =
    loggableExercises.length > 0 &&
    loggableExercises.every((ex) => (ex.id ? completedExerciseIds.has(ex.id) : false));
  const showResumeButton = !inlineLoggingOpen && allExercisesMarkedComplete;
  const panelScrolledRef = useRef(false);
  const inlinePanelRef = useRef<View>(null);
  const cardRootRef = useRef<View>(null);
  const prevRestRunning = useRef(false);

  const segmentTypeBadgeLabel =
    segment.segmentType &&
    BADGE_SEGMENT_TYPES.has(segment.segmentType) &&
    typeof segment.segmentTypeLabel === "string" &&
    segment.segmentTypeLabel.trim()
      ? segment.segmentTypeLabel
      : null;

  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    if (!restEntry?.restIsRunning) {
      const remaining =
        restEntry != null
          ? Math.max(0, restEntry.restTotalSeconds - restEntry.restElapsedSeconds)
          : 0;
      setRestDisplaySeconds(remaining);
      return;
    }
    const tick = (): void => {
      if (!restEntry) return;
      const elapsed = Math.floor((Date.now() - (restEntry.restStartedAtMs ?? Date.now())) / 1000);
      const remaining = Math.max(
        0,
        restEntry.restTotalSeconds - (restEntry.restElapsedSeconds + elapsed),
      );
      setRestDisplaySeconds(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [
    restEntry?.restElapsedSeconds,
    restEntry?.restIsRunning,
    restEntry?.restStartedAtMs,
    restEntry?.restTotalSeconds,
  ]);

  useEffect(() => {
    const restIsRunning = restEntry?.restIsRunning ?? false;
    if (prevRestRunning.current && !restIsRunning) {
      setActiveSetKey(findNextUncheckedSetKey(loggableExercises, doneSetKeys));
    }
    prevRestRunning.current = restIsRunning;
  }, [doneSetKeys, loggableExercises, restEntry?.restIsRunning]);

  useEffect(() => {
    onSetsLoggedChange?.(segment.id, doneSetKeys.size);
  }, [doneSetKeys, onSetsLoggedChange, segment.id]);

  const restProgress =
    restEntry != null && restEntry.restTotalSeconds > 0
      ? Math.max(0, Math.min(1, restDisplaySeconds / restEntry.restTotalSeconds))
      : 0;
  const showRestStrip = showRestTimer && restEntry != null && (restEntry.restIsRunning || restDisplaySeconds > 0);
  const totalSetCount = useMemo(() => {
    if (!initialized) {
      return loggableExercises.reduce((sum, ex) => sum + getExerciseSetCount(ex), 0);
    }
    return loggableExercises.reduce((sum, ex) => {
      const key = ex.id ?? "";
      return sum + (inputMap[key]?.length ?? getExerciseSetCount(ex));
    }, 0);
  }, [initialized, inputMap, loggableExercises]);
  const activeExerciseIndex = useMemo(
    () => loggableExercises.findIndex((exercise) => !isExerciseFullyLogged(exercise, doneSetKeys)),
    [doneSetKeys, loggableExercises],
  );

  function restOverrideKey(programExerciseId: string): string {
    return `${programDayId}:${programExerciseId}`;
  }

  function startExerciseRest(exercise: Exercise): void {
    if (!showRestTimer) return;
    const programExerciseId = exercise.id ?? "";
    const overrideKey = restOverrideKey(programExerciseId);
    const override = useTimerStore.getState().restOverrides?.[overrideKey];
    const restTotal = override ?? exercise.restSeconds ?? 90;
    useTimerStore.getState().initEntry({
      segmentId: segment.id,
      segmentTotal: null,
      restTotal,
      restOverrideKey: overrideKey,
    });
    useTimerStore.getState().startRest(segment.id);
    setRestDisplaySeconds(restTotal);
  }

  function closeInlinePanel(options: { clearInputs?: boolean } = {}): void {
    const clearInputs = options.clearInputs ?? true;
    setInlineLoggingOpen(false);
    setShowAdjustControls(false);
    setRoundSaveError(null);
    setShowPostStopRir(false);
    pendingEmptyRoundRef.current = false;
    panelScrolledRef.current = false;
    if (clearInputs) {
      resetRoundState();
      setInputMap({});
      setExerciseRirMap({});
      setDoneSetKeys(new Set());
      setPbSetKeys(new Set());
      setActiveSetKey(null);
    }
  }

  async function handleStopExercise(exercise: Exercise): Promise<void> {
    const programExerciseId = exercise.id;
    if (!programExerciseId) return;
    await setExerciseComplete(programDayId, programExerciseId, true);
    setCompletedExerciseIds((current) => new Set([...current, programExerciseId]));
    closeInlinePanel({ clearInputs: false });
    onExerciseCompleteChange?.(programExerciseId);
  }

  async function handleStopInlinePanel(): Promise<void> {
    const ids = loggableExercises
      .map((exercise) => exercise.id)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) {
      closeInlinePanel();
      return;
    }
    if (isRoundBased && completedRoundIndices.size > 0 && completedRoundIndices.size < totalRounds) {
      setShowPostStopRir(true);
      setRoundSaveError(null);
      return;
    }
    await Promise.all(ids.map((id) => setExerciseComplete(programDayId, id, true)));
    setCompletedExerciseIds((current) => new Set([...current, ...ids]));
    closeInlinePanel({ clearInputs: false });
    ids.forEach((id) => onExerciseCompleteChange?.(id));
    const cardRoot = cardRootRef.current;
    if (typeof cardRoot?.measureInWindow === "function") {
      cardRoot.measureInWindow((_x, y) => {
        onInlinePanelClose?.(y);
      });
    } else {
      onInlinePanelClose?.(0);
    }
  }

  async function handleResumeExercise(): Promise<void> {
    const ids = loggableExercises
      .map((exercise) => exercise.id)
      .filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => setExerciseComplete(programDayId, id, false)));
    setCompletedExerciseIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    ids.forEach((id) => onExerciseCompleteChange?.(id));
    setInlineLoggingOpen(true);
  }

  function buildRoundRows(roundIndex: number, includeRir: boolean): SaveSegmentLogPayload["rows"] {
    return loggableExercises
      .filter((exercise) => Boolean(exercise.id))
      .map((exercise) => {
        const exerciseKey = exercise.id ?? "";
        const row = inputMap[exerciseKey]?.[roundIndex] ?? { weight: "", reps: "", rirActual: null };
        const weightRaw = parseFloat(row.weight);
        const repsRaw = parseInt(row.reps, 10);
        return {
          programExerciseId: exerciseKey,
          orderIndex: roundIndex + 1,
          weightKg: isUnloadedExercise(exercise) ? null : (Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : null),
          repsCompleted: Number.isInteger(repsRaw) && repsRaw > 0 ? repsRaw : 0,
          rirActual: includeRir ? (exerciseRirMap[exerciseKey] ?? null) : null,
        };
      });
  }

  async function handleRoundComplete(roundIndex: number): Promise<void> {
    if (completedRoundIndices.has(roundIndex)) return;
    const allEmpty = loggableExercises.every((exercise) => {
      const row = inputMap[exercise.id ?? ""]?.[roundIndex];
      return !row || (row.weight === "" && row.reps === "");
    });
    if (allEmpty && !pendingEmptyRoundRef.current) {
      pendingEmptyRoundRef.current = true;
      setRoundSaveError("No reps entered for this round. Tap again to save anyway.");
      return;
    }

    pendingEmptyRoundRef.current = false;
    setRoundSaveError(null);
    const isLastRound = roundIndex === totalRounds - 1;
    const rows = buildRoundRows(roundIndex, isLastRound);

    try {
      await saveLogsMutation.mutateAsync({
        userId,
        programId,
        programDayId,
        workoutSegmentId: segment.id,
        rows,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        onSubscriptionRequired?.();
        return;
      }
      setRoundSaveError("Failed to save — please try again.");
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDoneSetKeys((prev) => {
      const next = new Set(prev);
      loggableExercises.forEach((exercise) => next.add(buildSetKey(exercise, roundIndex)));
      return next;
    });
    const firstExercise = loggableExercises[0];
    if (firstExercise) {
      startExerciseRest(firstExercise);
    }
    const nextCompleted = new Set([...completedRoundIndices, roundIndex]);
    setCompletedRoundIndices(nextCompleted);
    if (isLastRound) {
      const ids = loggableExercises
        .map((exercise) => exercise.id)
        .filter((id): id is string => Boolean(id));
      await Promise.all(ids.map((id) => setExerciseComplete(programDayId, id, true)));
      setCompletedExerciseIds((current) => new Set([...current, ...ids]));
      ids.forEach((id) => onExerciseCompleteChange?.(id));
      onAllSetsSaved(segment.id);
      closeInlinePanel({ clearInputs: false });
      return;
    }
    const nextRoundIndex = roundIndex + 1;
    setInputMap((prev) => {
      const next: Record<string, SetInputState[]> = {};
      for (const [key, sets] of Object.entries(prev)) {
        const cloned = [...sets];
        const prevRow = cloned[roundIndex] ?? { weight: "", reps: "", rirActual: null };
        if (nextRoundIndex < cloned.length) {
          cloned[nextRoundIndex] = {
            weight: prevRow.weight,
            reps: prevRow.reps,
            rirActual: null,
          };
        }
        next[key] = cloned;
      }
      return next;
    });
    setActiveRoundIndex(nextRoundIndex);
  }

  async function handlePostStopRirDone(): Promise<void> {
    const lastCompletedRound = Math.max(...Array.from(completedRoundIndices));
    if (Number.isFinite(lastCompletedRound) && lastCompletedRound >= 0) {
      try {
        await saveLogsMutation.mutateAsync({
          userId,
          programId,
          programDayId,
          workoutSegmentId: segment.id,
          rows: buildRoundRows(lastCompletedRound, true),
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 402) {
          onSubscriptionRequired?.();
          return;
        }
      }
    }

    const ids = loggableExercises
      .map((exercise) => exercise.id)
      .filter((id): id is string => Boolean(id));
    await Promise.all(ids.map((id) => setExerciseComplete(programDayId, id, true)));
    setCompletedExerciseIds((current) => new Set([...current, ...ids]));
    setShowPostStopRir(false);
    closeInlinePanel({ clearInputs: false });
    ids.forEach((id) => onExerciseCompleteChange?.(id));
  }

  function handleTimerPress(): void {
    if (initialDurationSeconds == null || initialDurationSeconds <= 0) return;
    if (secondsLeft === 0) {
      setSecondsLeft(initialDurationSeconds);
      setTimerRunning(true);
      return;
    }
    setTimerRunning((r) => !r);
  }

  function updateSetInput(
    exerciseKey: string,
    setIndex: number,
    updater: (prev: SetInputState) => SetInputState,
  ): void {
    setInputMap((current) => {
      const existing = current[exerciseKey] ?? [];
      const next = [...existing];
      next[setIndex] = updater(next[setIndex] ?? { weight: "", reps: "", rirActual: null });
      return { ...current, [exerciseKey]: next };
    });
  }

  function buildSetKey(exercise: Exercise, setIndex: number): string {
    return `${exercise.id ?? exercise.exerciseId ?? exercise.name}:${setIndex}`;
  }

  function fillDown(
    exerciseKey: string,
    setIndex: number,
    field: "weight" | "reps",
    value: string,
    exercise: Exercise,
  ): void {
    setInputMap((current) => {
      const existing = current[exerciseKey] ?? [];
      const next = [...existing];
      next[setIndex] = { ...(next[setIndex] ?? { weight: "", reps: "", rirActual: null }), [field]: value };
      for (let i = setIndex + 1; i < next.length; i += 1) {
        const key = buildSetKey(exercise, i);
        if (!doneSetKeys.has(key)) {
          next[i] = { ...(next[i] ?? { weight: "", reps: "", rirActual: null }), [field]: value };
        }
      }
      return { ...current, [exerciseKey]: next };
    });
  }

  async function handleSetComplete(exercise: Exercise, setIndex: number): Promise<void> {
    const programExerciseId = exercise.id;
    if (!programExerciseId) return;
    const setKey = buildSetKey(exercise, setIndex);
    if (doneSetKeys.has(setKey)) return;

    const row = inputMap[programExerciseId]?.[setIndex] ?? { weight: "", reps: "", rirActual: null };
    const exerciseRir = exerciseRirMap[programExerciseId] ?? null;
    const nextDoneSetKeys = new Set(doneSetKeys);
    nextDoneSetKeys.add(setKey);
    setDoneSetKeys(nextDoneSetKeys);
    setActiveSetKey(setKey);

    const payload: SaveSegmentLogPayload = {
      userId,
      programId,
      programDayId,
      workoutSegmentId: segment.id,
      rows: [{
        programExerciseId,
        orderIndex: setIndex + 1,
        weightKg: isUnloadedExercise(exercise) ? null : (Number.isFinite(parseFloat(row.weight)) ? parseFloat(row.weight) || null : null),
        repsCompleted: Number.isFinite(parseInt(row.reps, 10)) ? parseInt(row.reps, 10) || null : null,
        rirActual: exerciseRir,
      }],
    };

    startExerciseRest(exercise);

    let result: SaveSegmentLogResult;
    try {
      result = await saveLogsMutation.mutateAsync(payload);
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        onSubscriptionRequired?.();
        return;
      }
      return;
    }
    if (result.prs.length > 0) {
      onPrsDetected?.(
        result.prs
          .map((pr) => {
            const matchedExercise = exercises.find((exercise) => exercise.id === pr.programExerciseId);
            return {
              exerciseName: matchedExercise?.name ?? "Exercise",
              estimated1rmKg: pr.estimated1rmKg,
            };
          })
          .filter((pr) => pr.estimated1rmKg > 0),
      );
      setPbSetKeys((prev) => {
        const next = new Set(prev);
        for (const pr of result.prs) {
          if (pr.programExerciseId === programExerciseId) {
            next.add(setKey);
          }
        }
        return next;
      });
    }
    if (nextDoneSetKeys.size >= totalSetCount) {
      onAllSetsSaved(segment.id);
    }
  }

  function handleAddSet(exercise: Exercise): void {
    const exerciseKey = exercise.id ?? "";
    setInputMap((current) => {
      const existing = current[exerciseKey] ?? [];
      const last = existing[existing.length - 1] ?? { weight: "", reps: "", rirActual: null };
      return {
        ...current,
        [exerciseKey]: [...existing, { weight: last.weight, reps: last.reps, rirActual: null }],
      };
    });
  }

  function handleRemoveSet(exercise: Exercise): void {
    const exerciseKey = exercise.id ?? "";
    const currentLength = inputMap[exerciseKey]?.length ?? 1;
    if (currentLength <= 1) return;

    setInputMap((current) => {
      const existing = current[exerciseKey] ?? [];
      if (existing.length <= 1) return current;
      return { ...current, [exerciseKey]: existing.slice(0, -1) };
    });
    setDoneSetKeys((prev) => {
      const removedIndex = currentLength - 1;
      const removedKey = `${exerciseKey}:${removedIndex}`;
      if (!prev.has(removedKey)) return prev;
      const next = new Set(prev);
      next.delete(removedKey);
      return next;
    });
    setPbSetKeys((prev) => {
      const removedIndex = currentLength - 1;
      const removedKey = `${exerciseKey}:${removedIndex}`;
      if (!prev.has(removedKey)) return prev;
      const next = new Set(prev);
      next.delete(removedKey);
      return next;
    });
  }

  async function handleLogAllSets(exercise: Exercise): Promise<void> {
    const exerciseKey = exercise.id ?? "";
    const programExerciseId = exercise.id;
    if (!programExerciseId) return;
    const sets = inputMap[exerciseKey] ?? [];
    const exerciseRir = exerciseRirMap[exerciseKey] ?? null;

    const uncheckedRows: Array<{ setIndex: number; row: SetInputState }> = [];
    for (let setIndex = 0; setIndex < sets.length; setIndex += 1) {
      const setKey = buildSetKey(exercise, setIndex);
      if (!doneSetKeys.has(setKey)) {
        uncheckedRows.push({ setIndex, row: sets[setIndex] });
      }
    }
    if (uncheckedRows.length === 0) return;

    const nextDoneSetKeys = new Set(doneSetKeys);
    for (const { setIndex } of uncheckedRows) {
      nextDoneSetKeys.add(buildSetKey(exercise, setIndex));
    }
    setDoneSetKeys(nextDoneSetKeys);
    setActiveSetKey(buildSetKey(exercise, uncheckedRows[uncheckedRows.length - 1].setIndex));

    const payload: SaveSegmentLogPayload = {
      userId,
      programId,
      programDayId,
      workoutSegmentId: segment.id,
      rows: uncheckedRows.map(({ setIndex, row }) => ({
        programExerciseId,
        orderIndex: setIndex + 1,
        weightKg: isUnloadedExercise(exercise) ? null : (Number.isFinite(parseFloat(row.weight)) ? parseFloat(row.weight) || null : null),
        repsCompleted: Number.isFinite(parseInt(row.reps, 10)) ? parseInt(row.reps, 10) || null : null,
        rirActual: exerciseRir,
      })),
    };

    startExerciseRest(exercise);

    let result: SaveSegmentLogResult;
    try {
      result = await saveLogsMutation.mutateAsync(payload);
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        onSubscriptionRequired?.();
        return;
      }
      return;
    }

    if (result.prs.length > 0) {
      onPrsDetected?.(
        result.prs
          .map((pr) => {
            const matchedExercise = exercises.find((candidate) => candidate.id === pr.programExerciseId);
            return {
              exerciseName: matchedExercise?.name ?? "Exercise",
              estimated1rmKg: pr.estimated1rmKg,
            };
          })
          .filter((pr) => pr.estimated1rmKg > 0),
      );
      setPbSetKeys((prev) => {
        const next = new Set(prev);
        for (const pr of result.prs) {
          if (pr.programExerciseId === programExerciseId) {
            for (const { setIndex } of uncheckedRows) {
              next.add(buildSetKey(exercise, setIndex));
            }
          }
        }
        return next;
      });
    }
    if (nextDoneSetKeys.size >= totalSetCount) {
      onAllSetsSaved(segment.id);
    }
  }

  function formatRoundExerciseValue(exercise: Exercise, roundIndex: number): string | null {
    const row = inputMap[exercise.id ?? ""]?.[roundIndex];
    if (!row) return null;
    const reps = parseInt(row.reps, 10);
    if (!Number.isInteger(reps) || reps <= 0) return null;
    if (isUnloadedExercise(exercise)) return `bodyweight x ${reps}`;
    const weight = parseFloat(row.weight);
    if (!Number.isFinite(weight) || weight <= 0) return `0 kg x ${reps}`;
    return `${weight} kg x ${reps}`;
  }

  function handleSelectRir(exercise: Exercise, optionValue: number): void {
    setExerciseRirMap((current) => ({
      ...current,
      [exercise.id ?? ""]: optionValue,
    }));
  }

  function toggleExpandedRound(roundIndex: number): void {
    setExpandedRoundIndices((current) => {
      const next = new Set(current);
      if (next.has(roundIndex)) {
        next.delete(roundIndex);
      } else {
        next.add(roundIndex);
      }
      return next;
    });
  }

  return (
    <View ref={cardRootRef} style={styles.card} onLayout={onLayout}>
      <SegmentCardHeader
        segmentName={segment.segmentName}
        segmentTypeBadgeLabel={segmentTypeBadgeLabel}
        notesText={
          !presentation.isWarmupOrCooldown && presentation.segmentHasExercises && String(segment.notes ?? "").trim()
            ? String(segment.notes).trim()
            : null
        }
        initialDurationSeconds={initialDurationSeconds}
        secondsLeft={secondsLeft}
        timerRunning={timerRunning}
        onTimerPress={handleTimerPress}
        isLogged={isLogged}
      />

      <View style={styles.bodyRow}>
        <View style={styles.bodyLhs}>
          {presentation.isWarmupOrCooldown ? (
            <View style={styles.notesContainer} testID="segment-notes-content">
              <Text style={styles.notesText}>{presentation.notesText}</Text>
            </View>
          ) : (
            <View style={styles.exerciseList} testID="segment-exercise-list">
              {presentation.showRoundsIndicator ? (
                <View style={styles.roundsIndicator} testID="segment-rounds-indicator">
                  <Ionicons name="sync-outline" size={14} color={colors.textSecondary} />
                  <Text style={styles.roundsText}>{presentation.roundsValue} rounds</Text>
                </View>
              ) : null}

              {presentation.segmentHasExercises ? (
                isRoundBased ? (
                  <View style={styles.pairedGroup} testID="segment-paired-group">
                    {exercises.map((exercise, index) => {
                      const line2 = [
                        exercise.sets != null ? `${exercise.sets} set${exercise.sets !== 1 ? "s" : ""}` : null,
                        exercise.reps ? `${exercise.reps} ${exercise.repsUnit ?? "reps"}` : null,
                        exercise.intensity ?? null,
                      ]
                        .filter(Boolean)
                        .join(" ");
                      const programExerciseId = exercise.id ?? "";
                      const exerciseId = exercise.exerciseId ?? programExerciseId;
                      const isComplete = completedExerciseIds.has(programExerciseId);
                      const summary = isComplete
                        ? index === 0
                          ? formatRoundSummary(loggableExercises, totalRounds, completedRoundIndices.size, inputMap, doneSetKeys)
                          : null
                        : null;

                      return (
                        <React.Fragment key={exercise.id ?? `${segment.id}-exercise-${index}`}>
                          <SegmentExerciseListItem
                            exercise={exercise}
                            index={index}
                            line2={line2 || null}
                            summary={summary}
                            isComplete={isComplete}
                            programExerciseId={programExerciseId}
                            exerciseId={exerciseId}
                            inlineLoggingOpen={inlineLoggingOpen}
                            hasLoggableExercises={hasLoggableExercises}
                            isRoundBased={isRoundBased}
                            showResumeButton={showResumeButton}
                            onViewExerciseDetail={onViewExerciseDetail}
                            onRequestSwap={onRequestSwap}
                            onStartExercise={() => setInlineLoggingOpen(true)}
                            onResumeExercise={() => { void handleResumeExercise(); }}
                          />
                          {index < exercises.length - 1 ? <View style={styles.pairedDivider} /> : null}
                        </React.Fragment>
                      );
                    })}
                    {(() => {
                      const groupRestSeconds = loggableExercises[0]?.restSeconds ?? null;
                      return groupRestSeconds != null && groupRestSeconds > 0 ? (
                        <View style={styles.pairedGroupRestRow}>
                          <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                          <Text style={styles.pairedGroupRestLabel}>
                            Rest {groupRestSeconds}s after each round
                          </Text>
                        </View>
                      ) : null;
                    })()}
                  </View>
                ) : (
                  exercises.map((exercise, index) => {
                    const line2 = [
                      exercise.sets != null ? `${exercise.sets} set${exercise.sets !== 1 ? "s" : ""}` : null,
                      exercise.reps ? `${exercise.reps} ${exercise.repsUnit ?? "reps"}` : null,
                      exercise.intensity ?? null,
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const programExerciseId = exercise.id ?? "";
                    const exerciseId = exercise.exerciseId ?? programExerciseId;
                    const isComplete = completedExerciseIds.has(programExerciseId);
                    const summary = isComplete
                      ? formatExerciseSummary(exercise, inputMap[programExerciseId], doneSetKeys)
                      : null;

                    return (
                      <SegmentExerciseListItem
                        key={exercise.id ?? `${segment.id}-exercise-${index}`}
                        exercise={exercise}
                        index={index}
                        line2={line2 || null}
                        summary={summary}
                        isComplete={isComplete}
                        programExerciseId={programExerciseId}
                        exerciseId={exerciseId}
                        inlineLoggingOpen={inlineLoggingOpen}
                        hasLoggableExercises={hasLoggableExercises}
                        isRoundBased={isRoundBased}
                        showResumeButton={showResumeButton}
                        onViewExerciseDetail={onViewExerciseDetail}
                        onRequestSwap={onRequestSwap}
                        onStartExercise={() => setInlineLoggingOpen(true)}
                        onResumeExercise={() => { void handleResumeExercise(); }}
                      />
                    );
                  })
                )
              ) : (
                <Text style={styles.exerciseMeta}>No exercises available.</Text>
              )}
              {isRoundBased && !inlineLoggingOpen && hasLoggableExercises ? (() => {
                return (
                  <PressableScale
                    style={[
                      styles.exerciseActionButton,
                      allExercisesMarkedComplete && styles.exerciseActionButtonDisabled,
                    ]}
                    disabled={allExercisesMarkedComplete}
                    onPress={() => {
                      setInlineLoggingOpen(true);
                    }}
                  >
                    <Text
                      style={[
                        styles.exerciseActionLabel,
                        allExercisesMarkedComplete && styles.exerciseActionLabelDisabled,
                      ]}
                    >
                      {allExercisesMarkedComplete ? "Exercise Complete" : "Start Exercise"}
                    </Text>
                  </PressableScale>
                );
              })() : null}
              {isRoundBased && showResumeButton ? (
                <PressableScale
                  style={[styles.exerciseActionButton, styles.exerciseActionButtonResume]}
                  onPress={() => { void handleResumeExercise(); }}
                  accessibilityLabel="Resume exercise"
                >
                  <Text style={[styles.exerciseActionLabel, styles.exerciseActionLabelResume]}>
                    Resume
                  </Text>
                </PressableScale>
              ) : null}
	            </View>
	          )}
        </View>
      </View>

      {inlineLoggingOpen ? (
        <View
          ref={inlinePanelRef}
          style={styles.inlinePanel}
          onLayout={() => {
            if (!panelScrolledRef.current) {
              panelScrolledRef.current = true;
              inlinePanelRef.current?.measure((_x, _y, _w, _h, _pageX, pageY) => {
                onInlinePanelOpen?.(pageY);
              });
            }
          }}
        >
          <View style={styles.inlinePanelHeader}>
            <View />
            <PressableScale style={styles.closeLink} onPress={() => closeInlinePanel()}>
              <Text style={styles.closeLinkLabel}>Close</Text>
            </PressableScale>
          </View>

          {!initialized && existingLogsQuery.isLoading ? (
            <View style={styles.loadingBlock}>
              <SkeletonBlock height={160} />
            </View>
          ) : isRoundBased ? (
            <RoundBasedLoggingPanel
              totalRounds={totalRounds}
              completedRoundIndices={completedRoundIndices}
              activeRoundIndex={activeRoundIndex}
              showPostStopRir={showPostStopRir}
              expandedRoundIndices={expandedRoundIndices}
              onToggleExpandedRound={toggleExpandedRound}
              loggableExercises={loggableExercises}
              inputMap={inputMap}
              onUpdateSetInput={updateSetInput}
              exerciseRirMap={exerciseRirMap}
              onSelectRir={handleSelectRir}
              roundSaveError={roundSaveError}
              onRoundComplete={handleRoundComplete}
              onPostStopRirDone={handlePostStopRirDone}
              getExerciseValue={formatRoundExerciseValue}
              showRestStrip={showRestStrip}
              restStripProps={{
                restDisplaySeconds,
                restProgress,
                showAdjustControls,
                onToggleAdjust: () => setShowAdjustControls((current) => !current),
                onReset: () => {
                  useTimerStore.getState().stopRest(segment.id);
                  setRestDisplaySeconds(0);
                },
                onAdjust: (delta) => {
                  const overrideKey = restEntry?.restOverrideKey ?? null;
                  useTimerStore.getState().adjustRestDuration(segment.id, delta, overrideKey);
                },
                onAdjustLongPress: (delta) => {
                  const overrideKey = restEntry?.restOverrideKey ?? null;
                  useTimerStore.getState().adjustRestDuration(segment.id, delta, overrideKey);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                },
              }}
            />
          ) : (
            <>
              {showRestStrip ? (
                <InlineRestStrip
                  restDisplaySeconds={restDisplaySeconds}
                  restProgress={restProgress}
                  showAdjustControls={showAdjustControls}
                  onToggleAdjust={() => setShowAdjustControls((current) => !current)}
                  onReset={() => {
                    useTimerStore.getState().stopRest(segment.id);
                    setRestDisplaySeconds(0);
                  }}
                  onAdjust={(delta) => {
                    const overrideKey = restEntry?.restOverrideKey ?? null;
                    useTimerStore.getState().adjustRestDuration(segment.id, delta, overrideKey);
                  }}
                  onAdjustLongPress={(delta) => {
                    const overrideKey = restEntry?.restOverrideKey ?? null;
                    useTimerStore.getState().adjustRestDuration(segment.id, delta, overrideKey);
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                />
              ) : null}
              {loggableExercises.map((exercise, index) => {
                const exerciseKey = exercise.id ?? "";
                const isSequenced = loggableExercises.length > 1 && activeExerciseIndex !== -1;

                if (isSequenced && index > activeExerciseIndex) {
                  return (
                    <View key={exerciseKey} style={styles.exerciseLockedRow}>
                      <Text style={styles.exerciseLockedLabel}>
                        {`${exercise.name} · complete ${loggableExercises[index - 1].name} to unlock`}
                      </Text>
                    </View>
                  );
                }

                if (isSequenced && index < activeExerciseIndex) {
                  const summaryText = formatExerciseSummary(exercise, inputMap[exerciseKey], doneSetKeys);
                  return (
                    <View key={exerciseKey} style={styles.exerciseLoggedSummaryRow}>
                      <Text style={styles.exerciseLoggedSummaryLabel}>
                        {`${exercise.name} ✓${summaryText ? `  ${summaryText}` : ""}`}
                      </Text>
                    </View>
                  );
                }

                const exerciseRir = exerciseRirMap[exerciseKey] ?? null;
                const setInputs = inputMap[exerciseKey] ?? Array.from({ length: getExerciseSetCount(exercise) }, () => ({
                  weight: "",
                  reps: "",
                  rirActual: null,
                }));

                return (
                  <InlineExerciseLogBlock
                    key={exerciseKey}
                    exercise={exercise}
                    setInputs={setInputs}
                    doneSetKeys={doneSetKeys}
                    activeSetKey={activeSetKey}
                    pbSetKeys={pbSetKeys}
                    exerciseRir={exerciseRir}
                    onFillDown={fillDown}
                    onSetComplete={handleSetComplete}
                    onAddSet={handleAddSet}
                    onRemoveSet={handleRemoveSet}
                    onLogAllSets={handleLogAllSets}
                    onSelectRir={handleSelectRir}
                  />
                );
              })}
            </>
          )}
          {hasLoggableExercises ? (
            <PressableScale
              style={[styles.exerciseActionButton, styles.exerciseActionButtonStop, styles.inlineStopButton]}
              onPress={() => { void handleStopInlinePanel(); }}
            >
              <Text style={[styles.exerciseActionLabel, styles.exerciseActionLabelStop]}>
                Close Log
              </Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}

      {(segment.postSegmentRestSec ?? 0) > 0 ? (
        <View style={styles.segmentRestRow}>
          <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.segmentRestLabel}>
            Rest {segment.postSegmentRestSec}s before next block
          </Text>
        </View>
      ) : null}

      {!isLogged && hasLoggableExercises && !inlineLoggingOpen ? null : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  bodyLhs: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  exerciseList: {
    gap: spacing.sm,
  },
  notesContainer: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
  },
  notesText: {
    color: colors.textSecondary,
    ...typography.body,
  },
  roundsIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: 2,
  },
  roundsText: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  pairedGroup: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  pairedDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  pairedGroupRestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pairedGroupRestLabel: {
    color: colors.textSecondary,
    ...typography.small,
  },
  exerciseMeta: {
    color: colors.textSecondary,
    ...typography.small,
  },
  exerciseActionButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  exerciseActionButtonStop: {
    backgroundColor: colors.warning,
  },
  inlineStopButton: {
    alignSelf: "stretch",
    marginTop: spacing.sm,
  },
  exerciseActionButtonDisabled: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseActionLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "700",
  },
  exerciseActionLabelStop: {
    color: colors.background,
  },
  exerciseActionLabelDisabled: {
    color: colors.textSecondary,
  },
  exerciseActionButtonResume: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.textSecondary,
    marginTop: spacing.xs,
  },
  exerciseActionLabelResume: {
    color: colors.textSecondary,
  },
  inlinePanel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  inlinePanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  closeLink: {
    alignSelf: "flex-end",
  },
  closeLinkLabel: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  loadingBlock: {
    gap: spacing.sm,
  },
  exerciseLockedRow: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  exerciseLockedLabel: {
    color: colors.textSecondary,
    ...typography.small,
  },
  exerciseLoggedSummaryRow: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.card,
    padding: spacing.sm,
  },
  exerciseLoggedSummaryLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "700",
  },
  segmentRestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  segmentRestLabel: {
    color: colors.textSecondary,
    ...typography.small,
  },
  logButton: {
    alignSelf: "flex-start",
    minHeight: 38,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  logButtonLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
});

