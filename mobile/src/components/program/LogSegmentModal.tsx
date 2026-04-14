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

type InputState = { weight: string; reps: string; rirActual: number | null };

const EFFORT_OPTIONS = [
  { label: "4+", value: 4, caption: "Could do 4 or more reps" },
  { label: "3", value: 3, caption: "Could do 3 more reps" },
  { label: "2", value: 2, caption: "Could do 2 more reps" },
  { label: "1", value: 1, caption: "Could do 1 more rep" },
  { label: "0", value: 0, caption: "Could do no more reps" },
] as const;

function parseWeightPrefill(intensity: string | null | undefined): string {
  const v = parseFloat((intensity ?? "").trim());
  return Number.isFinite(v) && v > 0 ? String(v) : "";
}

function parseRepsPrefill(reps: string | null | undefined): string {
  const raw = (reps ?? "").trim();
  if (/^\d+$/.test(raw)) {
    const v = parseInt(raw, 10);
    return v >= 1 ? String(v) : "10";
  }
  // Allow whitespace around dash/en-dash, match anywhere in the string
  const rangeMatch = raw.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1], 10);
    const hi = parseInt(rangeMatch[2], 10);
    return String(Math.round((lo + hi) / 2));
  }
  return "10";
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
  const [inputMap, setInputMap] = useState<Record<string, InputState>>({});
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);

  const exercises = segment?.exercises ?? [];
  const loadableExercises = exercises.filter((ex) => ex.isLoadable === true);
  const activeExercise = loadableExercises.find((ex) => ex.id === activeExerciseId) ?? null;
  const activeEffort = activeExerciseId ? (inputMap[activeExerciseId]?.rirActual ?? null) : null;
  const activeEffortCaption = EFFORT_OPTIONS.find((option) => option.value === activeEffort)?.caption ?? null;

  // exercise.id is program_exercise.id — the DB primary key for this exercise row
  const existingLogsQuery = useSegmentExerciseLogs(
    segment?.id ?? null,
    programDayId,
    { userId },
  );

  const saveMutation = useSaveSegmentLogs();

  // Build prefill map from plan defaults, then overlay existing DB logs
  useEffect(() => {
    if (!visible || !segment) return;

    const initial: Record<string, InputState> = {};

    for (const ex of exercises) {
      if (ex.isLoadable !== true) continue;
      const key = ex.id ?? "";
      initial[key] = {
        weight: parseWeightPrefill(ex.intensity),
        reps: parseRepsPrefill(ex.reps),
        rirActual: null,
      };
    }

    const existingRows = existingLogsQuery.data ?? [];
    for (const row of existingRows) {
      const key = row.programExerciseId;
      if (!initial[key]) continue;
      if (row.weightKg != null) initial[key].weight = String(row.weightKg);
      if (row.repsCompleted != null) initial[key].reps = String(row.repsCompleted);
      if (row.rirActual != null) initial[key].rirActual = row.rirActual;
    }

    setInputMap(initial);
    setActiveExerciseId(null);
  }, [visible, segment?.id, existingLogsQuery.data]);

  const handleSave = (): void => {
    if (!segment) return;

    const rows = exercises.map((ex, index) => {
      const isLoadable = ex.isLoadable === true;
      const key = ex.id ?? "";
      const inputs = inputMap[key] ?? { weight: "", reps: "", rirActual: null };
      const wRaw = parseFloat(inputs.weight);
      const rRaw = parseInt(inputs.reps, 10);
      return {
        programExerciseId: key,
        orderIndex: index + 1,
        weightKg: isLoadable && Number.isFinite(wRaw) && wRaw > 0 ? wRaw : null,
        repsCompleted: isLoadable && Number.isInteger(rRaw) && rRaw > 0 ? rRaw : null,
        rirActual: isLoadable ? inputs.rirActual ?? null : null,
      };
    });

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

            {/* Header */}
            <Text style={styles.title}>Log Segment</Text>
            <Text style={styles.segmentName}>{segment?.segmentName ?? "Segment"}</Text>

            {/* PLANNED section */}
            <Text style={styles.sectionLabel}>PLANNED</Text>
            <View style={styles.plannedList}>
              {exercises.map((ex, index) => {
                const metaParts = [
                  ex.sets != null ? `${ex.sets} sets` : null,
                  ex.reps ? `× ${ex.reps}` : null,
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

            {/* Divider */}
            <View style={styles.divider} />

            {/* ACTUAL section — only if loadable exercises exist */}
            {loadableExercises.length > 0 ? (
              <>
                <Text style={styles.sectionLabel}>ACTUAL</Text>
                {loadableExercises.map((ex) => {
                  const key = ex.id ?? "";
                  const inputs = inputMap[key] ?? { weight: "", reps: "", rirActual: null };
                  return (
                    <View key={key} style={styles.actualRow}>
                      <Text style={styles.actualName} numberOfLines={2} ellipsizeMode="tail">
                        {ex.name}
                      </Text>
                      <View style={styles.inputsRow}>
                        <View style={styles.inputGroup}>
                          <TextInput
                            value={inputs.weight}
                            onFocus={() => setActiveExerciseId(key)}
                            onChangeText={(v) => {
                              // Digits + at most one decimal point
                              const sanitized = v
                                .replace(/[^0-9.]/g, "")
                                .replace(/^(\d*\.?\d*).*$/, "$1");
                              setInputMap((m) => ({
                                ...m,
                                [key]: { ...(m[key] ?? { reps: "", rirActual: null }), weight: sanitized },
                              }));
                            }}
                            keyboardType="decimal-pad"
                            textContentType="none"
                            autoComplete="off"
                            placeholder="kg"
                            placeholderTextColor={colors.textSecondary}
                            style={styles.input}
                            accessibilityLabel={`${ex.name} weight in kg`}
                          />
                          <Text style={styles.inputUnit}>kg</Text>
                        </View>
                        <View style={styles.inputGroup}>
                          <TextInput
                            value={inputs.reps}
                            onFocus={() => setActiveExerciseId(key)}
                            onChangeText={(v) => {
                              // Digits only
                              const sanitized = v.replace(/[^0-9]/g, "");
                              setInputMap((m) => ({
                                ...m,
                                [key]: { ...(m[key] ?? { weight: "", rirActual: null }), reps: sanitized },
                              }));
                            }}
                            keyboardType="numeric"
                            textContentType="none"
                            autoComplete="off"
                            placeholder="reps"
                            placeholderTextColor={colors.textSecondary}
                            style={styles.input}
                            accessibilityLabel={`${ex.name} reps completed`}
                          />
                          <Text style={styles.inputUnit}>reps</Text>
                        </View>
                      </View>
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
                      const disabled = !activeExerciseId;
                      return (
                        <PressableScale
                          key={option.label}
                          onPress={() => {
                            if (!activeExerciseId) return;
                            setInputMap((current) => ({
                              ...current,
                              [activeExerciseId]: {
                                ...(current[activeExerciseId] ?? { weight: "", reps: "", rirActual: null }),
                                rirActual: option.value,
                              },
                            }));
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

            {/* Actions */}
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
                  {saveMutation.isPending ? "Saving…" : "Save"}
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
