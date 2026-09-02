import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import { colors } from "../../../theme/colors";
import { radii } from "../../../theme/components";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { PressableScale } from "../../interaction/PressableScale";
import type { SetInputState } from "../sessionUxLogic";
import { RoundExerciseColumn } from "./RoundExerciseColumn";

type Segment = ProgramDayFullResponse["segments"][number];
type Exercise = Segment["exercises"][number];

type AmrapPairLoggingPanelProps = {
  exercises: [Exercise, Exercise];
  inputMap: Record<string, SetInputState[]>;
  doneSetKeys: Set<string>;
  activeSetKey: string | null;
  pbSetKeys: Set<string>;
  onUpdateSetInput: (
    exerciseKey: string,
    setIndex: number,
    updater: (prev: SetInputState) => SetInputState,
  ) => void;
  onSetComplete: (exercise: Exercise, setIndex: number) => void | Promise<void>;
};

function buildSetKey(exercise: Exercise, setIndex: number): string {
  return `${exercise.id ?? exercise.exerciseId ?? exercise.name}:${setIndex}`;
}

export function AmrapPairLoggingPanel({
  exercises,
  inputMap,
  doneSetKeys,
  activeSetKey,
  pbSetKeys,
  onUpdateSetInput,
  onSetComplete,
}: AmrapPairLoggingPanelProps): React.JSX.Element {
  return (
    <View style={styles.panel} testID="amrap-pair-logging-panel">
      <Text style={styles.roundLabel}>Round 1</Text>
      <View style={styles.exerciseGrid} testID="amrap-pair-exercise-grid">
        {exercises.map((exercise, index) => {
          const exerciseKey = exercise.id ?? "";
          const setKey = buildSetKey(exercise, 0);
          const isDone = doneSetKeys.has(setKey);
          const isActive = activeSetKey === setKey;
          const hasPb = pbSetKeys.has(setKey);
          const row = inputMap[exerciseKey]?.[0] ?? { weight: "", reps: "", rirActual: null };
          const label = index === 0 ? "A" : "B";

          return (
            <View
              key={exerciseKey}
              style={[styles.exerciseColumn, isDone && styles.exerciseColumnDone, isActive && styles.exerciseColumnActive]}
            >
              <View style={styles.exerciseTagRow}>
                <View style={styles.exerciseTag}>
                  <Text style={styles.exerciseTagText}>{label}</Text>
                </View>
                {hasPb ? (
                  <View style={styles.pbBadge}>
                    <Text style={styles.pbBadgeText}>PB</Text>
                  </View>
                ) : null}
              </View>
              <RoundExerciseColumn
                exercise={exercise}
                roundIndex={0}
                value={row}
                onUpdateSetInput={onUpdateSetInput}
                layout="column"
              />
              <PressableScale
                style={[styles.completeButton, isDone && styles.completeButtonDone]}
                accessibilityLabel={`${exercise.name} set 1 complete`}
                disabled={isDone}
                onPress={() => { void onSetComplete(exercise, 0); }}
              >
                <Ionicons
                  name={isDone ? "checkbox" : "checkbox-outline"}
                  size={18}
                  color={isDone ? colors.success : colors.textPrimary}
                />
                <Text style={[styles.completeButtonLabel, isDone && styles.completeButtonLabelDone]}>
                  {isDone ? "Logged" : "Log"}
                </Text>
              </PressableScale>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
  },
  roundLabel: {
    color: colors.textPrimary,
    ...typography.label,
    fontWeight: "700",
  },
  exerciseGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  exerciseColumn: {
    flex: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  exerciseColumnDone: {
    opacity: 0.82,
  },
  exerciseColumnActive: {
    opacity: 1,
  },
  exerciseTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  exerciseTag: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  exerciseTagText: {
    color: colors.textPrimary,
    ...typography.label,
    fontWeight: "700",
  },
  pbBadge: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "#F59E0B",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pbBadgeText: {
    color: "#F59E0B",
    fontSize: 10,
    fontWeight: "700",
  },
  completeButton: {
    minHeight: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  completeButtonDone: {
    borderColor: colors.success,
  },
  completeButtonLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "700",
  },
  completeButtonLabelDone: {
    color: colors.success,
  },
});
