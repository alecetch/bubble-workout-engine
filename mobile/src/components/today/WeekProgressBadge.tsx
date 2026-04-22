import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type WeekProgressBadgeProps = {
  weekNumber: number;
  totalWeeks: number;
  completedDaysThisWeek: number;
  totalDaysThisWeek: number;
};

export function WeekProgressBadge({
  weekNumber,
  totalWeeks,
  completedDaysThisWeek,
  totalDaysThisWeek,
}: WeekProgressBadgeProps): React.JSX.Element {
  return (
    <View style={styles.badge}>
      <Text style={styles.week}>
        Week {weekNumber} of {totalWeeks}
      </Text>
      {totalDaysThisWeek > 0 ? (
        <Text style={styles.days}>
          {completedDaysThisWeek}/{totalDaysThisWeek} days this week
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  week: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  days: {
    color: colors.textSecondary,
    ...typography.small,
  },
});
