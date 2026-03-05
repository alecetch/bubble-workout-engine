import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useProgramDayFull, useMarkDayComplete } from "../../api/hooks";
import { HeroHeader } from "../../components/program/HeroHeader";
import { LogSegmentModal } from "../../components/program/LogSegmentModal";
import { SegmentCard } from "../../components/program/SegmentCard";
import { PressableScale } from "../../components/interaction/PressableScale";
import { hapticLight, hapticMedium } from "../../components/interaction/haptics";
import type { OnboardingStackParamList } from "../../navigation/OnboardingNavigator";
import { useOnboardingStore } from "../../state/onboarding/onboardingStore";
import { useSessionStore } from "../../state/session/sessionStore";
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
  const bubbleUserId = sessionUserId ?? onboardingUserId ?? undefined;
  const programId = useSessionStore((state) => state.activeProgramId) ?? "";

  const dayQuery = useProgramDayFull(programDayId, { bubbleUserId });
  const markDayComplete = useMarkDayComplete();
  const [segmentLogs, setSegmentLogs] = useState<Record<string, SegmentLogEntry>>({});
  const [workoutComplete, setWorkoutCompleteState] = useState(false);
  const [confirmationText, setConfirmationText] = useState<string | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const dayLabel = dayQuery.data?.day?.label?.trim() || "Workout";

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

  const activeSegment = useMemo(
    () => orderedSegments.find((segment) => segment.id === activeSegmentId) ?? null,
    [activeSegmentId, orderedSegments],
  );

  const handleCompleteWorkout = async (): Promise<void> => {
    await setWorkoutComplete(programDayId, true);
    setWorkoutCompleteState(true);
    setConfirmationText("Workout marked complete.");
    markDayComplete.mutate({ programDayId, isCompleted: true, bubbleUserId });
    await hapticMedium();
  };

  const handleUndoComplete = async (): Promise<void> => {
    await setWorkoutComplete(programDayId, false);
    setWorkoutCompleteState(false);
    setConfirmationText("Workout completion cleared.");
    markDayComplete.mutate({ programDayId, isCompleted: false, bubbleUserId });
  };

  if (dayQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Loading workout day...</Text>
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
            onLogSegment={() => setActiveSegmentId(segment.id)}
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
        bubbleUserId={bubbleUserId}
        onClose={() => setActiveSegmentId(null)}
        onSave={() => {
          if (activeSegment) {
            const entry: SegmentLogEntry = { updatedAt: new Date().toISOString() };
            setSegmentLogs((current) => ({ ...current, [activeSegment.id]: entry }));
            // Write to AsyncStorage so the isLogged badge persists after app restart.
            void setSegmentLog(programDayId, activeSegment.id, {});
          }
          setActiveSegmentId(null);
          void hapticLight();
        }}
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
  loadingText: {
    color: colors.textSecondary,
    ...typography.body,
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
