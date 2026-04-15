import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { CalendarDay, CalendarSession } from "../../api/activePrograms";
import { colors } from "../../theme/colors";

const PROGRAM_TYPE_COLORS: Record<string, string> = {
  strength: "#3B82F6",
  hypertrophy: "#22C55E",
  conditioning: "#F59E0B",
  hyrox: "#EF4444",
};

function dotColor(programType: string): string {
  return PROGRAM_TYPE_COLORS[programType] ?? "#6B7280";
}

function SessionDot({ session }: { session: CalendarSession }): React.JSX.Element {
  return (
    <View
      style={[styles.dot, { backgroundColor: dotColor(session.program_type) }]}
      accessibilityLabel={`${session.program_type} session`}
    />
  );
}

function CalendarDayCell({
  day,
  onPress,
}: {
  day: CalendarDay;
  onPress: (value: CalendarDay) => void;
}): React.JSX.Element {
  const [, , d] = day.scheduled_date.split("-");
  const sessionCount = day.sessions.length;

  return (
    <TouchableOpacity
      style={styles.cell}
      onPress={() => onPress(day)}
      accessibilityRole="button"
      accessibilityLabel={`${day.scheduled_date}, ${sessionCount} session${sessionCount === 1 ? "" : "s"}`}
    >
      <Text style={styles.cellDate}>{d}</Text>
      <View style={styles.dotsRow}>
        {day.sessions.slice(0, 3).map((session, index) => (
          <SessionDot key={`${session.program_id}-${index}`} session={session} />
        ))}
      </View>
      {sessionCount > 1 ? <Text style={styles.countBadge}>{sessionCount}</Text> : null}
    </TouchableOpacity>
  );
}

type CombinedCalendarProps = {
  days: CalendarDay[];
  onDayPress: (day: CalendarDay) => void;
};

export function CombinedCalendar({ days, onDayPress }: CombinedCalendarProps): React.JSX.Element {
  if (days.length === 0) {
    return <Text style={styles.empty}>No sessions scheduled in this range.</Text>;
  }

  return (
    <View style={styles.container}>
      {days.map((day) => (
        <CalendarDayCell key={day.scheduled_date} day={day} onPress={onDayPress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cell: {
    width: 52,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 8,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  cellDate: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  dotsRow: {
    flexDirection: "row",
    gap: 3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  countBadge: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: "700",
  },
  empty: {
    color: colors.textSecondary,
    textAlign: "center",
    marginVertical: 16,
  },
});
