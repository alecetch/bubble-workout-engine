import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { RingTimer } from "../timers/RingTimer";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";

type WeekProgressRingProps = {
  weekNumber: number;
  totalWeeks: number;
  completedDaysThisWeek: number;
  totalDaysThisWeek: number;
  size?: number;
};

export function WeekProgressRing({
  weekNumber,
  totalWeeks,
  completedDaysThisWeek,
  totalDaysThisWeek,
  size = 120,
}: WeekProgressRingProps): React.JSX.Element {
  const progress = totalDaysThisWeek > 0 ? completedDaysThisWeek / totalDaysThisWeek : 0;

  return (
    <RingTimer
      size={size}
      strokeWidth={10}
      progress={progress}
      trackColor={colors.border}
      progressColor={colors.accent}
    >
      <View style={styles.centre}>
        <Text style={styles.weekLabel}>W{weekNumber}</Text>
        <Text style={styles.ofLabel}>of {totalWeeks}</Text>
      </View>
    </RingTimer>
  );
}

const styles = StyleSheet.create({
  centre: {
    alignItems: "center",
  },
  weekLabel: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  ofLabel: {
    color: colors.textSecondary,
    ...typography.label,
  },
});
