import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { ProgramDayFullResponse } from "../../../api/programViewer";
import { colors } from "../../../theme/colors";
import { radii, softBadgePalette } from "../../../theme/components";
import { spacing } from "../../../theme/spacing";
import { typography } from "../../../theme/typography";
import { PressableScale } from "../../interaction/PressableScale";

type Segment = ProgramDayFullResponse["segments"][number];
type Exercise = Segment["exercises"][number];

const CHIP_PALETTE: Record<string, { bg: string; text: string; border: string }> = {
  increase_load: softBadgePalette.success,
  increase_reps: softBadgePalette.success,
  increase_sets: softBadgePalette.success,
  reduce_rest: softBadgePalette.info,
  deload_local: softBadgePalette.warning,
};

type SegmentExerciseListItemProps = {
  exercise: Exercise;
  index: number;
  line2: string | null;
  summary: string | null;
  isComplete: boolean;
  programExerciseId: string;
  exerciseId: string;
  inlineLoggingOpen: boolean;
  hasLoggableExercises: boolean;
  isRoundBased: boolean;
  showResumeButton: boolean;
  onViewExerciseDetail: (
    exerciseId: string,
    programExerciseId: string,
    exerciseName: string,
    exercise: Exercise,
  ) => void;
  onRequestSwap?: (programExerciseId: string, exerciseName: string) => void;
  onStartExercise: () => void;
  onResumeExercise: () => void;
};

export function SegmentExerciseListItem({
  exercise,
  index,
  line2,
  summary,
  isComplete,
  programExerciseId,
  exerciseId,
  inlineLoggingOpen,
  hasLoggableExercises,
  isRoundBased,
  showResumeButton,
  onViewExerciseDetail,
  onRequestSwap,
  onStartExercise,
  onResumeExercise,
}: SegmentExerciseListItemProps): React.JSX.Element {
  return (
    <View
      style={[
        styles.exerciseRow,
        isRoundBased && styles.exerciseRowGrouped,
        isComplete && (isRoundBased ? styles.exerciseRowGroupedComplete : styles.exerciseRowComplete),
      ]}
    >
      <View style={styles.exerciseTitleRow}>
        <PressableScale
          style={styles.exerciseNamePressable}
          onPress={() => onViewExerciseDetail(exerciseId, programExerciseId, exercise.name, exercise)}
        >
          <Text style={styles.exerciseName} numberOfLines={2} ellipsizeMode="tail">
            {exercise.name}
          </Text>
        </PressableScale>
        {onRequestSwap && !isComplete ? (
          <PressableScale
            style={styles.swapButton}
            onPress={() => onRequestSwap(programExerciseId, exercise.name)}
            accessibilityLabel={`Swap ${exercise.name}`}
          >
            <Ionicons name="swap-horizontal-outline" size={16} color={colors.textSecondary} />
          </PressableScale>
        ) : null}
      </View>
      {line2 ? (
        <Text style={styles.exerciseMeta} numberOfLines={1} ellipsizeMode="tail">
          {line2}
        </Text>
      ) : null}
      {summary ? (
        <Text style={styles.exerciseCompleteSummary} numberOfLines={1} ellipsizeMode="tail">
          {summary}
        </Text>
      ) : null}
      {!isRoundBased && exercise.restSeconds != null && exercise.restSeconds > 0 ? (
        <View style={styles.restRow}>
          <Ionicons name="time-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.exerciseMeta}>Rest {exercise.restSeconds} s</Text>
        </View>
      ) : null}
      {(() => {
        const decision = exercise.adaptationDecision ?? null;
        if (!decision || decision.outcome === "hold") return null;
        const palette = CHIP_PALETTE[decision.outcome] ?? softBadgePalette.info;

        return (
          <PressableScale
            onPress={() => onViewExerciseDetail(exerciseId, programExerciseId, exercise.name, exercise)}
            style={[
              styles.adaptChip,
              { backgroundColor: palette.bg, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.adaptChipText, { color: palette.text }]}>
              {decision.displayChip}
            </Text>
          </PressableScale>
        );
      })()}
      {!inlineLoggingOpen && hasLoggableExercises && !isRoundBased ? (
        <PressableScale
          style={[
            styles.exerciseActionButton,
            isComplete && styles.exerciseActionButtonDisabled,
          ]}
          disabled={isComplete}
          onPress={onStartExercise}
        >
          <Text
            style={[
              styles.exerciseActionLabel,
              isComplete && styles.exerciseActionLabelDisabled,
            ]}
          >
            {isComplete ? "Exercise Complete" : "Start Exercise"}
          </Text>
        </PressableScale>
      ) : null}
      {!isRoundBased && showResumeButton && index === 0 ? (
        <PressableScale
          style={[styles.exerciseActionButton, styles.exerciseActionButtonResume]}
          onPress={onResumeExercise}
          accessibilityLabel="Resume exercise"
        >
          <Text style={[styles.exerciseActionLabel, styles.exerciseActionLabelResume]}>
            Resume
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  exerciseRow: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.sm,
    gap: 4,
  },
  exerciseRowComplete: {
    backgroundColor: colors.surface,
    opacity: 0.65,
  },
  exerciseRowGrouped: {
    borderWidth: 0,
    backgroundColor: "transparent",
    padding: 0,
  },
  exerciseRowGroupedComplete: {
    opacity: 0.65,
  },
  exerciseTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  exerciseNamePressable: {
    flex: 1,
    alignSelf: "flex-start",
  },
  swapButton: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
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
  exerciseCompleteSummary: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  exerciseActionButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  exerciseActionButtonDisabled: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseActionLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "700",
  },
  exerciseActionLabelDisabled: {
    color: colors.textSecondary,
  },
  exerciseActionButtonResume: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.textSecondary,
    marginTop: spacing.xs,
  },
  exerciseActionLabelResume: {
    color: colors.textSecondary,
  },
  restRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  adaptChip: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    marginTop: 2,
  },
  adaptChipText: {
    ...typography.label,
    fontWeight: "600",
  },
});
