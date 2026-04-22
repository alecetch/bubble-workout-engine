import React, { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ProgramDayFullResponse } from "../../api/programViewer";
import { useSegmentExerciseLogs, useSaveSegmentLogs } from "../../api/hooks";
import type { SaveSegmentLogPayload } from "../../api/segmentLog";
import { PressableScale } from "../interaction/PressableScale";
import {
  buildInitialSetInputMap,
  buildSegmentLogRows,
  type SetInputState,
} from "./sessionUxLogic";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { useTimerStore } from "../../state/timer/useTimerStore";
import { typography } from "../../theme/typography";

type Segment = ProgramDayFullResponse["segments"][number];

type LogSegmentModalProps = {
  visible: boolean;
  segment: Segment | null;
  programDayId: string;
  programId: string;
  userId?: string;
  onClose: () => void;
  onSave: (rows: SaveSegmentLogPayload["rows"]) => void;
};

const EFFORT_OPTIONS = [
  { label: "4+", value: 4, caption: "Could do 4 or more reps" },
  { label: "3", value: 3, caption: "Could do 3 more reps" },
  { label: "2", value: 2, caption: "Could do 2 more reps" },
  { label: "1", value: 1, caption: "Could do 1 more rep" },
  { label: "0", value: 0, caption: "Could do no more reps" },
] as const;

function getDefaultActiveKey(
  exercises: Segment["exercises"],
): { exerciseId: string; setIndex: number } | null {
  const firstLoadable = exercises.find((exercise) => exercise.isLoadable === true && exercise.id);
  if (!firstLoadable?.id) return null;
  return {
    exerciseId: firstLoadable.id,
    setIndex: 0,
  };
}

function formatRestTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function LogSegmentModal({
  visible,
  segment,
  programDayId,
  programId,
  userId,
  onClose,
  onSave,
}: LogSegmentModalProps): React.JSX.Element {
  const existingLogsQuery = useSegmentExerciseLogs(
    segment?.id ?? null,
    programDayId,
    { userId },
  );
  const [inputMap, setInputMap] = useState<Record<string, SetInputState[]>>({});
  const [activeKey, setActiveKey] = useState<{ exerciseId: string; setIndex: number } | null>(null);
  const initializedSegmentIdRef = useRef<string | null>(null);
  const rememberedActiveKeyBySegmentRef = useRef<
    Record<string, { exerciseId: string; setIndex: number }>
  >({});
  const [fillDownPrompted, setFillDownPrompted] = useState<Record<string, boolean>>({});
  const [autoFillDownEnabled, setAutoFillDownEnabled] = useState<Record<string, boolean>>({});
  const [pendingFillDownPrompt, setPendingFillDownPrompt] = useState<Record<string, boolean>>({});
  const focusedInputKeyRef = useRef<string | null>(null);
  const restEntry = useTimerStore(
    (state) => (segment?.id ? (state.entries[segment.id] ?? null) : null),
  );
  const [restDisplaySeconds, setRestDisplaySeconds] = useState(0);

  const exercises = segment?.exercises ?? [];
  const loadableExercises = exercises.filter((ex) => ex.isLoadable === true);
  const existingRows = existingLogsQuery.data ?? [];
  const activeExercise = loadableExercises.find((ex) => ex.id === activeKey?.exerciseId) ?? null;
  const activeEffort = activeKey
    ? (inputMap[activeKey.exerciseId]?.[activeKey.setIndex]?.rirActual ?? null)
    : null;
  const activeEffortCaption = EFFORT_OPTIONS.find((option) => option.value === activeEffort)?.caption ?? null;

  const saveMutation = useSaveSegmentLogs();
  const defaultActiveKey = getDefaultActiveKey(loadableExercises);

  useEffect(() => {
    if (!visible) {
      if (initializedSegmentIdRef.current !== null) {
        initializedSegmentIdRef.current = null;
        setInputMap({});
        setActiveKey(null);
        setFillDownPrompted({});
        setAutoFillDownEnabled({});
        setPendingFillDownPrompt({});
        focusedInputKeyRef.current = null;
      }
      return;
    }
    if (!segment) return;
    if (initializedSegmentIdRef.current === segment.id) return;
    if (existingLogsQuery.isLoading && !existingLogsQuery.data) return;
    setInputMap(buildInitialSetInputMap(exercises, existingRows));
    setActiveKey(rememberedActiveKeyBySegmentRef.current[segment.id] ?? defaultActiveKey);
    initializedSegmentIdRef.current = segment.id;
  }, [visible, segment?.id, existingLogsQuery.isLoading, existingRows, exercises, defaultActiveKey]);

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

  const showRestStrip =
    restEntry != null && (restEntry.restIsRunning || restDisplaySeconds > 0);

  const restProgress =
    restEntry != null && restEntry.restTotalSeconds > 0
      ? Math.max(0, Math.min(1, restDisplaySeconds / restEntry.restTotalSeconds))
      : 0;

  const handleSave = (): void => {
    if (!segment) return;

    const rows = buildSegmentLogRows(exercises, inputMap);
    console.log("[LogSegmentModal] save rows", JSON.stringify(rows));
    const payload: SaveSegmentLogPayload = {
      userId,
      programId,
      programDayId,
      workoutSegmentId: segment.id,
      rows,
    };

    saveMutation.mutate(payload, {
      onSuccess: () => {
        onSave(rows);
        onClose();
      },
      onError: (err) => {
        console.error("[LogSegmentModal] save failed", err);
      },
    });
  };

  const maybePromptFillDown = (exerciseId: string, setCount: number): void => {
    if (setCount <= 1 || fillDownPrompted[exerciseId]) return;
    setFillDownPrompted((current) => ({ ...current, [exerciseId]: true }));
    setPendingFillDownPrompt((current) => ({ ...current, [exerciseId]: false }));
    Alert.alert("Apply to all sets?", undefined, [
      {
        text: "No",
        style: "cancel",
      },
      {
        text: "Yes",
        onPress: () => {
          setAutoFillDownEnabled((current) => ({ ...current, [exerciseId]: true }));
          setInputMap((current) => {
            const prev = current[exerciseId] ?? [];
            if (prev.length <= 1) return current;
            const filled = prev.map((row, rowIndex) =>
              rowIndex === 0 ? row : { ...row, weight: prev[0].weight, reps: prev[0].reps },
            );
            return { ...current, [exerciseId]: filled };
          });
        },
      },
    ]);
  };

  const handleInputFocus = (
    exerciseId: string,
    setIndex: number,
    field: "weight" | "reps",
  ): void => {
    const nextFocusKey = `${exerciseId}:${setIndex}:${field}`;
    const previousFocusKey = focusedInputKeyRef.current;
    focusedInputKeyRef.current = nextFocusKey;
    setActiveKey({ exerciseId, setIndex });
    if (segment?.id) {
      rememberedActiveKeyBySegmentRef.current[segment.id] = { exerciseId, setIndex };
    }

    const pendingExerciseId = Object.keys(pendingFillDownPrompt).find(
      (key) => pendingFillDownPrompt[key],
    );
    if (pendingExerciseId && previousFocusKey && previousFocusKey !== nextFocusKey) {
      maybePromptFillDown(
        pendingExerciseId,
        (inputMap[pendingExerciseId] ?? []).length,
      );
    }
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            <Text style={styles.title}>Log Segment</Text>
            <Text style={styles.segmentName}>{segment?.segmentName ?? "Segment"}</Text>
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
                    if (segment?.id) {
                      useTimerStore.getState().stopRest(segment.id);
                    }
                    setRestDisplaySeconds(0);
                  }}
                >
                  <Text style={styles.restStripSkipLabel}>Skip</Text>
                </PressableScale>
              </View>
            ) : null}
            {existingRows.length > 0 ? (
              <View style={styles.savedBanner}>
                <Text style={styles.savedBannerTitle}>Saved workout data loaded</Text>
                <Text style={styles.savedBannerBody}>
                  Fields marked as saved came from your last logged entry, not from the prefill.
                </Text>
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>PLANNED</Text>
            <View style={styles.plannedList}>
              {exercises.map((ex, index) => {
                const metaParts = [
                  ex.sets != null ? `${ex.sets} sets` : null,
                  ex.reps ? `x ${ex.reps}` : null,
                  ex.intensity ? `• ${ex.intensity}` : null,
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <View key={ex.id ?? `planned-${index}`} style={styles.plannedRow}>
                    <Text style={styles.plannedName} numberOfLines={2} ellipsizeMode="tail">
                      {ex.name}
                    </Text>
                    {metaParts ? (
                      <Text style={styles.plannedMeta}>{metaParts}</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>

            <View style={styles.divider} />

            {loadableExercises.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>ACTUAL</Text>
                {loadableExercises.map((ex) => {
                  const key = ex.id ?? "";
                  const sets = inputMap[key] ?? [{ weight: "", reps: "", rirActual: null }];
                  return (
                    <View key={key} style={styles.actualRow}>
                      <Text style={styles.actualName} numberOfLines={2} ellipsizeMode="tail">
                        {ex.name}
                      </Text>
                      {sets.map((set, i) => (
                        <View key={i} style={styles.setRow}>
                          <View style={styles.setLabelRow}>
                            <Text style={styles.setLabel}>Set {i + 1}</Text>
                            {existingRows.some(
                              (row) => row.programExerciseId === key && (row.orderIndex ?? 0) === i + 1,
                            ) ? (
                              <View style={styles.savedSetBadge}>
                                <Text style={styles.savedSetBadgeText}>Saved</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.inputsRow}>
                            <View
                              style={[
                                styles.inputGroup,
                                activeKey?.exerciseId === key &&
                                  activeKey?.setIndex === i &&
                                  styles.inputGroupHighlighted,
                              ]}
                            >
                              <TextInput
                                value={set.weight}
                                onFocus={() => handleInputFocus(key, i, "weight")}
                                onChangeText={(v) => {
                                  const sanitized = v
                                    .replace(/[^0-9.]/g, "")
                                    .replace(/^(\d*\.?\d*).*$/, "$1");
                                  setInputMap((current) => {
                                    const prev = current[key] ?? [];
                                    const next = [...prev];
                                    next[i] = { ...(next[i] ?? { reps: "", rirActual: null }), weight: sanitized };
                                    if (i === 0 && autoFillDownEnabled[key] && next.length > 1) {
                                      for (let rowIndex = 1; rowIndex < next.length; rowIndex += 1) {
                                        next[rowIndex] = {
                                          ...(next[rowIndex] ?? { weight: "", reps: "", rirActual: null }),
                                          weight: sanitized,
                                        };
                                      }
                                    }
                                    return { ...current, [key]: next };
                                  });
                                  if (i === 0 && sanitized.trim().length > 0) {
                                    setPendingFillDownPrompt((current) => ({ ...current, [key]: true }));
                                  }
                                }}
                                keyboardType="decimal-pad"
                                textContentType="none"
                                autoComplete="off"
                                placeholder="0"
                                placeholderTextColor={colors.textSecondary}
                                style={styles.inputField}
                                accessibilityLabel={`${ex.name} set ${i + 1} weight`}
                              />
                              <Text style={styles.inputSuffix}>kg</Text>
                            </View>
                            <View
                              style={[
                                styles.inputGroup,
                                activeKey?.exerciseId === key &&
                                  activeKey?.setIndex === i &&
                                  styles.inputGroupHighlighted,
                              ]}
                            >
                              <TextInput
                                value={set.reps}
                                onFocus={() => handleInputFocus(key, i, "reps")}
                                onChangeText={(v) => {
                                  const sanitized = v.replace(/[^0-9]/g, "");
                                  setInputMap((current) => {
                                    const prev = current[key] ?? [];
                                    const next = [...prev];
                                    next[i] = { ...(next[i] ?? { weight: "", rirActual: null }), reps: sanitized };
                                    if (i === 0 && autoFillDownEnabled[key] && next.length > 1) {
                                      for (let rowIndex = 1; rowIndex < next.length; rowIndex += 1) {
                                        next[rowIndex] = {
                                          ...(next[rowIndex] ?? { weight: "", reps: "", rirActual: null }),
                                          reps: sanitized,
                                        };
                                      }
                                    }
                                    return { ...current, [key]: next };
                                  });
                                  if (i === 0 && sanitized.trim().length > 0) {
                                    setPendingFillDownPrompt((current) => ({ ...current, [key]: true }));
                                  }
                                }}
                                keyboardType="numeric"
                                textContentType="none"
                                autoComplete="off"
                                placeholder="0"
                                placeholderTextColor={colors.textSecondary}
                                style={styles.inputField}
                                accessibilityLabel={`${ex.name} set ${i + 1} reps`}
                              />
                              <Text style={styles.inputSuffix}>reps</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })}

                <View style={styles.effortCard}>
                  <View style={styles.effortHeader}>
                    <Text style={styles.effortHeaderLabel}>RIR</Text>
                    {activeExercise ? (
                      <Text style={styles.effortHeaderExercise} numberOfLines={1}>
                        {activeExercise.name}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.effortButtonRow}>
                    {EFFORT_OPTIONS.map((option) => {
                      const selected = activeEffort === option.value;
                      const effortTarget = activeKey ?? defaultActiveKey;
                      const disabled = !effortTarget;
                      return (
                        <PressableScale
                          key={option.label}
                          containerStyle={styles.effortButtonContainer}
                          onPress={() => {
                            if (!effortTarget) return;
                            setInputMap((current) => {
                              const prev = current[effortTarget.exerciseId] ?? [];
                              const next = [...prev];
                              next[effortTarget.setIndex] = {
                                ...(next[effortTarget.setIndex] ?? { weight: "", reps: "", rirActual: null }),
                                rirActual: option.value,
                              };
                              return { ...current, [effortTarget.exerciseId]: next };
                            });
                            setActiveKey(effortTarget);
                          }}
                          disabled={disabled}
                          style={[
                            styles.effortButton,
                            disabled && styles.effortButtonDisabled,
                            selected && styles.effortButtonSelected,
                          ]}
                          accessibilityLabel={option.caption}
                        >
                          <Text
                            style={[
                              styles.effortButtonLabel,
                              disabled && styles.effortButtonLabelDisabled,
                              selected && styles.effortButtonLabelSelected,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </PressableScale>
                      );
                    })}
                  </View>
                  {activeEffortCaption ? (
                    <Text style={styles.effortCaption}>{activeEffortCaption}</Text>
                  ) : (
                    <Text style={styles.effortCaptionPlaceholder}>No effort selected yet.</Text>
                  )}
                </View>
              </>
            ) : null}

            {saveMutation.isError ? (
              <Text style={styles.errorText}>Save failed. Please try again.</Text>
            ) : null}
            <View style={styles.actions}>
              <PressableScale style={styles.secondaryButton} onPress={onClose}>
                <Text style={styles.secondaryLabel}>Cancel</Text>
              </PressableScale>
              <PressableScale
                style={[styles.primaryButton, saveMutation.isPending && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={saveMutation.isPending}
              >
                <Text style={styles.primaryLabel}>
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </Text>
              </PressableScale>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.72)",
    justifyContent: "center",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  segmentName: {
    color: colors.textSecondary,
    ...typography.body,
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
    paddingVertical: spacing.xs,
    minHeight: 36,
  },
  restStripLabel: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  restStripCountdown: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "700",
    minWidth: 36,
  },
  restStripBarTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    flexDirection: "row",
    overflow: "hidden",
  },
  restStripBarFill: {
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  restStripSkip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  restStripSkipLabel: {
    color: colors.accent,
    ...typography.small,
    fontWeight: "600",
  },
  sectionLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  plannedList: {
    gap: spacing.xs,
  },
  plannedRow: {
    gap: 2,
  },
  plannedName: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  plannedMeta: {
    color: colors.textSecondary,
    ...typography.small,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  actualRow: {
    gap: spacing.xs,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  setLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexShrink: 0,
  },
  setLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  savedBanner: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: "rgba(34,197,94,0.08)",
    padding: spacing.sm,
    gap: 2,
  },
  savedBannerTitle: {
    color: colors.success,
    ...typography.label,
    fontWeight: "700",
  },
  savedBannerBody: {
    color: colors.textSecondary,
    ...typography.small,
  },
  savedSetBadge: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: "rgba(34,197,94,0.16)",
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  savedSetBadgeText: {
    color: colors.success,
    ...typography.small,
    fontWeight: "600",
  },
  actualName: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  inputsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flex: 1,
  },
  inputGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  inputGroupHighlighted: {
    borderColor: "#ffffff",
  },
  inputField: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  inputSuffix: {
    paddingRight: spacing.sm,
    color: colors.textSecondary,
    ...typography.small,
  },
  effortCard: {
    marginTop: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  effortHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  effortHeaderLabel: {
    color: colors.textSecondary,
    ...typography.label,
    textTransform: "uppercase",
  },
  effortHeaderExercise: {
    flex: 1,
    color: colors.accent,
    ...typography.small,
    fontWeight: "600",
    textAlign: "right",
  },
  effortButtonRow: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    gap: 6,
  },
  effortButton: {
    minHeight: 44,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  effortButtonContainer: {
    flex: 1,
  },
  effortButtonSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  effortButtonDisabled: {
    opacity: 0.45,
  },
  effortButtonLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  effortButtonLabelSelected: {
    color: colors.textPrimary,
  },
  effortButtonLabelDisabled: {
    color: colors.textSecondary,
  },
  effortCaption: {
    color: colors.textSecondary,
    ...typography.small,
  },
  effortCaptionPlaceholder: {
    color: colors.textSecondary,
    ...typography.small,
    opacity: 0.8,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: colors.error ?? "#ef4444",
    ...typography.small,
    textAlign: "center",
  },
});
