import React from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import { colors } from "../../../theme/colors";
import { radii } from "../../../theme/components";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import type { SetInputState } from "../sessionUxLogic";

type Segment = ProgramDayFullResponse["segments"][number];
type Exercise = Segment["exercises"][number];

type RoundExerciseColumnProps = {
  exercise: Exercise;
  roundIndex: number;
  value: SetInputState;
  onUpdateSetInput: (
    exerciseKey: string,
    setIndex: number,
    updater: (prev: SetInputState) => SetInputState,
  ) => void;
  layout: "column" | "row";
};

function isUnloadedExercise(exercise: Exercise): boolean {
  return exercise.isUnloaded === true || exercise.isLoadable === false;
}

function formatPrescription(exercise: Exercise): string | null {
  const reps = String(exercise.reps ?? "").trim();
  if (!reps) return null;
  const unit = String(exercise.repsUnit ?? "").trim();
  return unit ? `${reps} ${unit}` : reps;
}

export function RoundExerciseColumn({
  exercise,
  roundIndex,
  value,
  onUpdateSetInput,
  layout,
}: RoundExerciseColumnProps): React.JSX.Element {
  const exerciseKey = exercise.id ?? "";
  const prescription = formatPrescription(exercise);

  return (
    <View
      style={[styles.container, layout === "column" ? styles.containerColumn : styles.containerRow]}
      testID={`round-exercise-${exerciseKey}-${layout}`}
    >
      <View style={styles.exerciseHeader}>
        <Text style={styles.roundExerciseName} numberOfLines={1}>
          {exercise.name}
        </Text>
        {prescription ? (
          <Text style={styles.prescription} numberOfLines={1}>
            {prescription}
          </Text>
        ) : null}
      </View>

      <View style={styles.inputRow}>
        {isUnloadedExercise(exercise) ? (
          <View style={styles.weightInputGroup} accessibilityLabel={`No weight input for ${exercise.name}`}>
            <Text style={styles.bodyweightDash}>—</Text>
          </View>
        ) : (
          <View style={styles.weightInputGroup}>
            <TextInput
              accessibilityLabel={`Weight for ${exercise.name}`}
              value={value.weight}
              onChangeText={(rawValue) => {
                const sanitized = rawValue.replace(/[^0-9.]/g, "").replace(/^(\d*\.?\d*).*$/, "$1");
                onUpdateSetInput(exerciseKey, roundIndex, (prev) => ({ ...prev, weight: sanitized }));
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
            accessibilityLabel={`Reps for ${exercise.name}`}
            value={value.reps}
            onChangeText={(rawValue) => {
              const sanitized = rawValue.replace(/[^0-9]/g, "");
              onUpdateSetInput(exerciseKey, roundIndex, (prev) => ({ ...prev, reps: sanitized }));
            }}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
            style={styles.inputField}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  containerColumn: {
    flex: 1,
    minWidth: 0,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.sm,
  },
  containerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  exerciseHeader: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  roundExerciseName: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  prescription: {
    color: colors.textSecondary,
    ...typography.label,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
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
  inputSuffixWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  inputSuffix: {
    color: colors.textSecondary,
    fontSize: typography.small.fontSize,
    fontWeight: typography.small.fontWeight,
  },
  bodyweightDash: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.body,
    textAlign: "center",
  },
});
