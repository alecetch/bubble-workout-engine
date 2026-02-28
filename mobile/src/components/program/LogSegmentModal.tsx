import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ProgramDayFullResponse } from "../../api/programViewer";
import { PressableScale } from "../interaction/PressableScale";
import type { SegmentLogEntry } from "../../utils/localWorkoutLog";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Segment = ProgramDayFullResponse["segments"][number];

type LogSegmentModalProps = {
  visible: boolean;
  segment: Segment | null;
  initialLog: SegmentLogEntry | null;
  onClose: () => void;
  onSave: (payload: { rounds: number; load?: number; notes?: string }) => void;
};

export function LogSegmentModal({
  visible,
  segment,
  initialLog,
  onClose,
  onSave,
}: LogSegmentModalProps): React.JSX.Element {
  const [rounds, setRounds] = useState(1);
  const [loadInput, setLoadInput] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!visible) return;
    setRounds(initialLog?.rounds ?? 1);
    setLoadInput(initialLog?.load != null ? String(initialLog.load) : "");
    setNotes(initialLog?.notes ?? "");
  }, [initialLog?.load, initialLog?.notes, initialLog?.rounds, visible]);

  const showLoadInput = useMemo(() => {
    if (!segment) return false;
    return segment.exercises.some((exercise) => exercise.isLoadable === true);
  }, [segment]);

  const handleSave = (): void => {
    const parsedLoad = Number(loadInput);
    onSave({
      rounds: Math.max(1, rounds),
      load: showLoadInput && Number.isFinite(parsedLoad) ? parsedLoad : undefined,
      notes: notes.trim() ? notes.trim() : undefined,
    });
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Log Segment</Text>
          <Text style={styles.segmentName}>{segment?.segmentName ?? "Segment"}</Text>

          <Text style={styles.sectionLabel}>Planned</Text>
          <View style={styles.plannedList}>
            {segment?.exercises.map((exercise, index) => (
              <Text key={exercise.id ?? `planned-${index}`} style={styles.plannedItem}>{`• ${exercise.name}`}</Text>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Rounds</Text>
          <View style={styles.stepper}>
            <PressableScale style={styles.stepperButton} onPress={() => setRounds((value) => Math.max(1, value - 1))}>
              <Text style={styles.stepperButtonLabel}>-</Text>
            </PressableScale>
            <Text style={styles.stepperValue}>{rounds}</Text>
            <PressableScale style={styles.stepperButton} onPress={() => setRounds((value) => value + 1)}>
              <Text style={styles.stepperButtonLabel}>+</Text>
            </PressableScale>
          </View>

          {showLoadInput ? (
            <View style={styles.inputBlock}>
              <Text style={styles.sectionLabel}>Load / Weight (optional)</Text>
              <TextInput
                value={loadInput}
                onChangeText={setLoadInput}
                keyboardType="numeric"
                placeholder="e.g. 80"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
              />
            </View>
          ) : null}

          <View style={styles.inputBlock}>
            <Text style={styles.sectionLabel}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              placeholder="How did this segment feel?"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, styles.notesInput]}
            />
          </View>

          <View style={styles.actions}>
            <PressableScale style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </PressableScale>
            <PressableScale style={styles.primaryButton} onPress={handleSave}>
              <Text style={styles.primaryLabel}>Save</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.72)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
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
    gap: 2,
  },
  plannedItem: {
    color: colors.textPrimary,
    ...typography.small,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  stepperValue: {
    color: colors.textPrimary,
    ...typography.body,
    minWidth: 22,
    textAlign: "center",
    fontWeight: "600",
  },
  inputBlock: {
    gap: spacing.xs,
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
  notesInput: {
    minHeight: 96,
    borderRadius: radii.card,
    paddingTop: spacing.sm,
    textAlignVertical: "top",
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
});
