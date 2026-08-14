import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { type LayoutChangeEvent, StyleSheet, Text, TextInput, View } from "react-native";
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
import { RIR_OPTIONS, RirRoundPicker } from "./segmentCard/RirRoundPicker";
import { RoundSummaryRow } from "./segmentCard/RoundSummaryRow";

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
  onAllSetsSaved: (segmentId: string) => void;
  onSubscriptionRequired?: () => void;
  onPrsDetected?: (prs: Array<{ exerciseName: string; estimated1rmKg: number }>) => void;
  onExerciseCompleteChange?: (programExerciseId: string) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onInlinePanelOpen?: (pageY: number) => void;
  onInlinePanelClose?: (pageY: number) => void;
};

const BADGE_SEGMENT_TYPES = new Set(["single", "superset", "giant_set", "amrap", "emom"]);
const CHIP_PALETTE: Record<string, { bg: string; text: string; border: string }> = {
  increase_load: { bg: "#052e16", text: colors.success, border: "#16a34a" },
  increase_reps: { bg: "#052e16", text: colors.success, border: "#16a34a" },
  increase_sets: { bg: "#052e16", text: colors.success, border: "#16a34a" },
  reduce_rest: { bg: "#0c1a4a", text: colors.accent, border: "#3b82f6" },
  deload_local: { bg: "#451a03", text: colors.warning, border: "#d97706" },
};

function formatDuration(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

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

function formatRestTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
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

export function SegmentCard({
  segment,
  isLogged,
  exerciseSetCounts,
  programId,
  programDayId,
  userId,
  onViewExerciseDetail,
  onAllSetsSaved,
  onSubscriptionRequired,
  onPrsDetected,
  onExerciseCompleteChange,
  onLayout,
  onInlinePanelOpen,
  onInlinePanelClose,
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

  function renderRoundBasedPanel(): React.ReactNode {
    return (
      <>
        {Array.from({ length: totalRounds }, (_value, roundIndex) => {
          const isCompleted = completedRoundIndices.has(roundIndex);
          const isActive = roundIndex === activeRoundIndex && !isCompleted && !showPostStopRir;
          const isLocked = !isCompleted && !isActive;
          const isLastRound = roundIndex === totalRounds - 1;

          if (isCompleted) {
            return (
              <RoundSummaryRow
                key={roundIndex}
                roundIndex={roundIndex}
                expanded={expandedRoundIndices.has(roundIndex)}
                onToggle={(index) =>
                  setExpandedRoundIndices((current) => {
                    const next = new Set(current);
                    if (next.has(index)) {
                      next.delete(index);
                    } else {
                      next.add(index);
                    }
                    return next;
                  })
                }
                loggableExercises={loggableExercises}
                getExerciseValue={formatRoundExerciseValue}
              />
            );
          }

          if (isLocked) {
            return (
              <View key={roundIndex} style={styles.roundLockedRow}>
                <Text style={styles.roundLockedLabel}>
                  {`Round ${roundIndex + 1} · complete round ${roundIndex} to unlock`}
                </Text>
              </View>
            );
          }

          return (
            <View key={roundIndex} style={styles.roundActiveBlock}>
              <Text style={styles.roundActiveLabel}>{`Round ${roundIndex + 1}`}</Text>
              {loggableExercises.map((exercise) => {
                const exerciseKey = exercise.id ?? "";
                const row = inputMap[exerciseKey]?.[roundIndex] ?? { weight: "", reps: "", rirActual: null };
                return (
                  <View key={exerciseKey} style={styles.roundExerciseRow}>
                    <Text style={styles.roundExerciseName} numberOfLines={1}>{exercise.name}</Text>
                    {isUnloadedExercise(exercise) ? (
                      <View style={styles.weightInputGroup}>
                        <Text style={styles.bodyweightDash}>—</Text>
                      </View>
                    ) : (
                      <View style={styles.weightInputGroup}>
                        <TextInput
                          value={row.weight}
                          onChangeText={(value) => {
                            const sanitized = value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                            updateSetInput(exerciseKey, roundIndex, (prev) => ({ ...prev, weight: sanitized }));
                          }}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={colors.textSecondary}
                          style={styles.inputField}
                        />
                        <View style={styles.inputSuffixWrap}>
                          <Text style={styles.inputSuffix}>kg</Text>
                        </View>
                      </View>
                    )}
                    <View style={styles.repsInputGroup}>
                      <TextInput
                        value={row.reps}
                        onChangeText={(value) => {
                          const sanitized = value.replace(/[^0-9]/g, "");
                          updateSetInput(exerciseKey, roundIndex, (prev) => ({ ...prev, reps: sanitized }));
                        }}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textSecondary}
                        style={styles.inputField}
                      />
                    </View>
                  </View>
                );
              })}
              {isLastRound ? (
                <View style={styles.exerciseRirBlock}>
                  <Text style={styles.exerciseRirQuestion}>
                    How many more reps could you complete per set?
                  </Text>
                  {loggableExercises.map((exercise) => (
                    <RirRoundPicker
                      key={exercise.id ?? exercise.name}
                      exercise={exercise}
                      selectedRir={exerciseRirMap[exercise.id ?? ""] ?? null}
                      onSelect={(optionValue) =>
                        setExerciseRirMap((current) => ({
                          ...current,
                          [exercise.id ?? ""]: optionValue,
                        }))
                      }
                    />
                  ))}
                  <View style={styles.rirHintRow}>
                    <Text style={styles.rirHintText}>Too easy</Text>
                    <Text style={styles.rirHintText}>Max effort</Text>
                  </View>
                </View>
              ) : null}
              {roundSaveError ? (
                <Text style={styles.roundSaveError}>{roundSaveError}</Text>
              ) : null}
              <PressableScale
                style={styles.markRoundButton}
                onPress={() => { void handleRoundComplete(roundIndex); }}
              >
                <Text style={styles.markRoundButtonLabel}>Mark round complete</Text>
              </PressableScale>
            </View>
          );
        })}
        {showPostStopRir ? (
          <View style={styles.postStopRirBlock}>
            <Text style={styles.exerciseRirQuestion}>
              How many more reps could you complete per set?
            </Text>
            {loggableExercises.map((exercise) => (
              <RirRoundPicker
                key={exercise.id ?? exercise.name}
                exercise={exercise}
                selectedRir={exerciseRirMap[exercise.id ?? ""] ?? null}
                onSelect={(optionValue) =>
                  setExerciseRirMap((current) => ({
                    ...current,
                    [exercise.id ?? ""]: optionValue,
                  }))
                }
              />
            ))}
            <View style={styles.rirHintRow}>
              <Text style={styles.rirHintText}>Too easy</Text>
              <Text style={styles.rirHintText}>Max effort</Text>
            </View>
            <PressableScale
              style={styles.markRoundButton}
              onPress={() => { void handlePostStopRirDone(); }}
            >
              <Text style={styles.markRoundButtonLabel}>Done</Text>
            </PressableScale>
          </View>
        ) : null}
      </>
    );
  }

  return (
    <View ref={cardRootRef} style={styles.card} onLayout={onLayout}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.segmentName}>{segment.segmentName}</Text>
          {segmentTypeBadgeLabel ? (
            <View style={styles.segmentTypeBadge}>
              <Text style={styles.segmentTypeBadgeText}>{segmentTypeBadgeLabel}</Text>
            </View>
          ) : null}
          {!presentation.isWarmupOrCooldown && presentation.segmentHasExercises && String(segment.notes ?? "").trim() ? (
            <Text style={styles.segmentMeta} numberOfLines={3} ellipsizeMode="tail">
              {String(segment.notes).trim()}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerRight}>
          {initialDurationSeconds != null && initialDurationSeconds > 0 ? (
            <PressableScale
              style={styles.durationChip}
              accessibilityLabel={timerRunning ? "Pause segment timer" : "Start segment timer"}
              onPress={handleTimerPress}
            >
              <Ionicons
                name={timerRunning ? "pause-circle-outline" : "time-outline"}
                size={13}
                color={timerRunning ? colors.accent : colors.textSecondary}
              />
              <Text style={[styles.durationText, timerRunning && styles.durationTextRunning]}>
                {formatDuration(secondsLeft)}
              </Text>
            </PressableScale>
          ) : null}
          <View style={[styles.loggedBadge, !isLogged && styles.loggedBadgeHidden]}>
            <Text style={styles.loggedText}>Logged</Text>
          </View>
        </View>
      </View>

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
                    ? isRoundBased
                      ? index === 0
                        ? formatRoundSummary(loggableExercises, totalRounds, completedRoundIndices.size, inputMap, doneSetKeys)
                        : null
                      : formatExerciseSummary(exercise, inputMap[programExerciseId], doneSetKeys)
                    : null;
                  return (
                    <View
                      key={exercise.id ?? `${segment.id}-exercise-${index}`}
                      style={[styles.exerciseRow, isComplete && styles.exerciseRowComplete]}
                    >
                      <PressableScale
                        style={styles.exerciseNamePressable}
                        onPress={() => onViewExerciseDetail(exerciseId, programExerciseId, exercise.name, exercise)}
                      >
                        <Text style={styles.exerciseName} numberOfLines={2} ellipsizeMode="tail">
                          {exercise.name}
                        </Text>
                      </PressableScale>
                      {line2 ? (
                        <Text style={styles.exerciseMeta} numberOfLines={1} ellipsizeMode="tail">
                          {line2}
                        </Text>
                      ) : null}
                      {summary ? (
                        <Text style={styles.exerciseCompleteSummary} numberOfLines={1} ellipsizeMode="tail">
                          {summary}
                        </Text>
                      ) : null}
                      {exercise.restSeconds != null && exercise.restSeconds > 0 ? (
                        <View style={styles.restRow}>
                          <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                          <Text style={styles.exerciseMeta}>Rest {exercise.restSeconds} s</Text>
                        </View>
                      ) : null}
                      {(() => {
                        const decision = exercise.adaptationDecision ?? null;
                        if (!decision || decision.outcome === "hold") return null;
                        const palette = CHIP_PALETTE[decision.outcome] ?? {
                          bg: "#0c1a4a",
                          text: colors.accent,
                          border: "#3b82f6",
                        };

                        return (
                          <PressableScale
                            onPress={() => onViewExerciseDetail(exerciseId, programExerciseId, exercise.name, exercise)}
                            style={[
                              styles.adaptChip,
                              { backgroundColor: palette.bg, borderColor: palette.border },
                            ]}
                          >
                            <Text style={[styles.adaptChipText, { color: palette.text }]}>
                              {decision.displayChip}
                            </Text>
                          </PressableScale>
                        );
                      })()}
                      {!inlineLoggingOpen && hasLoggableExercises && !isRoundBased ? (
                        <PressableScale
                          style={[
                            styles.exerciseActionButton,
                            isComplete && styles.exerciseActionButtonDisabled,
                          ]}
                          disabled={isComplete}
                          onPress={() => {
                            setInlineLoggingOpen(true);
                          }}
                        >
                          <Text
                            style={[
                              styles.exerciseActionLabel,
                              isComplete && styles.exerciseActionLabelDisabled,
                            ]}
                          >
                            {isComplete ? "Exercise Complete" : "Start Exercise"}
                          </Text>
                        </PressableScale>
                      ) : null}
                      {!isRoundBased && showResumeButton && index === 0 ? (
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
                  );
	                })
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

          {showRestStrip ? (
            <View style={styles.restStrip}>
              <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.restStripLabel}>Rest</Text>
              <Text style={styles.restStripCountdown}>{formatRestTimer(restDisplaySeconds)}</Text>
              <View style={styles.restStripBarTrack}>
                <View style={[styles.restStripBarFill, { flex: restProgress }]} />
                <View style={{ flex: 1 - restProgress }} />
              </View>
              <PressableScale
                style={styles.restStripSkip}
                onPress={() => {
                  useTimerStore.getState().stopRest(segment.id);
                  setRestDisplaySeconds(0);
                }}
              >
                <Text style={styles.restStripSkipLabel}>Reset</Text>
              </PressableScale>
              <PressableScale
                style={styles.restAdjustChip}
                onPress={() => setShowAdjustControls((current) => !current)}
              >
                <Text style={styles.restStripSkipLabel}>Adjust</Text>
              </PressableScale>
              {showAdjustControls ? (
                <View style={styles.restAdjustControls}>
                  {[
                    { label: "-", delta: -15, longDelta: -60 },
                    { label: "+", delta: 15, longDelta: 60 },
                  ].map((button) => (
                    <PressableScale
                      key={button.label}
                      style={styles.restAdjustButton}
                      onPress={() => {
                        const overrideKey = restEntry?.restOverrideKey ?? null;
                        useTimerStore.getState().adjustRestDuration(segment.id, button.delta, overrideKey);
                      }}
                      onLongPress={() => {
                        const overrideKey = restEntry?.restOverrideKey ?? null;
                        useTimerStore.getState().adjustRestDuration(segment.id, button.longDelta, overrideKey);
                        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      }}
                    >
                      <Text style={styles.restStripSkipLabel}>{button.label}</Text>
                    </PressableScale>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {!initialized && existingLogsQuery.isLoading ? (
            <View style={styles.loadingBlock}>
              <SkeletonBlock height={160} />
            </View>
          ) : isRoundBased ? (
            renderRoundBasedPanel()
          ) : (
            loggableExercises.map((exercise) => {
              const exerciseKey = exercise.id ?? "";
              const exerciseRir = exerciseRirMap[exerciseKey] ?? null;
              const setInputs = inputMap[exerciseKey] ?? Array.from({ length: getExerciseSetCount(exercise) }, () => ({
                weight: "",
                reps: "",
                rirActual: null,
              }));

              return (
                <View key={exerciseKey} style={styles.inlineExerciseBlock}>
                  {setInputs.map((setInput, setIndex) => {
                    const setKey = buildSetKey(exercise, setIndex);
                    const isDone = doneSetKeys.has(setKey);
                    const isActive = activeSetKey === setKey;
                    return (
                      <View key={setKey} style={[styles.setRow, isDone && styles.setRowDone, isActive && styles.setRowActive]}>
                        <Text style={[styles.setLabel, isDone && styles.setLabelDone]}>{`Set ${setIndex + 1}`}</Text>
                        {isDone && pbSetKeys.has(setKey) ? (
                          <View style={styles.pbBadge}>
                            <Text style={styles.pbBadgeText}>PB</Text>
                          </View>
                        ) : null}
                        {isUnloadedExercise(exercise) ? (
                          <View style={styles.weightInputGroup}>
                            <Text style={[styles.bodyweightDash, isDone && styles.inputFieldDone]}>—</Text>
                          </View>
                        ) : (
                          <View style={styles.weightInputGroup}>
                            <TextInput
                              value={setInput.weight}
                              onChangeText={(value) => {
                                const sanitized = value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                                fillDown(exerciseKey, setIndex, "weight", sanitized, exercise);
                              }}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor={colors.textSecondary}
                              style={[styles.inputField, isDone && styles.inputFieldDone]}
                            />
                            <View style={styles.inputSuffixWrap}>
                              <Text style={[styles.inputSuffix, isDone && styles.inputSuffixDone]}>kg</Text>
                            </View>
                          </View>
                        )}
                        <View style={styles.repsInputGroup}>
                          <TextInput
                            value={setInput.reps}
                            onChangeText={(value) => {
                              const sanitized = value.replace(/[^0-9]/g, "");
                              fillDown(exerciseKey, setIndex, "reps", sanitized, exercise);
                            }}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={colors.textSecondary}
                            style={[styles.inputField, isDone && styles.inputFieldDone]}
                          />
                        </View>
                        <PressableScale
                          style={styles.checkboxButton}
                          accessibilityLabel={`${exercise.name} set ${setIndex + 1} complete`}
                          onPress={() => { void handleSetComplete(exercise, setIndex); }}
                        >
                          <Ionicons
                            name={isDone ? "checkbox" : "checkbox-outline"}
                            size={22}
                            color={isDone ? colors.success : colors.textSecondary}
                          />
                        </PressableScale>
                      </View>
                    );
                  })}
                  <View style={styles.setMutationRow}>
                    <PressableScale
                      style={[styles.setMutationButton, setInputs.length <= 1 && styles.setMutationButtonDisabled]}
                      accessibilityLabel={`Remove set for ${exercise.name}`}
                      onPress={() => handleRemoveSet(exercise)}
                    >
                      <Ionicons
                        name="remove-circle-outline"
                        size={16}
                        color={setInputs.length <= 1 ? colors.textSecondary : colors.textPrimary}
                      />
                      <Text style={[styles.setMutationLabel, setInputs.length <= 1 && styles.setMutationLabelDisabled]}>
                        Remove set
                      </Text>
                    </PressableScale>
                    <PressableScale
                      style={styles.setMutationButton}
                      accessibilityLabel={`Add set for ${exercise.name}`}
                      onPress={() => handleAddSet(exercise)}
                    >
                      <Ionicons name="add-circle-outline" size={16} color={colors.textPrimary} />
                      <Text style={styles.setMutationLabel}>Add set</Text>
                    </PressableScale>
                  </View>
                  <View style={styles.exerciseRirBlock}>
                    <PressableScale
                      style={styles.logAllButton}
                      onPress={() => { void handleLogAllSets(exercise); }}
                    >
                      <Text style={styles.logAllButtonLabel}>Log all sets as complete</Text>
                    </PressableScale>
                    <Text style={styles.exerciseRirQuestion}>
                      How many more reps could you complete per set?
                    </Text>
                    <View style={styles.rirPills}>
                      {RIR_OPTIONS.map((option) => {
                        const optionValue = option === "4+" ? 4 : Number(option);
                        const selected = exerciseRir === optionValue;
                        return (
                          <PressableScale
                            key={option}
                            containerStyle={styles.rirPillContainer}
                            style={[
                              styles.rirPill,
                              selected && styles.rirPillSelected,
                            ]}
                            hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
                            accessibilityLabel={`${option} reps in reserve`}
                            onPress={() => {
                              setExerciseRirMap((current) => ({
                                ...current,
                                [exerciseKey]: optionValue,
                              }));
                            }}
                          >
                            <Text style={[styles.rirPillLabel, selected && styles.rirPillLabelSelected]}>
                              {option}
                            </Text>
                          </PressableScale>
                        );
                      })}
                    </View>
                    <View style={styles.rirHintRow}>
                      <Text style={styles.rirHintText}>Too easy</Text>
                      <Text style={styles.rirHintText}>Max effort</Text>
                    </View>
                  </View>
                </View>
              );
            })
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
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  headerRight: {
    flexShrink: 0,
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  durationChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  durationText: {
    color: colors.textSecondary,
    ...typography.label,
    fontVariant: ["tabular-nums"],
  },
  durationTextRunning: {
    color: colors.accent,
    fontWeight: "700",
  },
  segmentName: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  segmentMeta: {
    color: colors.textSecondary,
    ...typography.small,
  },
  segmentTypeBadge: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  segmentTypeBadgeText: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  loggedBadge: {
    borderRadius: radii.pill,
    backgroundColor: "rgba(34,197,94,0.18)",
    borderWidth: 1,
    borderColor: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  loggedBadgeHidden: {
    opacity: 0,
  },
  loggedText: {
    color: colors.success,
    ...typography.small,
    fontWeight: "600",
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
  exerciseRow: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
    gap: 4,
  },
  exerciseRowComplete: {
    backgroundColor: colors.surface,
    opacity: 0.65,
  },
  exerciseNamePressable: {
    alignSelf: "flex-start",
  },
  exerciseName: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  exerciseMeta: {
    color: colors.textSecondary,
    ...typography.small,
  },
  exerciseCompleteSummary: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
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
  restRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  adaptChip: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    marginTop: 2,
  },
  adaptChipText: {
    ...typography.label,
    fontWeight: "600",
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
  inlineExerciseBlock: {
    gap: spacing.sm,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  setRowDone: {
    opacity: 0.8,
  },
  setRowActive: {
    borderColor: colors.textPrimary,
    borderWidth: 1,
  },
  setLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "700",
    minWidth: 36,
  },
  setLabelDone: {
    color: colors.textSecondary,
  },
  pbBadge: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "#F59E0B",
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: "center",
  },
  pbBadgeText: {
    color: "#F59E0B",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  weightInputGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flex: 1.35,
    height: 36,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  repsInputGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 0.85,
    height: 36,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  inputField: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    paddingVertical: 0,
    margin: 0,
    includeFontPadding: false,
  },
  inputFieldDone: {
    color: colors.textSecondary,
  },
  inputSuffixWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  inputSuffix: {
    color: colors.textSecondary,
    fontSize: typography.small.fontSize,
    fontWeight: typography.small.fontWeight,
  },
  inputSuffixDone: {
    color: colors.textSecondary,
  },
  bodyweightDash: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
    textAlign: "center",
  },
  roundActiveBlock: {
    gap: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
  },
  roundActiveLabel: {
    color: colors.textPrimary,
    ...typography.label,
    fontWeight: "700",
  },
  roundExerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  roundExerciseName: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  roundLockedRow: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  roundLockedLabel: {
    color: colors.textSecondary,
    ...typography.small,
  },
  markRoundButton: {
    alignSelf: "stretch",
    minHeight: 38,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  markRoundButtonLabel: {
    color: colors.background,
    ...typography.label,
    fontWeight: "700",
  },
  roundSaveError: {
    color: colors.warning,
    ...typography.small,
    fontWeight: "600",
  },
  postStopRirBlock: {
    gap: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
  },
  exerciseRirBlock: {
    gap: spacing.xs,
  },
  setMutationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xs,
  },
  setMutationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.xs,
  },
  setMutationButtonDisabled: {
    opacity: 0.35,
  },
  setMutationLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  setMutationLabelDisabled: {
    color: colors.textSecondary,
  },
  exerciseRirQuestion: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  rirPills: {
    flexDirection: "row",
    width: "100%",
    gap: spacing.xs,
  },
  rirPillContainer: {
    flex: 1,
  },
  rirPill: {
    width: "100%",
    minHeight: 48,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  rirPillSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  rirPillLabel: {
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    lineHeight: 20,
    fontWeight: "600",
    includeFontPadding: false,
    textAlign: "center",
    textAlignVertical: "center",
  },
  rirPillLabelSelected: {
    color: colors.textPrimary,
  },
  rirHintRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  logAllButton: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  logAllButtonLabel: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  rirHintText: {
    color: colors.textSecondary,
    ...typography.label,
  },
  checkboxButton: {
    alignSelf: "center",
  },
  restStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  restStripLabel: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  restStripCountdown: {
    color: colors.textPrimary,
    ...typography.small,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  restStripBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: colors.surface,
  },
  restStripBarFill: {
    backgroundColor: colors.accent,
  },
  restStripSkip: {
    alignSelf: "flex-start",
  },
  restStripSkipLabel: {
    color: colors.accent,
    ...typography.small,
    fontWeight: "600",
  },
  restAdjustChip: {
    alignSelf: "flex-start",
  },
  restAdjustControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  restAdjustButton: {
    minWidth: 28,
    minHeight: 28,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
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

