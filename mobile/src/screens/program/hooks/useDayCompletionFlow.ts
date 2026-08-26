import { useCallback, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { queryKeys, useCompleteProgram, useMarkDayComplete } from "../../../api/hooks";
import { getPrsFeed } from "../../../api/history";
import { getProgramEndCheck } from "../../../api/programCompletion";
import { getProgramOverview, type ProgramOverviewResponse } from "../../../api/programViewer";
import type { ProgramsStackParamList } from "../../../navigation/ProgramsStackNavigator";
import { setWorkoutComplete } from "../../../utils/localWorkoutLog";
import { hasRequestedStoreReview } from "../../../utils/storeReview";

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

export function useDayCompletionFlow(params: {
  programDayId: string;
  programId: string;
  userId: string | undefined;
  markDayComplete: ReturnType<typeof useMarkDayComplete>;
  completeProgram: ReturnType<typeof useCompleteProgram>;
  queryClient: QueryClient;
  nav: NativeStackNavigationProp<ProgramsStackParamList>;
  setSummaryVisible: (value: boolean) => void;
  setWorkoutCompleteState: (value: boolean) => void;
  setConfirmationText: (value: string | null) => void;
  computeSessionStats: () => { totalVolumeKg: number };
  day: { weekNumber?: number | null } | undefined | null;
}): {
  prHits: string[];
  prE1rmKg: number | null;
  handlePrsDetected: (prs: Array<{ exerciseName: string; estimated1rmKg: number }>) => void;
  handleSummaryDismiss: () => Promise<void>;
} {
  const {
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
  } = params;
  const [prHits, setPrHits] = useState<string[]>([]);
  const [prE1rmKg, setPrE1rmKg] = useState<number | null>(null);

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

  const handleSummaryDismiss = useCallback(async (): Promise<void> => {
    if (markDayComplete.isPending) return;
    setSummaryVisible(false);
    try {
      await markDayComplete.mutateAsync({ programDayId, isCompleted: true, userId });
      await setWorkoutComplete(programDayId, true);
      setWorkoutCompleteState(true);
      setConfirmationText(null);

      let shouldShowReview = false;
      let weekCompleteNumber: number | undefined;
      let weekCompleteSessions: number | undefined;
      let weekCompleteVolumeKg: number | undefined;

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
        day?.weekNumber ?? null,
        programDayId,
        computeSessionStats().totalVolumeKg,
      );
      if (shareData) {
        weekCompleteNumber = shareData.weekNumber;
        weekCompleteSessions = shareData.sessionsCompleted;
        weekCompleteVolumeKg = shareData.totalVolumeKg;
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
        weekCompleteVolumeKg,
      });
    } catch (error) {
      setConfirmationText(error instanceof Error ? error.message : "Unable to mark workout complete.");
    }
  }, [
    completeProgram,
    computeSessionStats,
    day?.weekNumber,
    markDayComplete,
    markDayComplete.isPending,
    nav,
    prHits,
    programDayId,
    programId,
    queryClient,
    setConfirmationText,
    setSummaryVisible,
    setWorkoutCompleteState,
    userId,
  ]);

  return {
    prHits,
    prE1rmKg,
    handlePrsDetected,
    handleSummaryDismiss,
  };
}
