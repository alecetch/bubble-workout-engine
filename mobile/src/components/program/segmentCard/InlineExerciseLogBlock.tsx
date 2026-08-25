import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TextInput, View } from "react-native";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import { colors } from "../../../theme/colors";
import { radii } from "../../../theme/components";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { PressableScale } from "../../interaction/PressableScale";
import type { SetInputState } from "../sessionUxLogic";
import { RIR_OPTIONS } from "./RirRoundPicker";

type Segment = ProgramDayFullResponse["segments"][number];
type Exercise = Segment["exercises"][number];

type InlineExerciseLogBlockProps = {
  exercise: Exercise;
  setInputs: SetInputState[];
  doneSetKeys: Set<string>;
  activeSetKey: string | null;
  pbSetKeys: Set<string>;
  exerciseRir: number | null;
  onFillDown: (
    exerciseKey: string,
    setIndex: number,
    field: "weight" | "reps",
    value: string,
    exercise: Exercise,
  ) => void;
  onSetComplete: (exercise: Exercise, setIndex: number) => void | Promise<void>;
  onAddSet: (exercise: Exercise) => void;
  onRemoveSet: (exercise: Exercise) => void;
  onLogAllSets: (exercise: Exercise) => void | Promise<void>;
  onSelectRir: (exercise: Exercise, optionValue: number) => void;
};

function isUnloadedExercise(exercise: Exercise): boolean {
  return exercise.isUnloaded === true || exercise.isLoadable === false;
}

function buildSetKey(exercise: Exercise, setIndex: number): string {
  return `${exercise.id ?? exercise.exerciseId ?? exercise.name}:${setIndex}`;
}

export function InlineExerciseLogBlock({
  exercise,
  setInputs,
  doneSetKeys,
  activeSetKey,
  pbSetKeys,
  exerciseRir,
  onFillDown,
  onSetComplete,
  onAddSet,
  onRemoveSet,
  onLogAllSets,
  onSelectRir,
}: InlineExerciseLogBlockProps): React.JSX.Element {
  const exerciseKey = exercise.id ?? "";

  return (
    <View style={styles.inlineExerciseBlock}>
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
                    onFillDown(exerciseKey, setIndex, "weight", sanitized, exercise);
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
                  onFillDown(exerciseKey, setIndex, "reps", sanitized, exercise);
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
              onPress={() => { void onSetComplete(exercise, setIndex); }}
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
          onPress={() => onRemoveSet(exercise)}
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
          onPress={() => onAddSet(exercise)}
        >
          <Ionicons name="add-circle-outline" size={16} color={colors.textPrimary} />
          <Text style={styles.setMutationLabel}>Add set</Text>
        </PressableScale>
      </View>
      <View style={styles.exerciseRirBlock}>
        <PressableScale
          style={styles.logAllButton}
          onPress={() => { void onLogAllSets(exercise); }}
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
                onPress={() => onSelectRir(exercise, optionValue)}
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
}

const styles = StyleSheet.create({
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
});
