import React, { useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { PressableScale } from "../../components/interaction/PressableScale";
import { useProgramOverview } from "../../api/hooks";
import type { RootTabParamList } from "../../navigation/AppTabs";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

function toLocalIsoDate(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function TodayScreen(): React.JSX.Element {
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const userId = useSessionStore((state) => state.userId) ?? undefined;
  const activeProgramId = useSessionStore((state) => state.activeProgramId);
  const hasNavigatedRef = useRef<string | null>(null);

  const overviewQuery = useProgramOverview(activeProgramId ?? "", { userId });
  const calendarDays = overviewQuery.data?.calendarDays ?? [];
  const todayIso = useMemo(() => toLocalIsoDate(new Date()), []);

  const targetProgramDayId = useMemo(() => {
    const todayMatch = calendarDays.find((day) => day.calendarDate === todayIso && day.programDayId)?.programDayId;
    if (todayMatch) return todayMatch;

    const firstWeekOne = calendarDays.find((day) => day.weekNumber === 1 && day.programDayId)?.programDayId;
    if (firstWeekOne) return firstWeekOne;

    return calendarDays.find((day) => day.programDayId)?.programDayId;
  }, [calendarDays, todayIso]);

  useFocusEffect(
    React.useCallback(() => {
      hasNavigatedRef.current = null;
      return undefined;
    }, []),
  );

  useEffect(() => {
    if (!activeProgramId || !targetProgramDayId) return;
    const navigationKey = `${activeProgramId}:${targetProgramDayId}`;
    if (hasNavigatedRef.current === navigationKey) return;
    hasNavigatedRef.current = navigationKey;
    navigation.navigate("ProgramsTab", {
      screen: "ProgramDay",
      params: { programDayId: targetProgramDayId },
    });
  }, [activeProgramId, navigation, targetProgramDayId]);

  if (!activeProgramId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>No Active Program</Text>
        <Text style={styles.subtitle}>Generate a program to unlock your Today workout.</Text>
        <PressableScale
          style={styles.primaryButton}
          onPress={() => navigation.navigate("HomeTab", { screen: "ProgramReview" })}
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

  if (overviewQuery.isError || !targetProgramDayId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Today Is Unavailable</Text>
        <Text style={styles.subtitle}>{overviewQuery.error?.message ?? "No workout day found."}</Text>
        <PressableScale
          style={styles.primaryButton}
          onPress={() =>
            navigation.navigate("ProgramsTab", {
              screen: "ProgramDashboard",
              params: { programId: activeProgramId },
            })
          }
        >
          <Text style={styles.primaryLabel}>Open Programs</Text>
        </PressableScale>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.accent} size="large" />
      <Text style={styles.subtitle}>Opening today&apos;s workout...</Text>
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
});
