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
import { getProgramOverview, type ProgramDayFullResponse } from "../../api/programViewer";
import { SkeletonBlock } from "../../components/feedback/SkeletonBlock";
import { PressableScale } from "../../components/interaction/PressableScale";
import { EquipmentOverrideSheet } from "../../components/program/EquipmentOverrideSheet";
import { ExerciseSwapSheet } from "../../components/program/ExerciseSwapSheet";
import { SegmentCard } from "../../components/program/SegmentCard";
import { SessionSummaryModal } from "../../components/program/SessionSummaryModal";
import { WeekShareCard } from "../../components/sharing/WeekShareCard";
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
  getWorkoutComplete,
  setSegmentLog,
  setWorkoutComplete,
  type SegmentLogEntry,
} from "../../utils/localWorkoutLog";
import { captureAndShare } from "../../utils/shareCard";
import { getAppStorage } from "../../utils/appStorage";

type Props = NativeStackScreenProps<OnboardingStackParamList, "ProgramDay">;
type Segment = ProgramDayFullResponse["segments"][number];
type WeekShareData = {
  weekNumber: number;
  sessionsCompleted: number;
  totalVolumeKg: number;
};

const REVIEW_PROMPT_KEY = "hasRequestedStoreReview";

async function maybeRequestStoreReview(): Promise<void> {
  try {
    const storage = getAppStorage();
    const already = await storage.getItem(REVIEW_PROMPT_KEY);
    if (already) return;

    const requireFn = (globalThis as { require?: (id: string) => unknown }).require;
    if (!requireFn) return;
    const StoreReview = requireFn("expo-store-review") as {
      isAvailableAsync?: () => Promise<boolean>;
      requestReview?: () => Promise<void>;
    };
    if (
      typeof StoreReview?.isAvailableAsync !== "function" ||
      typeof StoreReview?.requestReview !== "function"
    ) {
      return;
    }

    const isAvailable = await StoreReview.isAvailableAsync();
    if (!isAvailable) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    await StoreReview.requestReview();
    await storage.setItem(REVIEW_PROMPT_KEY, "1");
  } catch {
    // Review prompt is best-effort only.
  }
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
  const [confirmationText, setConfirmationText] = useState<string | null>(null);
  const [swapSheetVisible, setSwapSheetVisible] = useState(false);
  const [swapTargetProgramExerciseId, setSwapTargetProgramExerciseId] = useState<string | null>(null);
  const [swapTargetExerciseName, setSwapTargetExerciseName] = useState<string | null>(null);
  const [equipmentSheetVisible, setEquipmentSheetVisible] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [prHits, setPrHits] = useState<string[]>([]);
  const [prE1rmKg, setPrE1rmKg] = useState<number | null>(null);
  const [weekShareVisible, setWeekShareVisible] = useState(false);
  const [weekShareData, setWeekShareData] = useState<WeekShareData | null>(null);
  const [isSharingWeek, setIsSharingWeek] = useState(false);
  const weekCardRef = useRef<View>(null);
  const dayLabel = dayQuery.data?.day?.label?.trim() || "Workout";
  const programId = dayQuery.data?.day?.programId ?? activeProgramId ?? "";
  const nav = navigation as unknown as NativeStackNavigationProp<ProgramsStackParamList>;

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
    }

    void loadLocalState();
    return () => {
      cancelled = true;
    };
  }, [orderedSegments, programDayId]);

  async function handleSummaryDismiss(): Promise<void> {
    setSummaryVisible(false);
    try {
      await markDayComplete.mutateAsync({ programDayId, isCompleted: true, userId });
      await setWorkoutComplete(programDayId, true);
      setWorkoutCompleteState(true);
      setConfirmationText(null);

      if (userId && prHits.length === 0) {
        void getPrsFeed(userId)
          .then((feed) => {
            const names = feed.rows.map((row) => row.exerciseName).filter(Boolean);
            if (names.length > 0) {
              setPrHits(names);
              const bestE1rm = feed.rows.reduce(
                (max, row) => Math.max(max, row.estimatedE1rmKg ?? 0),
                0,
              );
              if (bestE1rm > 0) setPrE1rmKg(bestE1rm);
              void maybeRequestStoreReview();
            }
          })
          .catch(() => {});
      }

      if (prHits.length > 0) {
        void maybeRequestStoreReview();
      }

      if (!programId || !userId) return;

      const overview = await queryClient.fetchQuery({
        queryKey: queryKeys.programOverview(programId, { userId }),
        queryFn: () => getProgramOverview(programId, { userId }),
        staleTime: 0,
      });

      const currentWeekNumber = day.weekNumber ?? null;
      if (currentWeekNumber != null) {
        const thisWeekTrainingDays = overview.calendarDays.filter(
          (calendarDay) =>
            calendarDay.isTrainingDay &&
            Boolean(calendarDay.programDayId) &&
            calendarDay.weekNumber === currentWeekNumber,
        );
        const thisWeekAllDone =
          thisWeekTrainingDays.length > 0 &&
          thisWeekTrainingDays.every((calendarDay) => calendarDay.status === "complete");

        if (thisWeekAllDone) {
          setWeekShareData({
            weekNumber: currentWeekNumber,
            sessionsCompleted: thisWeekTrainingDays.length,
            totalVolumeKg: computeSessionStats().totalVolumeKg,
          });
          setWeekShareVisible(true);
        }
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
      }
    } catch (error) {
      setConfirmationText(error instanceof Error ? error.message : "Unable to mark workout complete.");
    }
  }

  async function handleShareWeek(): Promise<void> {
    if (isSharingWeek) return;
    setIsSharingWeek(true);
    try {
      await captureAndShare(weekCardRef);
    } finally {
      setIsSharingWeek(false);
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

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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

        {weekShareVisible && weekShareData ? (
          <View style={styles.weekCompleteBanner}>
            <View style={styles.weekCompleteContent}>
              <Text style={styles.weekCompleteTitle}>Week {weekShareData.weekNumber} complete!</Text>
              <Text style={styles.weekCompleteSubtitle}>
                {weekShareData.sessionsCompleted} sessions completed
              </Text>
            </View>
            <PressableScale
              style={styles.weekShareButton}
              onPress={() => {
                void handleShareWeek();
              }}
              disabled={isSharingWeek}
            >
              <Text style={styles.weekShareButtonLabel}>
                {isSharingWeek ? "..." : "Share"}
              </Text>
            </PressableScale>
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
          />
        ))}
      </ScrollView>

      <View style={styles.bottomBar}>
        <PressableScale
          style={[styles.completeButton, workoutComplete && styles.completeButtonDone]}
          onPress={() => setSummaryVisible(true)}
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
      {weekShareData ? (
        <WeekShareCard
          weekNumber={weekShareData.weekNumber}
          sessionsCompleted={weekShareData.sessionsCompleted}
          totalVolumeKg={weekShareData.totalVolumeKg}
          cardRef={weekCardRef}
        />
      ) : null}
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
  weekCompleteBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#052e16",
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  weekCompleteContent: {
    flex: 1,
    gap: 4,
  },
  weekCompleteTitle: {
    color: colors.textPrimary,
    ...typography.body,
    fontWeight: "700",
  },
  weekCompleteSubtitle: {
    color: colors.textSecondary,
    ...typography.small,
  },
  weekShareButton: {
    minHeight: 36,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
    paddingHorizontal: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  weekShareButtonLabel: {
    color: colors.background,
    ...typography.small,
    fontWeight: "700",
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
