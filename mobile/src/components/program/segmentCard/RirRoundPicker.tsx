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

export const RIR_OPTIONS = ["4+", "3", "2", "1", "0"] as const;

type RirRoundPickerProps = {
  exercise: Exercise;
  selectedRir: number | null;
  onSelect: (optionValue: number) => void;
};

export function RirRoundPicker({
  exercise,
  selectedRir,
  onSelect,
}: RirRoundPickerProps): React.JSX.Element {
  const exerciseKey = exercise.id ?? "";
  return (
    <View key={exerciseKey} style={styles.roundRirExerciseBlock}>
      <Text style={styles.roundExerciseName} numberOfLines={1}>{exercise.name}</Text>
      <View style={styles.rirPills}>
        {RIR_OPTIONS.map((option) => {
          const optionValue = option === "4+" ? 4 : Number(option);
          const selected = selectedRir === optionValue;
          return (
            <PressableScale
              key={option}
              containerStyle={styles.rirPillContainer}
              style={[styles.rirPill, selected && styles.rirPillSelected]}
              hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
              accessibilityLabel={`${exercise.name} ${option} reps in reserve`}
              onPress={() => onSelect(optionValue)}
            >
              <Text style={[styles.rirPillLabel, selected && styles.rirPillLabelSelected]}>
                {option}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  roundRirExerciseBlock: {
    gap: spacing.xs,
  },
  roundExerciseName: {
    flex: 1,
    color: colors.textPrimary,
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
    minHeight: 36,
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
});
