import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { RootTabParamList } from "../../navigation/AppTabs";
import { TodayWorkoutCard } from "../../components/today/TodayWorkoutCard";
import { WeekProgressBadge } from "../../components/today/WeekProgressBadge";
import { PressableScale } from "../../components/interaction/PressableScale";
import { useActivePrograms, useProgramOverview } from "../../api/hooks";
import { useSessionStore } from "../../state/session/sessionStore";
import { getDayStatus } from "../../utils/localWorkoutLog";
import { type ProgramDayStatus } from "../../components/program/CalendarDayPillRow";
import { computeLifecycleState, type TodayLifecycleState } from "./todayLifecycle";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

function toLocalIsoDate(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function shallowEqualRecord(
  a: Record<string, ProgramDayStatus>,
  b: Record<string, ProgramDayStatus>,
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export { computeLifecycleState } from "./todayLifecycle";

function greetingText(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning. Time to work.";
  if (hour < 17) return "Good afternoon. Let's go.";
  return "Good evening. Still time to train.";
}

export function TodayScreen(): React.JSX.Element {
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const userId = useSessionStore((state) => state.userId) ?? undefined;
  const activeProgramId = useSessionStore((state) => state.activeProgramId);
  const activeProgramsQuery = useActivePrograms();
  const resolvedProgramId = activeProgramId ?? activeProgramsQuery.data?.primary_program_id ?? null;

  const overviewQuery = useProgramOverview(resolvedProgramId ?? "", { userId });
  const calendarDays = overviewQuery.data?.calendarDays ?? [];
  const todayIso = useMemo(() => toLocalIsoDate(new Date()), []);

  const [dayStatusByProgramDayId, setDayStatusByProgramDayId] = useState<
    Record<string, ProgramDayStatus>
  >({});

  const calendarSig = useMemo(
    () =>
      calendarDays
        .map((d) => `${d.programDayId ?? ""}:${d.weekNumber ?? ""}:${d.calendarDate ?? ""}`)
        .join("|"),
    [calendarDays],
  );

  const programDayIdsSignature = useMemo(
    () =>
      Array.from(
        new Set(
          calendarDays.map((d) => d.programDayId).filter((id): id is string => Boolean(id)),
        ),
      )
        .sort()
        .join(","),
    [calendarSig],
  );

  const refreshDayStatuses = useCallback(async (): Promise<void> => {
    const programDayIds = programDayIdsSignature ? programDayIdsSignature.split(",") : [];
    if (programDayIds.length === 0) {
      setDayStatusByProgramDayId((current) => (shallowEqualRecord(current, {}) ? current : {}));
      return;
    }

    const entries = await Promise.all(
      programDayIds.map(async (id) => {
        const status = await getDayStatus(id, []);
        return [id, status] as const;
      }),
    );

    const next: Record<string, ProgramDayStatus> = {};
    entries.forEach(([id, status]) => {
      next[id] = status;
    });

    setDayStatusByProgramDayId((current) => (shallowEqualRecord(current, next) ? current : next));
  }, [programDayIdsSignature]);

  useFocusEffect(
    useCallback(() => {
      void refreshDayStatuses();
      return undefined;
    }, [refreshDayStatuses]),
  );

  useEffect(() => {
    void refreshDayStatuses();
  }, [refreshDayStatuses]);

  const lifecycleState: TodayLifecycleState = computeLifecycleState({
    resolvedProgramId,
    calendarDays,
    dayStatusByProgramDayId,
    todayIso,
  });

  const currentWeekNumber = useMemo(() => {
    const todayWeek = calendarDays.find(
      (d) => d.calendarDate === todayIso && d.weekNumber != null,
    )?.weekNumber;
    if (todayWeek) return todayWeek;
    const completedDays = calendarDays.filter(
      (d) => d.programDayId && dayStatusByProgramDayId[d.programDayId] === "complete",
    );
    if (completedDays.length > 0) {
      return Math.max(...completedDays.map((d) => d.weekNumber ?? 1));
    }
    return 1;
  }, [calendarDays, todayIso, dayStatusByProgramDayId]);

  const totalWeeks = overviewQuery.data?.weeks?.length ?? 1;

  const daysInCurrentWeek = useMemo(
    () =>
      calendarDays.filter(
        (d) => d.isTrainingDay && d.programDayId && d.weekNumber === currentWeekNumber,
      ),
    [calendarDays, currentWeekNumber],
  );

  const completedDaysThisWeek = daysInCurrentWeek.filter(
    (d) => dayStatusByProgramDayId[d.programDayId!] === "complete",
  ).length;

  const totalDaysThisWeek = daysInCurrentWeek.length;

  const todayTrainingDay = calendarDays.find(
    (d) => d.calendarDate === todayIso && d.isTrainingDay && d.programDayId,
  );
  const todayProgramDayId = todayTrainingDay?.programDayId ?? null;

  const todayPreview = useMemo(() => {
    const preview = overviewQuery.data?.selectedDayPreview;
    if (!preview || !todayProgramDayId) return undefined;
    if (preview.programDayId === todayProgramDayId) return preview;
    return undefined;
  }, [overviewQuery.data?.selectedDayPreview, todayProgramDayId]);

  const nextScheduledDay = useMemo(() => {
    return (
      calendarDays
        .filter(
          (d) =>
            d.isTrainingDay &&
            d.programDayId &&
            (d.calendarDate ?? "") > todayIso &&
            dayStatusByProgramDayId[d.programDayId] !== "complete",
        )
        .sort((a, b) => (a.calendarDate ?? "").localeCompare(b.calendarDate ?? ""))[0] ?? null
    );
  }, [calendarDays, todayIso, dayStatusByProgramDayId]);

  if (!resolvedProgramId && activeProgramsQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.subtitle}>Loading today&apos;s workout...</Text>
      </View>
    );
  }

  if (!resolvedProgramId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>No Active Program</Text>
        <Text style={styles.subtitle}>Generate a program to unlock your Today workout.</Text>
        <PressableScale
          style={styles.primaryButton}
          onPress={() => navigation.navigate("HomeTab", { screen: "ProgramReview" } as never)}
        >
          <Text style={styles.primaryLabel}>Go To Program Review</Text>
        </PressableScale>
      </View>
    );
  }

  if (overviewQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.subtitle}>Loading today&apos;s workout...</Text>
      </View>
    );
  }

  if (overviewQuery.isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Today Is Unavailable</Text>
        <Text style={styles.subtitle}>{overviewQuery.error?.message ?? "No workout day found."}</Text>
        <PressableScale
          style={styles.primaryButton}
          onPress={() =>
            navigation.navigate("ProgramsTab", {
              screen: "ProgramDashboard",
              params: { programId: resolvedProgramId },
            } as never)
          }
        >
          <Text style={styles.primaryLabel}>Open Programs</Text>
        </PressableScale>
      </View>
    );
  }

  if (lifecycleState === "today_scheduled") {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>{greetingText()}</Text>
        <WeekProgressBadge
          weekNumber={currentWeekNumber}
          totalWeeks={totalWeeks}
          completedDaysThisWeek={completedDaysThisWeek}
          totalDaysThisWeek={totalDaysThisWeek}
        />
        <TodayWorkoutCard
          label={todayPreview?.label ?? "Today's Workout"}
          type={todayPreview?.type ?? ""}
          sessionDuration={todayPreview?.sessionDuration ?? null}
          onStartWorkout={() => {
            if (!todayProgramDayId) return;
            navigation.navigate("ProgramsTab", {
              screen: "ProgramDay",
              params: { programDayId: todayProgramDayId },
            } as never);
          }}
        />
      </ScrollView>
    );
  }

  if (lifecycleState === "today_complete") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Today&apos;s workout is done.</Text>
        <Text style={styles.subtitle}>
          {nextScheduledDay
            ? `Next: ${nextScheduledDay.calendarDate ?? "next session"}`
            : "Rest and recover. See you next session."}
        </Text>
        <PressableScale
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("ProgramsTab", { screen: "ProgramHub" } as never)}
        >
          <Text style={styles.secondaryLabel}>View Full Program</Text>
        </PressableScale>
      </View>
    );
  }

  if (lifecycleState === "today_rest") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Rest day.</Text>
        <Text style={styles.subtitle}>
          {nextScheduledDay
            ? `Next training: ${nextScheduledDay.calendarDate ?? "upcoming"}`
            : "Enjoy the recovery."}
        </Text>
        <WeekProgressBadge
          weekNumber={currentWeekNumber}
          totalWeeks={totalWeeks}
          completedDaysThisWeek={completedDaysThisWeek}
          totalDaysThisWeek={totalDaysThisWeek}
        />
        <PressableScale
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("ProgramsTab", { screen: "ProgramHub" } as never)}
        >
          <Text style={styles.secondaryLabel}>View Program</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Program complete!</Text>
      <Text style={styles.subtitle}>
        You finished all scheduled sessions. Ready for the next block?
      </Text>
      <PressableScale
        style={styles.primaryButton}
        onPress={() => navigation.navigate("HomeTab", { screen: "ProgramReview" } as never)}
      >
        <Text style={styles.primaryLabel}>Generate New Program</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    ...typography.h3,
    textAlign: "center",
  },
  subtitle: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  primaryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  greeting: {
    color: colors.textSecondary,
    ...typography.body,
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  secondaryLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
});
