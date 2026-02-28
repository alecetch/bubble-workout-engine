import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type WeekItem = {
  weekNumber: number;
};

export type WeekStatus = "none" | "started" | "complete";

type WeekPillStripProps = {
  weeks: WeekItem[];
  selectedWeekNumber: number;
  onSelectWeek: (weekNumber: number) => void;
  weekStatusByNumber: Record<number, WeekStatus>;
};

export function WeekPillStrip({
  weeks,
  selectedWeekNumber,
  onSelectWeek,
  weekStatusByNumber,
}: WeekPillStripProps): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Weeks</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {weeks.map((week) => {
          const selected = selectedWeekNumber === week.weekNumber;
          const weekStatus = weekStatusByNumber[week.weekNumber] ?? "none";
          return (
            <PressableScale
              key={`week-${week.weekNumber}`}
              style={[styles.pill, selected ? styles.pillSelected : styles.pillIdle]}
              onPress={() => onSelectWeek(week.weekNumber)}
            >
              <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>{`Week ${week.weekNumber}`}</Text>
              {weekStatus === "none" ? null : (
                <View
                  style={[
                    styles.dot,
                    weekStatus === "complete"
                      ? styles.dotComplete
                      : selected
                        ? styles.dotSelected
                        : styles.dotStarted,
                  ]}
                />
              )}
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textSecondary,
    ...typography.label,
  },
  row: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  pill: {
    minHeight: 42,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flexDirection: "row",
  },
  pillIdle: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillSelected: {
    borderColor: colors.accent,
    backgroundColor: "rgba(59,130,246,0.24)",
  },
  pillLabel: {
    color: colors.textSecondary,
    ...typography.body,
    fontWeight: "500",
  },
  pillLabelSelected: {
    color: colors.textPrimary,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  dotIdle: {
    backgroundColor: "rgba(148,163,184,0.65)",
  },
  dotSelected: {
    backgroundColor: colors.textPrimary,
  },
  dotStarted: {
    backgroundColor: colors.warning,
  },
  dotComplete: {
    backgroundColor: colors.success,
  },
});
