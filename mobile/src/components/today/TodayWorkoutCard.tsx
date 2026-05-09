import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type TodayWorkoutCardProps = {
  label: string;
  type: string;
  sessionDuration: number | null;
  onStartWorkout: () => void;
};

export function TodayWorkoutCard({
  label,
  type,
  sessionDuration,
  onStartWorkout,
}: TodayWorkoutCardProps): React.JSX.Element {
  const metaParts = [
    type || null,
    sessionDuration != null ? `${sessionDuration} min` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.card}>
      <Text style={styles.dayLabel}>{label}</Text>
      {metaParts ? <Text style={styles.meta}>{metaParts}</Text> : null}
      <PressableScale style={styles.startButton} onPress={onStartWorkout}>
        <Text style={styles.startLabel}>Start Workout</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dayLabel: {
    color: colors.textPrimary,
    ...typography.h2,
    fontWeight: "700",
  },
  meta: {
    color: colors.textSecondary,
    ...typography.body,
  },
  startButton: {
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  startLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
});
