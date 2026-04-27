import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { ProgramDayFullResponse } from "../../api/programViewer";
import type { SaveSegmentLogPayload } from "../../api/segmentLog";
import { useSaveSegmentLogs, useSegmentExerciseLogs } from "../../api/hooks";
import { useTimerStore } from "../../state/timer/useTimerStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { PressableScale } from "../interaction/PressableScale";
import { SkeletonBlock } from "../feedback/SkeletonBlock";
import {
  buildInitialSetInputMap,
  getExerciseSetCount,
  type SetInputState,
} from "./sessionUxLogic";
import { getSegmentPresentation } from "./segmentCardLogic";

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
};

const BADGE_SEGMENT_TYPES = new Set(["single", "superset", "giant_set", "amrap", "emom"]);
const RIR_OPTIONS = ["4+", "3", "2", "1", "0"] as const;

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

export function SegmentCard({
  segment,
  isLogged,
  exerciseSetCounts,
  programId,
  programDayId,
  userId,
  onViewExerciseDetail,
  onAllSetsSaved,
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
  const loadableExercises = exercises.filter((exercise) => exercise.isLoadable === true && exercise.id);
  const hasLoadableExercises = loadableExercises.length > 0;
  const existingLogsQuery = useSegmentExerciseLogs(segment.id, programDayId, { userId });
  const saveLogsMutation = useSaveSegmentLogs();
  const [inlineLoggingOpen, setInlineLoggingOpen] = useState(false);
  const [inputMap, setInputMap] = useState<Record<string, SetInputState[]>>({});
  const [exerciseRirMap, setExerciseRirMap] = useState<Record<string, number | null>>({});
  const [doneSetKeys, setDoneSetKeys] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(initialDurationSeconds ?? 0);
  const [timerRunning, setTimerRunning] = useState(false);
  const restEntry = useTimerStore((state) => state.entries[segment.id] ?? null);
  const [restDisplaySeconds, setRestDisplaySeconds] = useState(0);
  const [activeSetKey, setActiveSetKey] = useState<string | null>(null);
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
    if (!inlineLoggingOpen || initialized || existingLogsQuery.isLoading) return;
    const existingRows = existingLogsQuery.data ?? [];
    setInputMap(buildInitialSetInputMap(loadableExercises, existingRows));
    setExerciseRirMap(
      existingRows.reduce<Record<string, number | null>>((acc, row) => {
        if (!row.programExerciseId) return acc;
        if (acc[row.programExerciseId] != null) return acc;
        acc[row.programExerciseId] = row.rirActual ?? null;
        return acc;
      }, {}),
    );
    setDoneSetKeys(new Set());
    setActiveSetKey(findNextUncheckedSetKey(loadableExercises, new Set()));
    setInitialized(true);
  }, [existingLogsQuery.data, existingLogsQuery.isLoading, inlineLoggingOpen, initialized, loadableExercises]);

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
      setActiveSetKey(findNextUncheckedSetKey(loadableExercises, doneSetKeys));
    }
    prevRestRunning.current = restIsRunning;
  }, [doneSetKeys, loadableExercises, restEntry?.restIsRunning]);

  const restProgress =
    restEntry != null && restEntry.restTotalSeconds > 0
      ? Math.max(0, Math.min(1, restDisplaySeconds / restEntry.restTotalSeconds))
      : 0;
  const showRestStrip = restEntry != null && (restEntry.restIsRunning || restDisplaySeconds > 0);
  const totalSetCount = useMemo(
    () => loadableExercises.reduce((sum, exercise) => sum + getExerciseSetCount(exercise), 0),
    [loadableExercises],
  );

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

  function handleSetComplete(exercise: Exercise, setIndex: number): void {
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
        weightKg: Number.isFinite(parseFloat(row.weight)) ? parseFloat(row.weight) || null : null,
        repsCompleted: Number.isFinite(parseInt(row.reps, 10)) ? parseInt(row.reps, 10) || null : null,
        rirActual: exerciseRir,
      }],
    };

    void saveLogsMutation.mutateAsync(payload);

    useTimerStore.getState().initEntry({
      segmentId: segment.id,
      segmentTotal: null,
      restTotal: exercise.restSeconds ?? 90,
    });
    useTimerStore.getState().startRest(segment.id);

    if (nextDoneSetKeys.size >= totalSetCount) {
      onAllSetsSaved(segment.id);
    }
  }

  return (
    <View style={styles.card}>
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
            <PressableScale style={styles.durationChip} onPress={handleTimerPress}>
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

                  return (
                    <View key={exercise.id ?? `${segment.id}-exercise-${index}`} style={styles.exerciseRow}>
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
                      {exercise.restSeconds != null && exercise.restSeconds > 0 ? (
                        <View style={styles.restRow}>
                          <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
                          <Text style={styles.exerciseMeta}>Rest {exercise.restSeconds} s</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              ) : (
                <Text style={styles.exerciseMeta}>No exercises available.</Text>
              )}
            </View>
          )}
        </View>
      </View>

      {inlineLoggingOpen ? (
        <View style={styles.inlinePanel}>
          <View style={styles.inlinePanelHeader}>
            <View />
            <PressableScale style={styles.closeLink} onPress={() => setInlineLoggingOpen(false)}>
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
                <Text style={styles.restStripSkipLabel}>Skip</Text>
              </PressableScale>
            </View>
          ) : null}

          {!initialized && existingLogsQuery.isLoading ? (
            <View style={styles.loadingBlock}>
              <SkeletonBlock height={160} />
            </View>
          ) : (
            loadableExercises.map((exercise) => {
              const exerciseKey = exercise.id ?? "";
              const setCount = getExerciseSetCount(exercise);
              const exerciseRir = exerciseRirMap[exerciseKey] ?? null;
              const setInputs = inputMap[exerciseKey] ?? Array.from({ length: setCount }, () => ({
                weight: "",
                reps: "",
                rirActual: null,
              }));

              return (
                <View key={exerciseKey} style={styles.inlineExerciseBlock}>
                  {Array.from({ length: setCount }, (_, setIndex) => {
                    const setInput = setInputs[setIndex] ?? { weight: "", reps: "", rirActual: null };
                    const setKey = buildSetKey(exercise, setIndex);
                    const isDone = doneSetKeys.has(setKey);
                    const isActive = activeSetKey === setKey;
                    return (
                      <View key={setKey} style={[styles.setRow, isDone && styles.setRowDone, isActive && styles.setRowActive]}>
                        <Text style={[styles.setLabel, isDone && styles.setLabelDone]}>{`Set ${setIndex + 1}`}</Text>
                        <View style={styles.weightInputGroup}>
                          <TextInput
                            value={setInput.weight}
                            onFocus={() => handleSetComplete(exercise, setIndex)}
                            onChangeText={(value) => {
                              const sanitized = value.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                              updateSetInput(exerciseKey, setIndex, (prev) => ({ ...prev, weight: sanitized }));
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
                        <View style={styles.repsInputGroup}>
                          <TextInput
                            value={setInput.reps}
                            onFocus={() => handleSetComplete(exercise, setIndex)}
                            onChangeText={(value) => {
                              const sanitized = value.replace(/[^0-9]/g, "");
                              updateSetInput(exerciseKey, setIndex, (prev) => ({ ...prev, reps: sanitized }));
                            }}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor={colors.textSecondary}
                            style={[styles.inputField, isDone && styles.inputFieldDone]}
                          />
                        </View>
                        <PressableScale
                          style={styles.checkboxButton}
                          onPress={() => handleSetComplete(exercise, setIndex)}
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
                  <View style={styles.exerciseRirBlock}>
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
                            style={[
                              styles.rirPill,
                              selected && styles.rirPillSelected,
                            ]}
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

      {!isLogged && hasLoadableExercises ? (
        <PressableScale
          style={styles.logButton}
          onPress={() => setInlineLoggingOpen(true)}
        >
          <Text style={styles.logButtonLabel}>{initialized ? "Resume" : "Start Exercise"}</Text>
        </PressableScale>
      ) : null}
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
  restRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
  exerciseRirBlock: {
    gap: spacing.xs,
  },
  exerciseRirQuestion: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  rirPills: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  rirPill: {
    flex: 1,
    minHeight: 44,
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
    ...typography.small,
    fontWeight: "600",
  },
  rirPillLabelSelected: {
    color: colors.textPrimary,
  },
  rirHintRow: {
    flexDirection: "row",
    justifyContent: "space-between",
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
