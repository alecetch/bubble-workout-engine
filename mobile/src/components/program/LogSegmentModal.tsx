import React, { useEffect, useState } from "react";
import {
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
import { typography } from "../../theme/typography";

type Segment = ProgramDayFullResponse["segments"][number];

type LogSegmentModalProps = {
  visible: boolean;
  segment: Segment | null;
  programDayId: string;
  programId: string;
  userId?: string;
  onClose: () => void;
  onSave: () => void;
};

const EFFORT_OPTIONS = [
  { label: "4+", value: 4, caption: "Could do 4 or more reps" },
  { label: "3", value: 3, caption: "Could do 3 more reps" },
  { label: "2", value: 2, caption: "Could do 2 more reps" },
  { label: "1", value: 1, caption: "Could do 1 more rep" },
  { label: "0", value: 0, caption: "Could do no more reps" },
] as const;

export function LogSegmentModal({
  visible,
  segment,
  programDayId,
  programId,
  userId,
  onClose,
  onSave,
}: LogSegmentModalProps): React.JSX.Element {
  const [inputMap, setInputMap] = useState<Record<string, SetInputState[]>>({});
  const [activeKey, setActiveKey] = useState<{ exerciseId: string; setIndex: number } | null>(null);

  const exercises = segment?.exercises ?? [];
  const loadableExercises = exercises.filter((ex) => ex.isLoadable === true);
  const activeExercise = loadableExercises.find((ex) => ex.id === activeKey?.exerciseId) ?? null;
  const activeEffort = activeKey
    ? (inputMap[activeKey.exerciseId]?.[activeKey.setIndex]?.rirActual ?? null)
    : null;
  const activeEffortCaption = EFFORT_OPTIONS.find((option) => option.value === activeEffort)?.caption ?? null;

  const existingLogsQuery = useSegmentExerciseLogs(
    segment?.id ?? null,
    programDayId,
    { userId },
  );
  const saveMutation = useSaveSegmentLogs();

  useEffect(() => {
    if (!visible || !segment) return;
    setInputMap(buildInitialSetInputMap(exercises, existingLogsQuery.data ?? []));
    setActiveKey(null);
  }, [visible, segment?.id, existingLogsQuery.data, exercises]);

  const handleSave = (): void => {
    if (!segment) return;

    const rows = buildSegmentLogRows(exercises, inputMap);
    const payload: SaveSegmentLogPayload = {
      userId,
      programId,
      programDayId,
      workoutSegmentId: segment.id,
      rows,
    };

    saveMutation.mutate(payload, {
      onSuccess: () => {
        onSave();
        onClose();
      },
      onError: (err) => {
        console.error("[LogSegmentModal] save failed", err);
      },
    });
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
                          <Text style={styles.setLabel}>Set {i + 1}</Text>
                          <View style={styles.inputsRow}>
                            <View style={styles.inputGroup}>
                              <TextInput
                                value={set.weight}
                                onFocus={() => setActiveKey({ exerciseId: key, setIndex: i })}
                                onChangeText={(v) => {
                                  const sanitized = v
                                    .replace(/[^0-9.]/g, "")
                                    .replace(/^(\d*\.?\d*).*$/, "$1");
                                  setInputMap((current) => {
                                    const prev = current[key] ?? [];
                                    const next = [...prev];
                                    next[i] = { ...(next[i] ?? { reps: "", rirActual: null }), weight: sanitized };
                                    return { ...current, [key]: next };
                                  });
                                }}
                                keyboardType="decimal-pad"
                                textContentType="none"
                                autoComplete="off"
                                placeholder="kg"
                                placeholderTextColor={colors.textSecondary}
                                style={styles.input}
                                accessibilityLabel={`${ex.name} set ${i + 1} weight in kg`}
                              />
                              <Text style={styles.inputUnit}>kg</Text>
                            </View>
                            <View style={styles.inputGroup}>
                              <TextInput
                                value={set.reps}
                                onFocus={() => setActiveKey({ exerciseId: key, setIndex: i })}
                                onChangeText={(v) => {
                                  const sanitized = v.replace(/[^0-9]/g, "");
                                  setInputMap((current) => {
                                    const prev = current[key] ?? [];
                                    const next = [...prev];
                                    next[i] = { ...(next[i] ?? { weight: "", rirActual: null }), reps: sanitized };
                                    return { ...current, [key]: next };
                                  });
                                }}
                                keyboardType="numeric"
                                textContentType="none"
                                autoComplete="off"
                                placeholder="reps"
                                placeholderTextColor={colors.textSecondary}
                                style={styles.input}
                                accessibilityLabel={`${ex.name} set ${i + 1} reps completed`}
                              />
                              <Text style={styles.inputUnit}>reps</Text>
                            </View>
                          </View>
                          {i === 0 && sets.length > 1 ? (
                            <PressableScale
                              style={styles.fillDownButton}
                              onPress={() => {
                                setInputMap((current) => {
                                  const prev = current[key] ?? [];
                                  const filled = prev.map((row, rowIndex) =>
                                    rowIndex === 0 ? row : { ...row, weight: prev[0].weight, reps: prev[0].reps },
                                  );
                                  return { ...current, [key]: filled };
                                });
                              }}
                            >
                              <Text style={styles.fillDownLabel}>Fill down</Text>
                            </PressableScale>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  );
                })}

                <View style={styles.effortCard}>
                  <Text style={styles.effortTitle}>Rate Your Last Set</Text>
                  <Text style={styles.effortPrompt}>How many more reps could you do?</Text>
                  {activeExercise ? (
                    <Text style={styles.effortActiveExercise} numberOfLines={1}>
                      Applying to {activeExercise.name}
                    </Text>
                  ) : (
                    <Text style={styles.effortHint}>Enter your set first to rate effort.</Text>
                  )}
                  <View style={styles.effortButtonRow}>
                    {EFFORT_OPTIONS.map((option) => {
                      const selected = activeEffort === option.value;
                      const disabled = !activeKey;
                      return (
                        <PressableScale
                          key={option.label}
                          onPress={() => {
                            if (!activeKey) return;
                            setInputMap((current) => {
                              const prev = current[activeKey.exerciseId] ?? [];
                              const next = [...prev];
                              next[activeKey.setIndex] = {
                                ...(next[activeKey.setIndex] ?? { weight: "", reps: "", rirActual: null }),
                                rirActual: option.value,
                              };
                              return { ...current, [activeKey.exerciseId]: next };
                            });
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
    gap: spacing.xs,
  },
  setLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
  actualName: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  inputsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  inputGroup: {
    flex: 1,
    gap: 2,
  },
  input: {
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  inputUnit: {
    color: colors.textSecondary,
    ...typography.label,
  },
  fillDownButton: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  fillDownLabel: {
    color: colors.accent,
    ...typography.small,
    fontWeight: "600",
  },
  effortCard: {
    marginTop: spacing.sm,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  effortTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  effortPrompt: {
    color: colors.textPrimary,
    ...typography.body,
  },
  effortHint: {
    color: colors.textSecondary,
    ...typography.small,
  },
  effortActiveExercise: {
    color: colors.accent,
    ...typography.small,
    fontWeight: "600",
  },
  effortButtonRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  effortButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
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
