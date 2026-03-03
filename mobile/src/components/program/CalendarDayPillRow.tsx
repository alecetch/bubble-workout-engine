import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PressableScale } from "../interaction/PressableScale";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export type CalendarDayPillItem = {
  id: string;
  calendarDate?: string;
  scheduledDate?: string;
  scheduledWeekday?: string | null;
  isTrainingDay?: boolean | null;
  programDayId?: string | null;
};

export type ProgramDayStatus = "none" | "scheduled" | "started" | "complete";

type CalendarDayPillRowProps = {
  days: CalendarDayPillItem[];
  selectedProgramDayId?: string;
  onSelectProgramDay: (programDayId?: string) => void;
  dayStatusByProgramDayId: Record<string, ProgramDayStatus>;
};

const UTC_WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const WEEKDAY_TO_PILL_LETTER: Record<string, string> = {
  mon: "M",
  tue: "T",
  wed: "W",
  thu: "T",
  fri: "F",
  sat: "S",
  sun: "S",
};

function normalizeWeekdayKey(value: string): string {
  const short = value.trim().slice(0, 3).toLowerCase();
  return short;
}

function toDayPillWeekday(value: string): string {
  const key = normalizeWeekdayKey(value);
  if (!key) return "";
  return WEEKDAY_TO_PILL_LETTER[key] ?? key.slice(0, 1).toUpperCase();
}

function formatCalendarParts(item: CalendarDayPillItem): { weekday: string; dayNum: string } {
  const scheduledDate = item.scheduledDate ?? item.calendarDate ?? "";
  let parsed: Date | null = null;
  let dayNumValue: number | null = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    dayNumValue = Number(scheduledDate.slice(8, 10));
    parsed = new Date(`${scheduledDate}T00:00:00Z`);
  } else if (scheduledDate) {
    const candidate = new Date(`${scheduledDate}T00:00:00Z`);
    if (Number.isFinite(candidate.getTime())) {
      parsed = candidate;
      dayNumValue = candidate.getUTCDate();
    }
  }

  const valid = Boolean(parsed && Number.isFinite(parsed.getTime()) && Number.isFinite(dayNumValue));

  if (!valid && __DEV__) {
    console.warn("[CalendarDayPillRow] Missing or invalid scheduledDate for day pill", item);
  }

  const weekday = item.scheduledWeekday
    ? toDayPillWeekday(item.scheduledWeekday)
    : parsed
      ? toDayPillWeekday(UTC_WEEKDAY_LABELS[parsed.getUTCDay()])
      : "-";
  const dayNum = dayNumValue != null ? String(dayNumValue) : "--";

  return { weekday, dayNum };
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
          const isRecoveryDay = !day.programDayId || day.isTrainingDay === false;
          const { weekday, dayNum } = formatCalendarParts(day);
          const status: ProgramDayStatus = day.programDayId
            ? (dayStatusByProgramDayId[day.programDayId] ?? "scheduled")
            : "none";

          return (
            <View key={day.id} style={styles.item}>
              <PressableScale
                style={[
                  styles.pill,
                  selected ? styles.pillSelected : styles.pillIdle,
                  isRecoveryDay && styles.pillMuted,
                ]}
                onPress={() => onSelectProgramDay(day.programDayId ?? undefined)}
              >
                <View style={styles.labelStack}>
                  <Text style={[styles.weekday, selected && styles.pillLabelSelected, isRecoveryDay && styles.textMuted]}>
                    {weekday}
                  </Text>
                  <Text style={[styles.dayNum, selected && styles.pillLabelSelected, isRecoveryDay && styles.textMuted]}>
                    {dayNum}
                  </Text>
                </View>
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
  labelStack: {
    alignItems: "center",
    justifyContent: "center",
  },
  pillIdle: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  pillMuted: {
    opacity: 0.6,
  },
  weekday: {
    color: colors.textSecondary,
    ...typography.label,
    textAlign: "center",
    includeFontPadding: false,
  },
  dayNum: {
    color: colors.textSecondary,
    ...typography.body,
    fontWeight: "600",
    textAlign: "center",
    includeFontPadding: false,
  },
  pillLabelSelected: {
    color: colors.textPrimary,
  },
  textMuted: {
    opacity: 0.9,
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
