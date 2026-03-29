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

type InputState = { weight: string; reps: string };

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

  const exercises = segment?.exercises ?? [];
  const loadableExercises = exercises.filter((ex) => ex.isLoadable === true);

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
      };
    }

    const existingRows = existingLogsQuery.data ?? [];
    for (const row of existingRows) {
      const key = row.programExerciseId;
      if (!initial[key]) continue;
      if (row.weightKg != null) initial[key].weight = String(row.weightKg);
      if (row.repsCompleted != null) initial[key].reps = String(row.repsCompleted);
    }

    setInputMap(initial);
  }, [visible, segment?.id, existingLogsQuery.data]);

  const handleSave = (): void => {
    if (!segment) return;

    const rows = exercises.map((ex, index) => {
      const isLoadable = ex.isLoadable === true;
      const key = ex.id ?? "";
      const inputs = inputMap[key] ?? { weight: "", reps: "" };
      const wRaw = parseFloat(inputs.weight);
      const rRaw = parseInt(inputs.reps, 10);
      return {
        programExerciseId: key,
        orderIndex: index + 1,
        weightKg: isLoadable && Number.isFinite(wRaw) && wRaw > 0 ? wRaw : null,
        repsCompleted: isLoadable && Number.isInteger(rRaw) && rRaw > 0 ? rRaw : null,
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
                  const inputs = inputMap[key] ?? { weight: "", reps: "" };
                  return (
                    <View key={key} style={styles.actualRow}>
                      <Text style={styles.actualName} numberOfLines={2} ellipsizeMode="tail">
                        {ex.name}
                      </Text>
                      <View style={styles.inputsRow}>
                        <View style={styles.inputGroup}>
                          <TextInput
                            value={inputs.weight}
                            onChangeText={(v) => {
                              // Digits + at most one decimal point
                              const sanitized = v
                                .replace(/[^0-9.]/g, "")
                                .replace(/^(\d*\.?\d*).*$/, "$1");
                              setInputMap((m) => ({
                                ...m,
                                [key]: { ...(m[key] ?? { reps: "" }), weight: sanitized },
                              }));
                            }}
                            keyboardType="decimal-pad"
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
                            onChangeText={(v) => {
                              // Digits only
                              const sanitized = v.replace(/[^0-9]/g, "");
                              setInputMap((m) => ({
                                ...m,
                                [key]: { ...(m[key] ?? { weight: "" }), reps: sanitized },
                              }));
                            }}
                            keyboardType="numeric"
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
