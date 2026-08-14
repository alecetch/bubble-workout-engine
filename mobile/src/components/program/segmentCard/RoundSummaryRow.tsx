import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import { colors } from "../../../theme/colors";
import { radii } from "../../../theme/components";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { PressableScale } from "../../interaction/PressableScale";

type Segment = ProgramDayFullResponse["segments"][number];
type Exercise = Segment["exercises"][number];

type RoundSummaryRowProps = {
  roundIndex: number;
  expanded: boolean;
  onToggle: (roundIndex: number) => void;
  loggableExercises: Exercise[];
  getExerciseValue: (exercise: Exercise, roundIndex: number) => string | null;
};

export function RoundSummaryRow({
  roundIndex,
  expanded,
  onToggle,
  loggableExercises,
  getExerciseValue,
}: RoundSummaryRowProps): React.JSX.Element {
  const summaryParts = loggableExercises
    .map((exercise) => {
      const value = getExerciseValue(exercise, roundIndex);
      return value ? `${exercise.name} ${value}` : null;
    })
    .filter((value): value is string => Boolean(value));

  return (
    <PressableScale
      key={roundIndex}
      style={styles.roundSummaryRow}
      onPress={() => onToggle(roundIndex)}
    >
      <Text style={styles.roundSummaryLabel}>
        {`Round ${roundIndex + 1} ✓${summaryParts.length > 0 ? `  ${summaryParts.join(" · ")}` : ""}`}
      </Text>
      {expanded ? (
        <View style={styles.roundExpandedBlock}>
          {loggableExercises.map((exercise) => (
            <Text key={exercise.id ?? exercise.name} style={styles.roundLockedLabel}>
              {`${exercise.name}: ${getExerciseValue(exercise, roundIndex) ?? "not logged"}`}
            </Text>
          ))}
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  roundSummaryRow: {
    gap: spacing.xs,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: colors.card,
    padding: spacing.sm,
  },
  roundSummaryLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "700",
  },
  roundExpandedBlock: {
    gap: spacing.xs,
  },
  roundLockedLabel: {
    color: colors.textSecondary,
    ...typography.small,
  },
});
