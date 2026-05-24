import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { queryKeys, useCompleteProgram, useEntitlement, useMarkDayComplete, useProgramDayFull } from "../../api/hooks";
import { getProgramEndCheck } from "../../api/programCompletion";
import { getSegmentExerciseLogs, type SaveSegmentLogPayload } from "../../api/segmentLog";
import { getPrsFeed } from "../../api/history";
import { getProgramOverview, type ProgramDayFullResponse, type ProgramOverviewResponse } from "../../api/programViewer";
import { SkeletonBlock } from "../../components/feedback/SkeletonBlock";
import { PressableScale } from "../../components/interaction/PressableScale";
import { EquipmentOverrideSheet } from "../../components/program/EquipmentOverrideSheet";
import { ExerciseSwapSheet } from "../../components/program/ExerciseSwapSheet";
import { SegmentCard } from "../../components/program/SegmentCard";
import { SessionSummaryModal } from "../../components/program/SessionSummaryModal";
import { computeSessionStatsFromLoggedRows } from "../../components/program/sessionUxLogic";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import type { ProgramsStackParamList } from "../../navigation/ProgramsStackNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import {
  getSegmentLog,
  allExercisesComplete,
  getWorkoutComplete,
  setSegmentLog,
  setWorkoutComplete,
  type SegmentLogEntry,
} from "../../utils/localWorkoutLog";
import { useSettingsStore } from "../../state/settings/useSettingsStore";
import { hasRequestedStoreReview } from "../../utils/storeReview";

type Props = NativeStackScreenProps<OnboardingStackParamList, "ProgramDay">;
type Segment = ProgramDayFullResponse["segments"][number];
type WeekShareData = {
  weekNumber: number;
  sessionsCompleted: number;
  totalVolumeKg: number;
};

function getCompletedWeekShareData(
  overview: Pick<ProgramOverviewResponse, "calendarDays">,
  weekNumber: number | null,
  completedProgramDayId: string,
  totalVolumeKg: number,
): WeekShareData | null {
  if (weekNumber == null) return null;
  const thisWeekTrainingDays = overview.calendarDays.filter(
    (calendarDay) =>
      calendarDay.isTrainingDay &&
      Boolean(calendarDay.programDayId) &&
      calendarDay.weekNumber === weekNumber,
  );
  const thisWeekAllDone =
    thisWeekTrainingDays.length > 0 &&
    thisWeekTrainingDays.every(
      (calendarDay) =>
        calendarDay.status === "complete" ||
        calendarDay.programDayId === completedProgramDayId,
    );

  if (!thisWeekAllDone) return null;
  return {
    weekNumber,
    sessionsCompleted: thisWeekTrainingDays.length,
    totalVolumeKg,
  };
}

const WEEKDAY_LABELS: Record<string, string> = {
  Mon: "Mondays",
  Tue: "Tuesdays",
  Wed: "Wednesdays",
  Thu: "Thursdays",
  Fri: "Fridays",
  Sat: "Saturdays",
  Sun: "Sundays",
};

function toWeekdayPlural(raw: string | null | undefined): string {
  if (!raw) return "";
  return WEEKDAY_LABELS[raw] ?? `${raw}s`;
}

export function ProgramDayScreen({ route, navigation }: Props): React.JSX.Element {
  const { programDayId } = route.params;
  const onboardingUserId = useOnboardingStore((state) => state.userId);
  const sessionUserId = useSessionStore((state) => state.userId);
  const userId = sessionUserId ?? onboardingUserId ?? undefined;
  const activeProgramId = useSessionStore((state) => state.activeProgramId);

  const dayQuery = useProgramDayFull(programDayId, { userId });
  const entitlementQuery = useEntitlement();
  const markDayComplete = useMarkDayComplete();
  const completeProgram = useCompleteProgram();
  const queryClient = useQueryClient();
  const [segmentLogs, setSegmentLogs] = useState<Record<string, SegmentLogEntry>>({});
  const [segmentLogRows, setSegmentLogRows] = useState<Record<string, SaveSegmentLogPayload["rows"]>>({});
  const [workoutComplete, setWorkoutCompleteState] = useState(false);
  const [allExerciseCardsComplete, setAllExerciseCardsComplete] = useState(false);
  const [confirmationText, setConfirmationText] = useState<string | null>(null);
  const [swapSheetVisible, setSwapSheetVisible] = useState(false);
  const [swapTargetProgramExerciseId, setSwapTargetProgramExerciseId] = useState<string | null>(null);
  const [swapTargetExerciseName, setSwapTargetExerciseName] = useState<string | null>(null);
  const [equipmentSheetVisible, setEquipmentSheetVisible] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [prHits, setPrHits] = useState<string[]>([]);
  const [prE1rmKg, setPrE1rmKg] = useState<number | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetY = useRef(0);
  const dayLabel = dayQuery.data?.day?.label?.trim() || "Workout";
  const programId = dayQuery.data?.day?.programId ?? activeProgramId ?? "";
  const nav = navigation as unknown as NativeStackNavigationProp<ProgramsStackParamList>;
  const hydrateSettings = useSettingsStore((state) => state.hydrate);

  useEffect(() => {
    void hydrateSettings();
  }, [hydrateSettings]);

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ["entitlement"] });
    }, [queryClient]),
  );

  useEffect(() => {
    if (entitlementQuery.isSuccess && !entitlementQuery.data.is_active) {
      const parent = navigation.getParent();
      parent?.navigate("HomeTab", { screen: "Paywall" } as never);
    }
  }, [entitlementQuery.data?.is_active, entitlementQuery.isSuccess, navigation]);

  const handlePrsDetected = useCallback(
    (prs: Array<{ exerciseName: string; estimated1rmKg: number }>) => {
      if (prs.length === 0) return;
      setPrHits((current) => {
        const merged = new Set(current);
        for (const pr of prs) {
          if (pr.exerciseName) merged.add(pr.exerciseName);
        }
        return Array.from(merged);
      });
      setPrE1rmKg((current) => {
        const nextMax = prs.reduce((max, pr) => Math.max(max, pr.estimated1rmKg ?? 0), 0);
        if (nextMax <= 0) return current;
        return current == null ? nextMax : Math.max(current, nextMax);
      });
    },
    [],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: dayLabel,
      headerLeft: () => (
        <PressableScale
          style={styles.headerBackButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        >
          <Text style={styles.headerBackLabel}>Back</Text>
        </PressableScale>
      ),
    });
  }, [dayLabel, navigation]);

  const orderedSegments = useMemo(() => {
    const segments = dayQuery.data?.segments ?? [];
    return [...segments].sort((a, b) => a.orderInDay - b.orderInDay);
  }, [dayQuery.data?.segments]);

  const allExerciseIds = useMemo(
    () => orderedSegments.flatMap((segment) => segment.exercises.map((exercise) => exercise.id).filter((id): id is string => Boolean(id))),
    [orderedSegments],
  );

  const refreshExerciseCompletion = useCallback(() => {
    void allExercisesComplete(programDayId, allExerciseIds).then(setAllExerciseCardsComplete);
  }, [allExerciseIds, programDayId]);

  useEffect(() => {
    let cancelled = false;

    async function loadLocalState(): Promise<void> {
      const completion = await getWorkoutComplete(programDayId);
      const entries = await Promise.all(
        orderedSegments.map(async (segment) => ({
          segmentId: segment.id,
          log: await getSegmentLog(programDayId, segment.id),
        })),
      );

      if (cancelled) return;

      const logsMap: Record<string, SegmentLogEntry> = {};
      entries.forEach((entry) => {
        if (entry.log) logsMap[entry.segmentId] = entry.log;
      });

      setSegmentLogs(logsMap);
      setWorkoutCompleteState(completion);
      setAllExerciseCardsComplete(await allExercisesComplete(programDayId, allExerciseIds));
    }

    void loadLocalState();
    return () => {
      cancelled = true;
    };
  }, [allExerciseIds, orderedSegments, programDayId]);

  async function handleSummaryDismiss(): Promise<void> {
    setSummaryVisible(false);
    try {
      await markDayComplete.mutateAsync({ programDayId, isCompleted: true, userId });
      await setWorkoutComplete(programDayId, true);
      setWorkoutCompleteState(true);
      setConfirmationText(null);

      let shouldShowReview = false;
      let weekCompleteNumber: number | undefined;
      let weekCompleteSessions: number | undefined;

      if (userId && prHits.length === 0) {
        try {
          const feed = await getPrsFeed(userId);
          const names = feed.rows.map((row) => row.exerciseName).filter(Boolean);
          if (names.length > 0) {
            setPrHits(names);
            const bestE1rm = feed.rows.reduce(
              (max, row) => Math.max(max, row.estimatedE1rmKg ?? 0),
              0,
            );
            if (bestE1rm > 0) setPrE1rmKg(bestE1rm);
            const already = await hasRequestedStoreReview(userId);
            if (!already) shouldShowReview = true;
          }
        } catch {
          // PR feed lookup is best-effort.
        }
      }

      if (prHits.length > 0) {
        const already = await hasRequestedStoreReview(userId);
        if (!already) shouldShowReview = true;
      }

      if (!programId || !userId) return;

      const overview = await queryClient.fetchQuery({
        queryKey: queryKeys.programOverview(programId, { userId }),
        queryFn: () => getProgramOverview(programId, { userId }),
        staleTime: 0,
      });

      const shareData = getCompletedWeekShareData(
        overview,
        day.weekNumber ?? null,
        programDayId,
        computeSessionStats().totalVolumeKg,
      );
      if (shareData) {
        weekCompleteNumber = shareData.weekNumber;
        weekCompleteSessions = shareData.sessionsCompleted;
      }

      const endCheck = await queryClient.fetchQuery({
        queryKey: queryKeys.programEndCheck(programId),
        queryFn: () => getProgramEndCheck(programId),
      });

      if (endCheck.lifecycleStatus === "completed") {
        nav.navigate("ProgramComplete", { programId });
        return;
      }

      if (endCheck.isLastScheduledDayComplete && endCheck.missedWorkoutsCount === 0) {
        await completeProgram.mutateAsync({ programId, mode: "as_scheduled" });
        nav.navigate("ProgramComplete", { programId });
        return;
      }

      if (endCheck.canCompleteWithSkips) {
        nav.navigate("ProgramEndCheck", { programId });
        return;
      }

      nav.navigate("ProgramDashboard", {
        programId,
        showReviewPrompt: shouldShowReview || undefined,
        weekCompleteNumber,
        weekCompleteSessions,
      });
    } catch (error) {
      setConfirmationText(error instanceof Error ? error.message : "Unable to mark workout complete.");
    }
  }

  async function handleUndoComplete(): Promise<void> {
    try {
      await markDayComplete.mutateAsync({ programDayId, isCompleted: false, userId });
      await setWorkoutComplete(programDayId, false);
      setWorkoutCompleteState(false);
      setConfirmationText("Workout completion cleared.");
    } catch (error) {
      setConfirmationText(error instanceof Error ? error.message : "Unable to undo completion.");
    }
  }

  function closeSwapSheet(): void {
    setSwapSheetVisible(false);
    setSwapTargetProgramExerciseId(null);
    setSwapTargetExerciseName(null);
  }

  function handleViewExerciseDetail(
    exerciseId: string,
    programExerciseId: string,
    exerciseName: string,
    exercise: Segment["exercises"][number],
  ): void {
    navigation.navigate("ExerciseDetail", {
      exerciseId,
      programExerciseId,
      exerciseName,
      sets: exercise.sets ?? null,
      reps: exercise.reps ?? null,
      repsUnit: exercise.repsUnit ?? null,
      intensity: exercise.intensity ?? null,
      restSeconds: exercise.restSeconds ?? null,
      guidelineLoadJson: exercise.guidelineLoad ? JSON.stringify(exercise.guidelineLoad) : null,
      adaptationDecisionJson: exercise.adaptationDecision ? JSON.stringify(exercise.adaptationDecision) : null,
    });
  }

  function computeExerciseSetCounts(rows: SaveSegmentLogPayload["rows"]): Record<string, number> {
    return rows.reduce<Record<string, number>>((acc, row) => {
      const hasSavedData =
        row.weightKg != null ||
        row.repsCompleted != null ||
        row.rirActual != null;
      if (!hasSavedData || !row.programExerciseId) return acc;
      acc[row.programExerciseId] = (acc[row.programExerciseId] ?? 0) + 1;
      return acc;
    }, {});
  }

  function handleAllSetsSaved(segmentId: string): void {
    void (async () => {
      const rows = await queryClient.fetchQuery({
        queryKey: queryKeys.segmentExerciseLogs(segmentId, programDayId),
        queryFn: () =>
          getSegmentExerciseLogs({
            userId,
            workoutSegmentId: segmentId,
            programDayId,
          }),
      });

      const normalizedRows: SaveSegmentLogPayload["rows"] = rows.map((row) => ({
        programExerciseId: row.programExerciseId,
        orderIndex: row.orderIndex,
        weightKg: row.weightKg,
        repsCompleted: row.repsCompleted,
        rirActual: row.rirActual,
      }));
      const exerciseSetCounts = computeExerciseSetCounts(normalizedRows);
      const entry: SegmentLogEntry = {
        updatedAt: new Date().toISOString(),
        exerciseSetCounts,
      };

      setSegmentLogs((current) => ({ ...current, [segmentId]: entry }));
      setSegmentLogRows((current) => ({ ...current, [segmentId]: normalizedRows }));
      await setSegmentLog(programDayId, segmentId, { exerciseSetCounts });
    })();
  }

  function computeSessionStats(): { totalVolumeKg: number; totalSets: number; exerciseCount: number } {
    return computeSessionStatsFromLoggedRows(segmentLogRows);
  }

  if (dayQuery.isLoading) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <SkeletonBlock height={164} style={styles.skeletonHero} />
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonCard}>
              <SkeletonBlock width="55%" height={18} borderRadius={radii.pill} style={styles.skeletonLineShort} />
              <SkeletonBlock width="100%" height={14} borderRadius={radii.pill} style={styles.skeletonLineFull} />
              <SkeletonBlock width="80%" height={14} borderRadius={radii.pill} style={styles.skeletonLineMedium} />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (dayQuery.isError || !dayQuery.data) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Couldn&apos;t load workout</Text>
        <Text style={styles.errorText}>{dayQuery.error?.message ?? "Please try again."}</Text>
        <PressableScale style={styles.retryButton} onPress={() => void dayQuery.refetch()}>
          <Text style={styles.retryLabel}>Retry</Text>
        </PressableScale>
      </View>
    );
  }

  const day = dayQuery.data.day;
  const scheduledWeekday = day.scheduledWeekday ?? "";
  const scheduledWeekdayLabel = toWeekdayPlural(scheduledWeekday);
  const weekNumber = day.weekNumber ?? 1;
  const currentEquipmentPreset = day.equipmentOverridePresetSlug ?? null;
  const currentEquipmentItems = day.equipmentOverrideItemSlugs ?? [];
  const sessionStats = computeSessionStats();
  const adaptedCount = dayQuery.data
    ? dayQuery.data.segments
        .flatMap((s) => s.exercises)
        .filter(
          (ex) =>
            ex.adaptationDecision != null &&
            ex.adaptationDecision.outcome !== "hold",
        ).length
    : 0;
  const adaptedExercisesForSummary = dayQuery.data
    ? dayQuery.data.segments
        .flatMap((s) => s.exercises)
        .filter(
          (ex) =>
            ex.adaptationDecision != null &&
            ex.adaptationDecision.outcome !== "hold",
        )
        .map((ex) => ({
          name: ex.name,
          displayChip: ex.adaptationDecision!.displayChip,
        }))
    : [];
  const completeButtonTestId = allExerciseCardsComplete
    ? "workout-complete-ready"
    : "workout-complete-primary";

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScroll={(e) => { scrollOffsetY.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={100}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{day.label ?? "Workout Day"}</Text>
          <Text style={styles.heroSummary}>
            {`${day.type ?? "Session"}${day.sessionDuration ? ` • ${day.sessionDuration} min` : ""}`}
          </Text>
        </View>

        <PressableScale
          style={styles.changeEquipmentLink}
          onPress={() => setEquipmentSheetVisible(true)}
        >
          <Ionicons name="barbell-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.changeEquipmentLabel}>Change equipment</Text>
        </PressableScale>

        {adaptedCount > 0 ? (
          <View style={styles.adaptBanner}>
            <Text style={styles.adaptBannerText}>
              {adaptedCount === 1
                ? "1 exercise personalised based on your last session. Tap an exercise name for details."
                : `${adaptedCount} exercises personalised based on your last session. Tap an exercise name for details.`}
            </Text>
          </View>
        ) : null}

        {orderedSegments.map((segment) => (
          <SegmentCard
            key={segment.id}
            segment={segment}
            isLogged={Boolean(segmentLogs[segment.id])}
            exerciseSetCounts={segmentLogs[segment.id]?.exerciseSetCounts}
            programId={programId}
            programDayId={programDayId}
            userId={userId}
            onViewExerciseDetail={handleViewExerciseDetail}
            onAllSetsSaved={handleAllSetsSaved}
            onSubscriptionRequired={() => {
              const parent = navigation.getParent();
              parent?.navigate("HomeTab", { screen: "Paywall" } as never);
            }}
            onPrsDetected={handlePrsDetected}
            onExerciseCompleteChange={refreshExerciseCompletion}
            onInlinePanelOpen={(pageY) => {
              const targetScreenY = 100;
              const newScrollY = scrollOffsetY.current + (pageY - targetScreenY);
              scrollViewRef.current?.scrollTo({ y: Math.max(0, newScrollY), animated: true });
            }}
            onInlinePanelClose={(pageY) => {
              const targetScreenY = 80;
              const newScrollY = scrollOffsetY.current + (pageY - targetScreenY);
              scrollViewRef.current?.scrollTo({ y: Math.max(0, newScrollY), animated: true });
            }}
          />
        ))}
      </ScrollView>

      <View style={styles.bottomBar}>
        <PressableScale
          style={[
            styles.completeButton,
            workoutComplete && styles.completeButtonDone,
          ]}
          onPress={() => setSummaryVisible(true)}
          testID={completeButtonTestId}
        >
          <Text style={styles.completeButtonLabel}>Workout complete</Text>
        </PressableScale>
        {workoutComplete ? (
          <PressableScale
            style={styles.undoButton}
            onPress={() => {
              void handleUndoComplete();
            }}
          >
            <Text style={styles.undoButtonLabel}>Undo</Text>
          </PressableScale>
        ) : null}
        {confirmationText ? <Text style={styles.confirmationText}>{confirmationText}</Text> : null}
      </View>

      <ExerciseSwapSheet
        visible={swapSheetVisible}
        programExerciseId={swapTargetProgramExerciseId}
        currentExerciseName={swapTargetExerciseName}
        programDayId={programDayId}
        userId={userId}
        onClose={closeSwapSheet}
        onSwapApplied={() => {
          closeSwapSheet();
          void dayQuery.refetch();
        }}
      />
      <SessionSummaryModal
        visible={summaryVisible}
        totalVolumeKg={sessionStats.totalVolumeKg}
        totalSets={sessionStats.totalSets}
        exerciseCount={sessionStats.exerciseCount}
        prHits={prHits}
        prE1rmKg={prE1rmKg}
        streakDays={0}
        adaptedExercises={adaptedExercisesForSummary}
        onDismiss={() => {
          void handleSummaryDismiss();
        }}
      />
      <EquipmentOverrideSheet
        visible={equipmentSheetVisible}
        onClose={() => setEquipmentSheetVisible(false)}
        onApplied={(message) => {
          setEquipmentSheetVisible(false);
          setConfirmationText(message ?? "Workout updated with new equipment.");
          void queryClient.invalidateQueries({
            queryKey: queryKeys.programDayFull(programDayId, { userId }),
          });
        }}
        programId={programId}
        programDayId={programDayId}
        scheduledWeekday={scheduledWeekday}
        scheduledWeekdayLabel={scheduledWeekdayLabel}
        weekNumber={weekNumber}
        currentPresetSlug={currentEquipmentPreset}
        currentItemSlugs={currentEquipmentItems}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 150,
    gap: spacing.md,
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
    minHeight: 44,
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
  headerBackButton: {
    minHeight: 36,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  headerBackLabel: {
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
  changeEquipmentLink: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 32,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
  },
  changeEquipmentLabel: {
    color: colors.textSecondary,
    ...typography.small,
    fontWeight: "600",
  },
  adaptBanner: {
    backgroundColor: "#0c1a4a",
    borderWidth: 1,
    borderColor: "#3b82f6",
    borderRadius: radii.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  adaptBannerText: {
    color: colors.accent,
    ...typography.small,
    lineHeight: 18,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  completeButton: {
    minHeight: 50,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  completeButtonDone: {
    backgroundColor: colors.success,
  },
  completeButtonDisabled: {
    opacity: 0.45,
  },
  completeButtonLabel: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  undoButton: {
    minHeight: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  undoButtonLabel: {
    color: colors.textPrimary,
    ...typography.small,
    fontWeight: "600",
  },
  confirmationText: {
    color: colors.textSecondary,
    ...typography.small,
    textAlign: "center",
  },
  skeletonHero: {
    backgroundColor: "transparent",
  },
  skeletonCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  skeletonLineShort: {
    backgroundColor: "transparent",
  },
  skeletonLineFull: {
    backgroundColor: "transparent",
  },
  skeletonLineMedium: {
    backgroundColor: "transparent",
  },
});
