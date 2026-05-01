import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  CalendarDayPillRow,
  type ProgramDayStatus,
} from "../../components/program/CalendarDayPillRow";
import { SkeletonBlock } from "../../components/feedback/SkeletonBlock";
import { DayPreviewCard } from "../../components/program/DayPreviewCard";
import { WeekPillStrip, type WeekStatus } from "../../components/program/WeekPillStrip";
import { PressableScale } from "../../components/interaction/PressableScale";
import { useDayPreview, useProgramEndCheck, useProgramOverview } from "../../api/hooks";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { getDayStatus } from "../../utils/localWorkoutLog";
import { radii } from "../../theme/components";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<OnboardingStackParamList, "ProgramDashboard">;

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

export function ProgramDashboardScreen({ route, navigation }: Props): React.JSX.Element {
  const programId = route.params?.programId ?? null;
  const onboardingUserId = useOnboardingStore((state) => state.userId);
  const sessionUserId = useSessionStore((state) => state.userId);
  const setActiveProgramId = useSessionStore((state) => state.setActiveProgramId);
  const userId = sessionUserId ?? onboardingUserId ?? undefined;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (programId) {
      setActiveProgramId(programId);
    }
  }, [programId, setActiveProgramId]);

  // ── UI state (user interactions only) ────────────────────────────────────
  //
  // selectedWeekNumber: null = "not yet chosen, use server default"
  //                     number = user has explicitly tapped a week
  //
  // userSelectedDayId: undefined = "not yet chosen, use server/derived default"
  //                    string = user has explicitly tapped a day pill
  //
  // These are the ONLY two pieces of mutable state that drive selection.
  // Neither appears in any query key. Selection never drives a fetch;
  // fetches never drive selection.
  const [selectedWeekNumber, setSelectedWeekNumber] = useState<number | null>(null);
  const [userSelectedDayId, setUserSelectedDayId] = useState<string | undefined>(undefined);
  const [dayStatusByProgramDayId, setDayStatusByProgramDayId] = useState<
    Record<string, ProgramDayStatus>
  >({});

  // ── Data layer ────────────────────────────────────────────────────────────
  //
  // useProgramOverview: stable key — no selection state included.
  // Fetches once on mount and only re-fetches on explicit invalidation or
  // focus (staleTime guards unnecessary network traffic).
  //
  // useDayPreview: fires only when the user has explicitly picked a day.
  // Independent cache entry keyed by [programId, programDayId].
  // Falls back to overview.selectedDayPreview while loading.
  const overviewQuery = useProgramOverview(programId ?? "", { userId });
  const endCheckQuery = useProgramEndCheck(programId);
  const overview = overviewQuery.data;
  const calendarDays = overview?.calendarDays ?? [];
  const weeks = overview?.weeks ?? [];

  const dayPreviewQuery = useDayPreview(programId ?? "", userSelectedDayId, { userId });

  // ── Stable string signatures (collapse array-identity churn) ─────────────
  const calendarSig = useMemo(
    () =>
      calendarDays
        .map((d) => `${d.programDayId ?? ""}:${d.weekNumber ?? ""}:${d.calendarDate ?? ""}`)
        .join("|"),
    [calendarDays],
  );

  const weeksSig = useMemo(
    () =>
      weeks
        .map((w) => w.weekNumber)
        .sort((a, b) => a - b)
        .join(","),
    [weeks],
  );

  // ── Derived structure — all synchronous useMemo, zero effects ─────────────
  const weekNumbers = useMemo(() => {
    if (weeksSig) return weeksSig.split(",").map(Number);
    const fromDays = calendarDays
      .map((d) => d.weekNumber)
      .filter((n): n is number => typeof n === "number");
    if (fromDays.length > 0) return Array.from(new Set(fromDays)).sort((a, b) => a - b);
    return [1];
  }, [calendarSig, weeksSig]);

  // The week the server considers most relevant (from its default selected day).
  const serverDefaultWeekNumber = useMemo(() => {
    const serverDayId = overview?.selectedDayPreview?.programDayId;
    if (!serverDayId) return null;
    const match = calendarDays.find((d) => d.programDayId === serverDayId);
    return typeof match?.weekNumber === "number" ? match.weekNumber : null;
  }, [overview?.selectedDayPreview?.programDayId, calendarSig]);

  // Effective week shown in the pill strip:
  //   1. User's explicit pick (if it exists in the loaded data)
  //   2. Server's recommended default (from overview.selectedDayPreview)
  //   3. First available week
  // Pure computation — no setState, no effects.
  const effectiveWeekNumber = useMemo(() => {
    if (selectedWeekNumber !== null && weekNumbers.includes(selectedWeekNumber)) {
      return selectedWeekNumber;
    }
    if (serverDefaultWeekNumber !== null && weekNumbers.includes(serverDefaultWeekNumber)) {
      return serverDefaultWeekNumber;
    }
    return weekNumbers[0] ?? 1;
  }, [selectedWeekNumber, weekNumbers, serverDefaultWeekNumber]);

  const daysInSelectedWeek = useMemo(
    () => calendarDays.filter((d) => d.weekNumber === effectiveWeekNumber),
    [calendarSig, effectiveWeekNumber],
  );

  // The highlighted day pill:
  //   1. User's explicit pick (if it's still in the current week)
  //   2. Server's recommended default (if it's in the current week)
  //   3. First training day of the current week
  // Pure computation — never written via setState, never in a query key.
  const selectedProgramDayId = useMemo(() => {
    if (userSelectedDayId) {
      const inWeek = daysInSelectedWeek.some((d) => d.programDayId === userSelectedDayId);
      if (inWeek) return userSelectedDayId;
    }
    const serverDefault = overview?.selectedDayPreview?.programDayId;
    if (serverDefault && daysInSelectedWeek.some((d) => d.programDayId === serverDefault && !d.isSkipped)) {
      return serverDefault;
    }
    return daysInSelectedWeek.find((d) => d.programDayId && !d.isSkipped)?.programDayId ?? undefined;
  }, [userSelectedDayId, daysInSelectedWeek, overview?.selectedDayPreview?.programDayId]);

  // Resolved preview: use the per-day fetch result when the user has explicitly
  // picked a day; fall back to the overview's server-computed default while the
  // per-day fetch is in flight or before the user has tapped anything.
  const activePreview = userSelectedDayId
    ? (dayPreviewQuery.data ?? overview?.selectedDayPreview)
    : overview?.selectedDayPreview;
  const selectedCalendarDay = useMemo(
    () => calendarDays.find((day) => day.programDayId === selectedProgramDayId),
    [calendarSig, selectedProgramDayId],
  );

  // ── Day status (local workout log) ────────────────────────────────────────
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

  // ── Week status badges ────────────────────────────────────────────────────
  const weekStatusByNumber = useMemo<Record<number, WeekStatus>>(() => {
    const map: Record<number, WeekStatus> = {};
    weekNumbers.forEach((weekNumber) => {
      const daysInWeek = calendarDays.filter((d) => {
        if (!d.programDayId || d.isSkipped) return false;
        if (typeof d.weekNumber !== "number") return weekNumber === 1;
        return d.weekNumber === weekNumber;
      });
      if (daysInWeek.length === 0) {
        map[weekNumber] = "none";
        return;
      }
      const statuses = daysInWeek.map(
        (d) => d.isSkipped ? "skipped" : (dayStatusByProgramDayId[d.programDayId as string] ?? "scheduled"),
      );
      const requiredStatuses = statuses.filter((status) => status !== "skipped");
      if (requiredStatuses.length === 0) {
        map[weekNumber] = "complete";
        return;
      }
      if (requiredStatuses.every((s) => s === "complete")) {
        map[weekNumber] = "complete";
        return;
      }
      map[weekNumber] = requiredStatuses.some((s) => s === "started" || s === "complete")
        ? "started"
        : "none";
    });
    return map;
  }, [calendarSig, dayStatusByProgramDayId, weekNumbers]);

  // ── Interaction handlers ──────────────────────────────────────────────────
  const onSelectWeek = useCallback((nextWeekNumber: number) => {
    setSelectedWeekNumber(nextWeekNumber);
    // Clear the explicit day pick so derived logic can find the right default
    // for the new week (server default if in week, otherwise first day).
    setUserSelectedDayId(undefined);
  }, []);

  const onSelectProgramDay = useCallback((nextProgramDayId?: string) => {
    setUserSelectedDayId(nextProgramDayId);
  }, []);

  const openRecalibrate = useCallback(() => {
    const parent = navigation.getParent() as any;
    if (parent) {
      parent.navigate("HomeTab", { screen: "RecalibrateA" });
      return;
    }
    navigation.navigate("RecalibrateA");
  }, [navigation]);

  const today = new Date().toISOString().slice(0, 10);
  const missedSessionCount = useMemo(() => {
    return calendarDays.filter((day) => {
      if (!day.isTrainingDay || !day.programDayId) return false;
      if (day.isSkipped) return false;
      const scheduled = day.scheduledDate ?? day.calendarDate ?? "";
      if (!scheduled || scheduled >= today) return false;
      const status = (day.status ?? "").toLowerCase();
      return status !== "complete" && status !== "completed";
    }).length;
  }, [calendarSig, calendarDays, today]);

  const refreshOverview = useCallback(() => {
    void overviewQuery.refetch();
    void endCheckQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ["programOverview"] });
    void queryClient.invalidateQueries({ queryKey: ["programEndCheck"] });
  }, [endCheckQuery, overviewQuery, queryClient]);

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!programId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Missing program</Text>
        <Text style={styles.errorText}>No program id was provided for this dashboard view.</Text>
      </View>
    );
  }

  if (overviewQuery.isLoading) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <SkeletonBlock height={184} style={styles.skeletonBlockLarge} />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock key={i} width={76} height={34} style={styles.skeletonPill} />
            ))}
          </View>
          <SkeletonBlock height={132} style={styles.skeletonBlockMedium} />
          <View style={{ flexDirection: "row", gap: spacing.xs }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonBlock key={i} width={28} height={28} borderRadius={14} style={styles.skeletonDot} />
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  if (overviewQuery.isError || !overview) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Unable to load dashboard</Text>
        <Text style={styles.errorText}>{overviewQuery.error?.message ?? "Please try again."}</Text>
        <PressableScale style={styles.retryButton} onPress={() => void overviewQuery.refetch()}>
          <Text style={styles.retryLabel}>Retry</Text>
        </PressableScale>
      </View>
    );
  }

  const weekItems = weekNumbers.map((weekNumber) => ({ weekNumber }));
  const endCheck = endCheckQuery.data;
  const showCompletionBanner = endCheck?.lifecycleStatus === "completed";
  const showEndCheckBanner = endCheck?.canCompleteWithSkips === true;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>{overview.program.title ?? "Training Program"}</Text>
        {overview.program.summary ? (
          <Text style={styles.heroSummary}>{overview.program.summary}</Text>
        ) : null}
      </View>

      {showCompletionBanner ? (
        <PressableScale
          style={styles.completionBanner}
          onPress={() => navigation.navigate("ProgramComplete", { programId })}
        >
          <Text style={styles.completionBannerTitle}>Program complete</Text>
          <Text style={styles.completionBannerCopy}>View your summary and start the next block.</Text>
        </PressableScale>
      ) : null}

      {showEndCheckBanner ? (
        <PressableScale
          style={styles.completionBanner}
          onPress={() => navigation.navigate("ProgramEndCheck", { programId })}
        >
          <Text style={styles.completionBannerTitle}>End of block reached</Text>
          <Text style={styles.completionBannerCopy}>
            {endCheck?.missedWorkoutsCount ?? 0} missed workout{(endCheck?.missedWorkoutsCount ?? 0) === 1 ? "" : "s"}
            {(endCheck?.skippedWorkoutsCount ?? 0) > 0
              ? `, ${endCheck?.skippedWorkoutsCount ?? 0} skipped`
              : ""}{" "}
            remain. Finish them or move on.
          </Text>
        </PressableScale>
      ) : null}

      {missedSessionCount >= 3 && !showCompletionBanner ? (
        <PressableScale
          style={styles.missedBanner}
          onPress={openRecalibrate}
        >
          <Text style={styles.missedBannerTitle}>{missedSessionCount} sessions missed</Text>
          <Text style={styles.missedBannerCopy}>
            Life happens. Recalibrate your program to get back on track.
          </Text>
        </PressableScale>
      ) : null}

      <WeekPillStrip
        weeks={weekItems}
        selectedWeekNumber={effectiveWeekNumber}
        onSelectWeek={onSelectWeek}
        weekStatusByNumber={weekStatusByNumber}
      />

      <CalendarDayPillRow
        days={daysInSelectedWeek.map((day, index) => ({
          id: day.id ?? `${day.calendarDate}-${index}`,
          calendarDate: day.calendarDate,
          scheduledDate: day.scheduledDate ?? day.calendarDate,
          isTrainingDay: day.isTrainingDay,
          programDayId: day.programDayId ?? undefined,
          isSkipped: day.isSkipped ?? false,
        }))}
        selectedProgramDayId={selectedProgramDayId}
        onSelectProgramDay={onSelectProgramDay}
        dayStatusByProgramDayId={dayStatusByProgramDayId}
      />

      <DayPreviewCard
        programId={programId}
        preview={{
          programDayId: selectedProgramDayId,
          label: activePreview?.label,
          type: activePreview?.type,
          sessionDuration: activePreview?.sessionDuration,
          equipmentSlugs: activePreview?.equipmentSlugs,
          isCompleted: ["complete", "completed"].includes(String(selectedCalendarDay?.status ?? "").toLowerCase()),
        }}
        onStartWorkout={() => {
          if (!selectedProgramDayId) return;
          navigation.navigate("ProgramDay", { programDayId: selectedProgramDayId });
        }}
        onSessionSkipped={refreshOverview}
        onSessionRescheduled={refreshOverview}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  errorTitle: {
    color: colors.textPrimary,
    ...typography.h3,
    textAlign: "center",
  },
  errorText: {
    color: colors.textSecondary,
    ...typography.body,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 46,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  retryLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "600",
  },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  heroSummary: {
    color: colors.textSecondary,
    ...typography.body,
  },
  skeletonBlockLarge: {
    height: 164,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  skeletonBlockMedium: {
    height: 120,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  skeletonPill: {
    width: 64,
    height: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  skeletonDot: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  completionBanner: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.md,
    gap: spacing.xs,
  },
  completionBannerTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  completionBannerCopy: {
    color: colors.textSecondary,
    ...typography.body,
  },
  missedBanner: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.md,
    gap: spacing.xs,
  },
  missedBannerTitle: {
    color: colors.textPrimary,
    ...typography.h3,
  },
  missedBannerCopy: {
    color: colors.textSecondary,
    ...typography.body,
  },
});
