import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export type CalendarDayPillItem = {
  id: string;
  calendarDate: string;
  programDayId?: string | null;
};

export type ProgramDayStatus = "none" | "scheduled" | "started" | "complete";

type CalendarDayPillRowProps = {
  days: CalendarDayPillItem[];
  selectedProgramDayId?: string;
  onSelectProgramDay: (programDayId?: string) => void;
  dayStatusByProgramDayId: Record<string, ProgramDayStatus>;
};

function formatCalendarLabel(calendarDate: string): string {
  const parsed = new Date(calendarDate);
  if (!Number.isFinite(parsed.getTime())) {
    return calendarDate.slice(-2);
  }
  return String(parsed.getDate());
}

export function CalendarDayPillRow({
  days,
  selectedProgramDayId,
  onSelectProgramDay,
  dayStatusByProgramDayId,
}: CalendarDayPillRowProps): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Calendar</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {days.map((day) => {
          const selected = Boolean(day.programDayId) && day.programDayId === selectedProgramDayId;
          const status: ProgramDayStatus = day.programDayId
            ? (dayStatusByProgramDayId[day.programDayId] ?? "scheduled")
            : "none";

          return (
            <View key={day.id} style={styles.item}>
              <PressableScale
                style={[styles.pill, selected ? styles.pillSelected : styles.pillIdle]}
                onPress={() => onSelectProgramDay(day.programDayId ?? undefined)}
              >
                <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>
                  {formatCalendarLabel(day.calendarDate)}
                </Text>
              </PressableScale>
              {status === "none" ? (
                <View style={styles.programDayDotPlaceholder} />
              ) : (
                <View
                  style={[
                    styles.programDayDot,
                    status === "complete"
                      ? styles.dotComplete
                      : status === "started"
                        ? styles.dotStarted
                        : styles.dotScheduled,
                  ]}
                />
              )}
            </View>
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
  item: {
    alignItems: "center",
    gap: 6,
  },
  pill: {
    minWidth: 48,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  pillIdle: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  pillLabel: {
    color: colors.textSecondary,
    ...typography.body,
    fontWeight: "600",
  },
  pillLabelSelected: {
    color: colors.textPrimary,
  },
  programDayDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  dotScheduled: {
    backgroundColor: "rgba(148,163,184,0.85)",
  },
  dotStarted: {
    backgroundColor: colors.warning,
  },
  dotComplete: {
    backgroundColor: colors.success,
  },
  programDayDotPlaceholder: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "transparent",
  },
});
