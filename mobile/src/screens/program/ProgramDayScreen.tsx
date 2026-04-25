import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { HeroHeader } from "../../components/program/HeroHeader";
import { ExerciseSwapSheet } from "../../components/program/ExerciseSwapSheet";
import { LogSegmentModal } from "../../components/program/LogSegmentModal";
import { SessionSummaryModal } from "../../components/program/SessionSummaryModal";
import { TechniqueSheet } from "../../components/program/TechniqueSheet";
import { computeSessionStatsFromLoggedRows } from "../../components/program/sessionUxLogic";
import { SegmentCard } from "../../components/program/SegmentCard";
import { SkeletonBlock } from "../../components/feedback/SkeletonBlock";
import { PressableScale } from "../../components/interaction/PressableScale";
import { hapticLight, hapticMedium } from "../../components/interaction/haptics";
import { getProgramEndCheck } from "../../api/programCompletion";
import { queryKeys, useCompleteProgram, useMarkDayComplete, useProgramDayFull } from "../../api/hooks";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import type { ProgramsStackParamList } from "../../navigation/ProgramsStackNavigator";
import type { SaveSegmentLogPayload } from "../../api/segmentLog";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
import { useTimerStore } from "../../state/timer/useTimerStore";
import {
  getSegmentLog,
  getWorkoutComplete,
  setSegmentLog,
  setWorkoutComplete,
  type SegmentLogEntry,
} from "../../utils/localWorkoutLog";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/components";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type Props = NativeStackScreenProps<OnboardingStackParamList, "ProgramDay">;

export function ProgramDayScreen({ route, navigation }: Props): React.JSX.Element {
  const { programDayId } = route.params;
  const onboardingUserId = useOnboardingStore((state) => state.userId);
  const sessionUserId = useSessionStore((state) => state.userId);
  const userId = sessionUserId ?? onboardingUserId ?? undefined;
  const activeProgramId = useSessionStore((state) => state.activeProgramId);

  const dayQuery = useProgramDayFull(programDayId, { userId });
  const markDayComplete = useMarkDayComplete();
  const completeProgram = useCompleteProgram();
  const queryClient = useQueryClient();
  const [segmentLogs, setSegmentLogs] = useState<Record<string, SegmentLogEntry>>({});
  const [segmentLogRows, setSegmentLogRows] = useState<Record<string, SaveSegmentLogPayload["rows"]>>({});
  const [workoutComplete, setWorkoutCompleteState] = useState(false);
  const [confirmationText, setConfirmationText] = useState<string | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [swapSheetVisible, setSwapSheetVisible] = useState(false);
  const [swapTargetProgramExerciseId, setSwapTargetProgramExerciseId] = useState<string | null>(null);
  const [swapTargetExerciseName, setSwapTargetExerciseName] = useState<string | null>(null);
  const [techniqueSheetVisible, setTechniqueSheetVisible] = useState(false);
  const [techniqueTargetExerciseId, setTechniqueTargetExerciseId] = useState<string | null>(null);
  const [techniqueTargetExerciseName, setTechniqueTargetExerciseName] = useState<string | null>(null);
  const [autoOpenedExerciseIds, setAutoOpenedExerciseIds] = useState<Set<string>>(new Set());
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [prHits] = useState<string[]>([]);
  const dayLabel = dayQuery.data?.day?.label?.trim() || "Workout";
  const programId = dayQuery.data?.day?.programId ?? activeProgramId ?? "";
  const nav = navigation as unknown as NativeStackNavigationProp<ProgramsStackParamList>;

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

  useEffect(() => {
    if (!dayQuery.data || dayQuery.isLoading) return;

    for (const segment of orderedSegments) {
      if (segmentLogs[segment.id]) continue;

      for (const exercise of segment.exercises ?? []) {
        if (
          exercise.isNewExercise &&
          exercise.exerciseId &&
          !autoOpenedExerciseIds.has(exercise.exerciseId) &&
          (exercise.coachingCuesJson?.length ?? 0) > 0
        ) {
          setAutoOpenedExerciseIds((prev) => new Set([...prev, exercise.exerciseId ?? ""]));
          setTechniqueTargetExerciseId(exercise.exerciseId);
          setTechniqueTargetExerciseName(exercise.name);
          setTechniqueSheetVisible(true);
          return;
        }
      }
    }
  }, [autoOpenedExerciseIds, dayQuery.data, dayQuery.isLoading, orderedSegments, segmentLogs]);

  const activeSegment = useMemo(
    () => orderedSegments.find((segment) => segment.id === activeSegmentId) ?? null,
    [activeSegmentId, orderedSegments],
  );

  function openSwapSheet(programExerciseId: string, exerciseName: string): void {
    setSwapTargetProgramExerciseId(programExerciseId);
    setSwapTargetExerciseName(exerciseName);
    setSwapSheetVisible(true);
  }

  function closeSwapSheet(): void {
    setSwapSheetVisible(false);
    setSwapTargetProgramExerciseId(null);
    setSwapTargetExerciseName(null);
  }

  function openTechniqueSheet(exerciseId: string, exerciseName: string): void {
    setTechniqueTargetExerciseId(exerciseId);
    setTechniqueTargetExerciseName(exerciseName);
    setTechniqueSheetVisible(true);
  }

  function closeTechniqueSheet(): void {
    setTechniqueSheetVisible(false);
    setTechniqueTargetExerciseId(null);
    setTechniqueTargetExerciseName(null);
  }

  const handleCompleteWorkout = async (): Promise<void> => {
    await hapticMedium();
    setSummaryVisible(true);
  };

  const handleSummaryDismiss = async (): Promise<void> => {
    setSummaryVisible(false);
    try {
      await markDayComplete.mutateAsync({ programDayId, isCompleted: true, userId });
      await setWorkoutComplete(programDayId, true);
      setWorkoutCompleteState(true);
      setConfirmationText(null);

      if (!programId || !userId) return;

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
  };

  const handleUndoComplete = async (): Promise<void> => {
    try {
      await markDayComplete.mutateAsync({ programDayId, isCompleted: false, userId });
      await setWorkoutComplete(programDayId, false);
      setWorkoutCompleteState(false);
      setConfirmationText("Workout completion cleared.");
    } catch (error) {
      setConfirmationText(error instanceof Error ? error.message : "Unable to undo completion.");
    }
  };

  if (dayQuery.isLoading) {
    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <SkeletonBlock height={164} />
          {[0, 1, 2].map((i) => (
            <View key={i} style={skeletonStyles.card}>
              <SkeletonBlock width="55%" height={18} />
              <SkeletonBlock width="100%" height={14} />
              <SkeletonBlock width="80%" height={14} />
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

  function computeSessionStats(): { totalVolumeKg: number; totalSets: number; exerciseCount: number } {
    return computeSessionStatsFromLoggedRows(segmentLogRows);
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <HeroHeader
          title={day.label ?? "Workout Day"}
          summary={`${day.type ?? "Session"}${day.sessionDuration ? ` • ${day.sessionDuration} min` : ""}`}
          heroMedia={day.heroMedia}
        />

        {orderedSegments.map((segment) => (
          <SegmentCard
            key={segment.id}
            segment={segment}
            isLogged={Boolean(segmentLogs[segment.id])}
            exerciseSetCounts={segmentLogs[segment.id]?.exerciseSetCounts}
            onLogSegment={() => setActiveSegmentId(segment.id)}
            onSwapExercise={openSwapSheet}
            onViewDecisionHistory={(_exerciseId, exerciseName, programExerciseId) => {
              nav.navigate("ExerciseDecisionHistory", {
                programExerciseId,
                exerciseName,
              });
            }}
            onViewTechnique={openTechniqueSheet}
          />
        ))}
      </ScrollView>

      <View style={styles.bottomBar}>
        <PressableScale
          style={[styles.completeButton, workoutComplete && styles.completeButtonDone]}
          onPress={() => {
            void handleCompleteWorkout();
          }}
        >
          <Text style={styles.completeButtonLabel}>
            {workoutComplete ? "Workout complete" : "Workout complete"}
          </Text>
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

      <LogSegmentModal
        visible={Boolean(activeSegment)}
        segment={activeSegment}
        programDayId={programDayId}
        programId={programId}
        userId={userId}
        onClose={() => setActiveSegmentId(null)}
        onSave={(rows) => {
          if (activeSegment) {
            const exerciseSetCounts = rows.reduce<Record<string, number>>((acc, row) => {
              const hasSavedData =
                row.weightKg != null ||
                row.repsCompleted != null ||
                row.rirActual != null;
              if (!hasSavedData || !row.programExerciseId) return acc;
              acc[row.programExerciseId] = (acc[row.programExerciseId] ?? 0) + 1;
              return acc;
            }, {});
            const entry: SegmentLogEntry = {
              updatedAt: new Date().toISOString(),
              exerciseSetCounts,
            };
            setSegmentLogs((current) => ({ ...current, [activeSegment.id]: entry }));
            setSegmentLogRows((current) => ({ ...current, [activeSegment.id]: rows }));
            // Write to AsyncStorage so the isLogged badge persists after app restart.
            void setSegmentLog(programDayId, activeSegment.id, { exerciseSetCounts });
            const maxRest = Math.max(
              0,
              ...(activeSegment.exercises ?? []).map((ex) => (ex.restSeconds as number | null | undefined) ?? 0),
            );
            if (maxRest > 0) {
              useTimerStore.getState().startRest(activeSegment.id);
            }
          }
          setActiveSegmentId(null);
          void hapticLight();
        }}
      />
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
      <TechniqueSheet
        visible={techniqueSheetVisible}
        exerciseId={techniqueTargetExerciseId}
        exerciseName={techniqueTargetExerciseName}
        onClose={closeTechniqueSheet}
      />
      <SessionSummaryModal
        visible={summaryVisible}
        {...computeSessionStats()}
        prHits={prHits}
        streakDays={0}
        onDismiss={() => { void handleSummaryDismiss(); }}
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
});

const skeletonStyles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
