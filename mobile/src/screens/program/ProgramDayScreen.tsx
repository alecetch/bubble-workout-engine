import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { queryKeys, useCompleteProgram, useEntitlement, useHistoryOverview, useMarkDayComplete, useProgramDayFull } from "../../api/hooks";
import { getSegmentExerciseLogs, type SaveSegmentLogPayload } from "../../api/segmentLog";
import type { ProgramDayFullResponse } from "../../api/programViewer";
import { SkeletonBlock } from "../../components/feedback/SkeletonBlock";
import { PressableScale } from "../../components/interaction/PressableScale";
import { EquipmentOverrideSheet } from "../../components/program/EquipmentOverrideSheet";
import { ExerciseSwapSheet } from "../../components/program/ExerciseSwapSheet";
import { SegmentCard } from "../../components/program/SegmentCard";
import { SessionSummaryModal } from "../../components/program/SessionSummaryModal";
import { computeSessionStatsFromLoggedRows, computeTotalPrescribedSets } from "../../components/program/sessionUxLogic";
import { WorkoutProgressHeader } from "../../components/program/WorkoutProgressHeader";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import type { ProgramsStackParamList } from "../../navigation/ProgramsStackNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { colors } from "../../theme/colors";
import { radii, softBadgePalette } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import {
  getWorkoutStartedAt,
  setSegmentLog,
  setWorkoutComplete,
  type SegmentLogEntry,
} from "../../utils/localWorkoutLog";
import { useSettingsStore } from "../../state/settings/useSettingsStore";
import { useDayCompletionFlow } from "./hooks/useDayCompletionFlow";
import { useExerciseSwapSheet } from "./hooks/useExerciseSwapSheet";
import { useLocalDayState } from "./hooks/useLocalDayState";

type Props = NativeStackScreenProps<OnboardingStackParamList, "ProgramDay">;
type Segment = ProgramDayFullResponse["segments"][number];

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
  const historyOverviewQuery = useHistoryOverview(userId);
  const queryClient = useQueryClient();
  const [confirmationText, setConfirmationText] = useState<string | null>(null);
  const [equipmentSheetVisible, setEquipmentSheetVisible] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [segmentDoneSetCounts, setSegmentDoneSetCounts] = useState<Record<string, number>>({});
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetY = useRef(0);
  const segmentOffsetsRef = useRef<Record<string, number>>({});
  const headerHeightRef = useRef(0);
  const dayLabel = dayQuery.data?.day?.label?.trim() || "Workout";
  const day = dayQuery.data?.day;
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
      navigation.navigate("Paywall");
    }
  }, [entitlementQuery.data?.is_active, entitlementQuery.isSuccess, navigation]);

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

  const {
    segmentLogs,
    setSegmentLogs,
    segmentLogRows,
    setSegmentLogRows,
    workoutComplete,
    setWorkoutCompleteState,
    allExerciseCardsComplete,
    completedExerciseIds,
    refreshExerciseCompletion,
  } = useLocalDayState(programDayId, orderedSegments, allExerciseIds, dayQuery.data?.day?.isCompleted ?? null);
  const totalExercises = allExerciseIds.length;
  const completedExerciseCount = completedExerciseIds.size;
  const totalPrescribedSets = useMemo(() => computeTotalPrescribedSets(orderedSegments), [orderedSegments]);
  const loggedSetCount = useMemo(
    () =>
      orderedSegments.reduce((sum, segment) => {
        const liveDoneCount = segmentDoneSetCounts[segment.id];
        if (liveDoneCount != null) return sum + liveDoneCount;
        const savedCounts = segmentLogs[segment.id]?.exerciseSetCounts;
        if (!savedCounts) return sum;
        return sum + Object.values(savedCounts).reduce((savedSum, count) => savedSum + count, 0);
      }, 0),
    [orderedSegments, segmentDoneSetCounts, segmentLogs],
  );

  const refreshStartedAt = useCallback(() => {
    void getWorkoutStartedAt(programDayId).then((value) => {
      if (value != null) {
        setStartedAtMs((current) => current ?? value);
      }
    });
  }, [programDayId]);

  useEffect(() => {
    void getWorkoutStartedAt(programDayId).then(setStartedAtMs);
  }, [programDayId]);

  const computeSessionStats = useCallback(
    (): { totalVolumeKg: number; totalSets: number; exerciseCount: number } =>
      computeSessionStatsFromLoggedRows(segmentLogRows),
    [segmentLogRows],
  );

  const {
    prHits,
    prE1rmKg,
    handlePrsDetected,
    handleSummaryDismiss,
  } = useDayCompletionFlow({
    programDayId,
    programId,
    userId,
    markDayComplete,
    completeProgram,
    queryClient,
    nav,
    setSummaryVisible,
    setWorkoutCompleteState,
    setConfirmationText,
    computeSessionStats,
    day,
  });

  const {
    swapSheetVisible,
    swapTargetProgramExerciseId,
    swapTargetExerciseName,
    openSwapSheet,
    closeSwapSheet,
    handleSwapApplied,
  } = useExerciseSwapSheet({
    onSwapApplied: () => {
      void dayQuery.refetch();
    },
  });

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

  const handleViewExerciseDetail = useCallback((
    exerciseId: string,
    programExerciseId: string,
    exerciseName: string,
    exercise: Segment["exercises"][number],
  ): void => {
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
  }, [navigation]);

  const handleAllSetsSaved = useCallback((segmentId: string): void => {
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
      refreshStartedAt();
    })();
  }, [programDayId, queryClient, refreshStartedAt, setSegmentLogRows, setSegmentLogs, userId]);

  const handleSetsLoggedChange = useCallback((segmentId: string, doneCount: number) => {
    setSegmentDoneSetCounts((current) =>
      current[segmentId] === doneCount ? current : { ...current, [segmentId]: doneCount },
    );
    if (doneCount > 0) {
      refreshStartedAt();
    }
  }, [refreshStartedAt]);

  const handleSegmentLayout = useCallback((segmentId: string, y: number) => {
    segmentOffsetsRef.current[segmentId] = y;
  }, []);

  const handleJumpToNext = useCallback(() => {
    const nextSegment = orderedSegments.find((segment) =>
      (segment.exercises ?? []).some((exercise) => exercise.id && !completedExerciseIds.has(exercise.id)),
    );
    if (!nextSegment) return;
    const y = segmentOffsetsRef.current[nextSegment.id];
    if (y == null) return;
    scrollViewRef.current?.scrollTo({ y: Math.max(0, y - headerHeightRef.current - spacing.sm), animated: true });
  }, [completedExerciseIds, orderedSegments]);

  const handleSubscriptionRequired = useCallback(() => {
    navigation.navigate("Paywall");
  }, [navigation]);

  const handleInlinePanelOpen = useCallback((pageY: number) => {
    const targetScreenY = headerHeightRef.current + spacing.sm;
    const newScrollY = scrollOffsetY.current + (pageY - targetScreenY);
    scrollViewRef.current?.scrollTo({ y: Math.max(0, newScrollY), animated: true });
  }, []);

  const handleInlinePanelClose = useCallback((pageY: number) => {
    const targetScreenY = headerHeightRef.current + spacing.sm;
    const newScrollY = scrollOffsetY.current + (pageY - targetScreenY);
    scrollViewRef.current?.scrollTo({ y: Math.max(0, newScrollY), animated: true });
  }, []);

  const handleCompletePress = useCallback(() => {
    if (completedExerciseCount < totalExercises) {
      const remaining = totalExercises - completedExerciseCount;
      Alert.alert(
        "Workout not finished",
        `You still have ${remaining} exercise${remaining === 1 ? "" : "s"} left to log. Finish anyway?`,
        [
          { text: "Keep logging", style: "cancel" },
          { text: "Finish anyway", onPress: () => setSummaryVisible(true) },
        ],
      );
      return;
    }
    setSummaryVisible(true);
  }, [completedExerciseCount, totalExercises]);

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

  const loadedDay = dayQuery.data.day;
  const scheduledWeekday = loadedDay.scheduledWeekday ?? "";
  const scheduledWeekdayLabel = toWeekdayPlural(scheduledWeekday);
  const weekNumber = loadedDay.weekNumber ?? 1;
  const currentEquipmentPreset = loadedDay.equipmentOverridePresetSlug ?? null;
  const currentEquipmentItems = loadedDay.equipmentOverrideItemSlugs ?? [];
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
      <WorkoutProgressHeader
        completedExercises={completedExerciseCount}
        totalExercises={totalExercises}
        loggedSets={loggedSetCount}
        totalSets={totalPrescribedSets}
        startedAtMs={startedAtMs}
        showJumpToNext={completedExerciseCount < totalExercises}
        onJumpToNext={handleJumpToNext}
        onLayout={(height) => { headerHeightRef.current = height; }}
      />
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        onScroll={(e) => { scrollOffsetY.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={100}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{loadedDay.label ?? "Workout Day"}</Text>
          <Text style={styles.heroSummary}>
            {`${loadedDay.type ?? "Session"}${loadedDay.sessionDuration ? ` • ${loadedDay.sessionDuration} min` : ""}`}
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
            onRequestSwap={openSwapSheet}
            onAllSetsSaved={handleAllSetsSaved}
            onSubscriptionRequired={handleSubscriptionRequired}
            onPrsDetected={handlePrsDetected}
            onExerciseCompleteChange={refreshExerciseCompletion}
            onLayout={(event) => handleSegmentLayout(segment.id, event.nativeEvent.layout.y)}
            onInlinePanelOpen={handleInlinePanelOpen}
            onInlinePanelClose={handleInlinePanelClose}
            onSetsLoggedChange={handleSetsLoggedChange}
          />
        ))}
      </ScrollView>

      <View style={styles.bottomBar}>
        <PressableScale
          style={[
            styles.completeButton,
            workoutComplete && styles.completeButtonDone,
          ]}
          onPress={handleCompletePress}
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
        onSwapApplied={handleSwapApplied}
      />
      <SessionSummaryModal
        visible={summaryVisible}
        totalVolumeKg={sessionStats.totalVolumeKg}
        totalSets={sessionStats.totalSets}
        exerciseCount={sessionStats.exerciseCount}
        prHits={prHits}
        prE1rmKg={prE1rmKg}
        streakDays={historyOverviewQuery.data?.currentStreakDays ?? 0}
        adaptedExercises={adaptedExercisesForSummary}
        isSubmitting={markDayComplete.isPending}
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
    backgroundColor: softBadgePalette.info.bg,
    borderWidth: 1,
    borderColor: softBadgePalette.info.border,
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
