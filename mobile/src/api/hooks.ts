import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  createClientProfile,
  getClientProfile,
  updateClientProfile,
  type ClientProfileServer,
  type CreateClientProfileInput,
  type UpdateClientProfileInput,
} from "./clientProfiles";
import { getEquipmentItemsForPreset, type EquipmentItemsForPresetResponse } from "./equipmentPresets";
import { getMe, linkClientProfileToMe, type MeResponse } from "./me";
import {
  fetchActivePrograms,
  fetchCombinedCalendar,
  fetchSessionsByDate,
  setPrimaryProgram,
  type ActiveProgramsResponse,
  type CombinedCalendarResponse,
  type SessionsByDateResponse,
} from "./activePrograms";
import {
  getProgramDayFull,
  getProgramOverview,
  markProgramDayComplete,
  type ProgramDayFullResponse,
  type ProgramOverviewOptions,
  type ProgramOverviewResponse,
  type ViewerIdentityOptions,
} from "./programViewer";
import {
  fetchExerciseGuidance,
  type ExerciseGuidance,
} from "./exerciseGuidance";
import {
  getCheckIns,
  deleteCheckIn,
  type CheckInListResponse,
} from "./physique";
import {
  completeProgram,
  getProgramEndCheck,
  getProgramCompletionSummary,
  type ProgramEndCheck,
  type ProgramCompletionSummary,
} from "./programCompletion";
import {
  getSegmentExerciseLogs,
  saveSegmentExerciseLogs,
  type SegmentLogRow,
  type SaveSegmentLogPayload,
} from "./segmentLog";
import {
  applyExerciseSwap,
  getExerciseSwapOptions,
  type ApplyExerciseSwapResponse,
  type ExerciseSwapOptionsResponse,
} from "./programExercise";
import { getReferenceData, type ReferenceDataResponse } from "./referenceData";
import {
  fetchExerciseHistory,
  getExerciseSummary,
  getHistoryOverview,
  getHistoryPersonalRecords,
  getHistoryPrograms,
  getHistoryTimeline,
  getPrsFeed,
  getSessionHistoryMetrics,
  searchLoggedExercises,
  searchExercises,
  type ExerciseSummaryResponse,
  type ExerciseHistoryResponse,
  type ExerciseHistoryWindow,
  type ExerciseSearchItem,
  type LoggedExerciseItem,
  type HistoryOverviewResponse,
  type HistoryPersonalRecordItem,
  type HistoryProgramItem,
  type HistoryTimelineCursor,
  type HistoryTimelineResponse,
  type PrsFeedResponse,
  type SessionHistoryMetrics,
} from "./history";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "./notifications";
import { getEntitlement, type EntitlementResponse } from "./entitlement";
import type { EquipmentPreset } from "../state/onboarding/types";

export const queryKeys = {
  me: ["me"] as const,
  referenceData: ["referenceData"] as const,
  clientProfile: (profileId: string) => ["clientProfile", profileId] as const,
  equipmentItems: (presetCode: string | null) => ["equipmentItems", presetCode] as const,
  // selectedProgramDayId intentionally excluded — overview is static per program/user.
  // Selection state belongs to the UI layer only, not the cache key.
  programOverview: (programId: string, opts: { userId?: string | null }) =>
    ["programOverview", programId, opts.userId ?? null] as const,
  // Per-day preview: independent cache entry per selected day.
  dayPreview: (programId: string, programDayId: string, opts: { userId?: string | null }) =>
    ["dayPreview", programId, programDayId, opts.userId ?? null] as const,
  programDayFull: (programDayId: string, opts: ViewerIdentityOptions) =>
    ["programDayFull", programDayId, opts.userId ?? null] as const,
  historyOverview: ["historyOverview"] as const,
  historyPrograms: ["historyPrograms"] as const,
  activePrograms: ["activePrograms"] as const,
  combinedCalendar: ["combinedCalendar"] as const,
  historyTimeline: ["historyTimeline"] as const,
  historyPersonalRecords: ["historyPersonalRecords"] as const,
  exerciseSearch: (q: string) => ["exerciseSearch", q] as const,
  exerciseHistory: (exerciseId: string) => ["exerciseHistory", exerciseId] as const,
  segmentExerciseLogs: (workoutSegmentId: string, programDayId: string) =>
    ["segmentExerciseLogs", workoutSegmentId, programDayId] as const,
  exerciseSwapOptions: (programExerciseId: string) =>
    ["exerciseSwapOptions", programExerciseId] as const,
  programCompletionSummary: (programId: string) =>
    ["programCompletionSummary", programId] as const,
  programEndCheck: (programId: string) =>
    ["programEndCheck", programId] as const,
  exerciseGuidance: (exerciseId: string) => ["exerciseGuidance", exerciseId] as const,
  notificationPreferences: ["notificationPreferences"] as const,
  entitlement: ["entitlement"] as const,
  physiqueCheckIns: ["physiqueCheckIns"] as const,
};

export function useMe(): UseQueryResult<MeResponse> {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: getMe,
  });
}

export function useReferenceData(): UseQueryResult<ReferenceDataResponse> {
  return useQuery({
    queryKey: queryKeys.referenceData,
    queryFn: getReferenceData,
  });
}

export function useClientProfile(profileId: string | null | undefined): UseQueryResult<ClientProfileServer> {
  return useQuery({
    queryKey: queryKeys.clientProfile(profileId ?? ""),
    queryFn: () => getClientProfile(profileId as string),
    enabled: Boolean(profileId),
  });
}

export function useCreateClientProfile(): UseMutationResult<ClientProfileServer, Error, CreateClientProfileInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => createClientProfile(payload),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.clientProfile(profile.id), profile);
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useLinkClientProfileToUser(): UseMutationResult<MeResponse, Error, { clientProfileId: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ clientProfileId }) => linkClientProfileToMe({ clientProfileId }),
    onSuccess: (me) => {
      queryClient.setQueryData(queryKeys.me, me);
    },
  });
}

export function useUpdateClientProfile(
  profileId: string,
): UseMutationResult<ClientProfileServer, Error, UpdateClientProfileInput> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload) => updateClientProfile(profileId, payload),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.clientProfile(profile.id), profile);
    },
  });
}

export function useEquipmentItems(
  presetCode: string | null,
): UseQueryResult<EquipmentItemsForPresetResponse> {
  return useQuery({
    queryKey: queryKeys.equipmentItems(presetCode),
    queryFn: () => getEquipmentItemsForPreset(presetCode as EquipmentPreset),
    enabled: Boolean(presetCode),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProgramOverview(
  programId: string,
  opts: { userId?: string },
): UseQueryResult<ProgramOverviewResponse> {
  return useQuery({
    queryKey: queryKeys.programOverview(programId, opts),
    queryFn: () => getProgramOverview(programId, opts),
    enabled: Boolean(programId && opts.userId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetches the day preview for a specific programDayId.
 *
 * This is intentionally a SEPARATE query from useProgramOverview so that
 * day selection never appears in the overview query key. The overview fetches
 * once; this query fires only when the user explicitly picks a different day.
 *
 * Uses the same /overview endpoint with selected_program_day_id and selects
 * only the selectedDayPreview slice to keep the cache granular.
 */
export function useDayPreview(
  programId: string,
  programDayId: string | undefined,
  opts: { userId?: string },
): UseQueryResult<ProgramOverviewResponse["selectedDayPreview"]> {
  return useQuery({
    queryKey: queryKeys.dayPreview(programId, programDayId ?? "", opts),
    queryFn: () => getProgramOverview(programId, { ...opts, selectedProgramDayId: programDayId }),
    select: (data) => data.selectedDayPreview,
    enabled: Boolean(programId && programDayId && opts.userId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProgramDayFull(
  programDayId: string,
  opts: { userId?: string },
): UseQueryResult<ProgramDayFullResponse> {
  return useQuery({
    queryKey: queryKeys.programDayFull(programDayId, opts),
    queryFn: () => getProgramDayFull(programDayId, opts),
    enabled: Boolean(programDayId && opts.userId),
  });
}

export function useExerciseGuidance(
  exerciseId: string | null,
): UseQueryResult<ExerciseGuidance> {
  return useQuery({
    queryKey: queryKeys.exerciseGuidance(exerciseId ?? ""),
    queryFn: () => fetchExerciseGuidance(exerciseId as string),
    enabled: Boolean(exerciseId),
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useProgramCompletionSummary(
  programId: string | null,
): UseQueryResult<ProgramCompletionSummary> {
  return useQuery({
    queryKey: queryKeys.programCompletionSummary(programId ?? ""),
    queryFn: () => getProgramCompletionSummary(programId as string),
    enabled: Boolean(programId),
  });
}

export function useProgramEndCheck(
  programId: string | null,
): UseQueryResult<ProgramEndCheck> {
  return useQuery({
    queryKey: queryKeys.programEndCheck(programId ?? ""),
    queryFn: () => getProgramEndCheck(programId as string),
    enabled: Boolean(programId),
  });
}

export function useActivePrograms(): UseQueryResult<ActiveProgramsResponse> {
  return useQuery({
    queryKey: queryKeys.activePrograms,
    queryFn: fetchActivePrograms,
    staleTime: 60 * 1000,
  });
}

export function useCombinedCalendar(from?: string, to?: string): UseQueryResult<CombinedCalendarResponse> {
  return useQuery({
    queryKey: [...queryKeys.combinedCalendar, from ?? null, to ?? null],
    queryFn: () => fetchCombinedCalendar(from, to),
    staleTime: 60 * 1000,
  });
}

export function useSessionsByDate(
  scheduledDate: string | null,
): UseQueryResult<SessionsByDateResponse> {
  return useQuery({
    queryKey: ["sessionsByDate", scheduledDate ?? null],
    queryFn: () => fetchSessionsByDate(scheduledDate as string),
    enabled: Boolean(scheduledDate),
    staleTime: 60 * 1000,
  });
}

export function useSetPrimaryProgram(): UseMutationResult<
  { ok: boolean; primary_program_id: string },
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setPrimaryProgram,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.activePrograms });
      void queryClient.invalidateQueries({ queryKey: queryKeys.combinedCalendar });
    },
  });
}

const HISTORY_STALE_MS = 5 * 60 * 1000; // 5 minutes — history changes only after workout completion

export function useHistoryOverview(userId?: string): UseQueryResult<HistoryOverviewResponse> {
  return useQuery({
    queryKey: [...queryKeys.historyOverview, userId ?? null],
    queryFn: () => getHistoryOverview(userId),
    enabled: Boolean(userId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useHistoryPrograms(limit = 10, userId?: string): UseQueryResult<HistoryProgramItem[]> {
  return useQuery({
    queryKey: [...queryKeys.historyPrograms, userId ?? null],
    queryFn: () => getHistoryPrograms(limit, userId),
    enabled: Boolean(userId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useHistoryTimeline(
  limit = 40,
  userId?: string,
): UseInfiniteQueryResult<InfiniteData<HistoryTimelineResponse, HistoryTimelineCursor | null>, Error> {
  return useInfiniteQuery({
    queryKey: [...queryKeys.historyTimeline, userId ?? null],
    initialPageParam: null as HistoryTimelineCursor | null,
    queryFn: ({ pageParam }) =>
      getHistoryTimeline({
        limit,
        cursorDate: pageParam?.cursorDate ?? null,
        cursorId: pageParam?.cursorId ?? null,
        userId,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    enabled: Boolean(userId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useHistoryPersonalRecords(limit = 20, userId?: string): UseQueryResult<HistoryPersonalRecordItem[]> {
  return useQuery({
    queryKey: [...queryKeys.historyPersonalRecords, userId ?? null],
    queryFn: () => getHistoryPersonalRecords(limit, userId),
    enabled: Boolean(userId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useSessionHistoryMetrics(userId?: string): UseQueryResult<SessionHistoryMetrics> {
  return useQuery({
    queryKey: ["sessionHistoryMetrics", userId ?? null],
    queryFn: () => getSessionHistoryMetrics(userId),
    enabled: Boolean(userId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function usePrsFeed(userId?: string): UseQueryResult<PrsFeedResponse> {
  return useQuery({
    queryKey: ["prsFeed", userId ?? null],
    queryFn: () => getPrsFeed(userId),
    enabled: Boolean(userId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useNotificationPreferences(): UseQueryResult<NotificationPreferences> {
  return useQuery({
    queryKey: queryKeys.notificationPreferences,
    queryFn: getNotificationPreferences,
  });
}

export function useEntitlement(): UseQueryResult<EntitlementResponse> {
  return useQuery({
    queryKey: queryKeys.entitlement,
    queryFn: getEntitlement,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useUpdateNotificationPreferences(): UseMutationResult<
  NotificationPreferences,
  Error,
  Partial<NotificationPreferences>,
  { prev?: NotificationPreferences }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (patch) => updateNotificationPreferences(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.notificationPreferences });
      const prev = queryClient.getQueryData<NotificationPreferences>(queryKeys.notificationPreferences);
      queryClient.setQueryData<NotificationPreferences | undefined>(
        queryKeys.notificationPreferences,
        (old) => (old ? { ...old, ...patch } : old),
      );
      return { prev };
    },
    onError: (_error, _patch, context) => {
      queryClient.setQueryData(queryKeys.notificationPreferences, context?.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationPreferences });
    },
  });
}

export function useLoggedExercisesSearch(q: string, userId?: string): UseQueryResult<LoggedExerciseItem[]> {
  const term = q.trim();
  return useQuery({
    queryKey: ["loggedExercisesSearch", term, userId ?? null],
    queryFn: () => searchLoggedExercises(term, userId),
    enabled: term.length >= 2,
    staleTime: 30 * 1000,
  });
}

export function useExerciseSummary(
  exerciseId: string | null,
  userId?: string,
): UseQueryResult<ExerciseSummaryResponse> {
  return useQuery({
    queryKey: ["exerciseSummary", exerciseId ?? "", userId ?? null],
    queryFn: () => getExerciseSummary(exerciseId as string, userId),
    enabled: Boolean(exerciseId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useExerciseSearch(q: string, userId?: string): UseQueryResult<ExerciseSearchItem[]> {
  const term = q.trim();
  return useQuery({
    queryKey: [...queryKeys.exerciseSearch(term), userId ?? null],
    queryFn: () => searchExercises(term, userId),
    enabled: term.length >= 2,
    staleTime: 30 * 1000,
  });
}

export function useExerciseHistory(
  exerciseId: string | null,
  window: ExerciseHistoryWindow = "12w",
  userId?: string,
): UseQueryResult<ExerciseHistoryResponse> {
  return useQuery({
    queryKey: [...queryKeys.exerciseHistory(exerciseId ?? ""), window, userId ?? null],
    queryFn: () => fetchExerciseHistory(exerciseId as string, window, userId),
    enabled: Boolean(exerciseId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useMarkDayComplete(): UseMutationResult<
  void,
  Error,
  { programDayId: string; isCompleted: boolean; userId?: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ programDayId, isCompleted, userId }) =>
      markProgramDayComplete(programDayId, isCompleted, { userId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["programOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["dayPreview"] });
      void queryClient.invalidateQueries({ queryKey: ["programDayFull"] });
      void queryClient.invalidateQueries({ queryKey: ["programCompletionSummary"] });
      void queryClient.invalidateQueries({ queryKey: ["programEndCheck"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.historyOverview });
      void queryClient.invalidateQueries({ queryKey: queryKeys.historyTimeline });
      void queryClient.invalidateQueries({ queryKey: queryKeys.historyPrograms });
      void queryClient.invalidateQueries({ queryKey: queryKeys.historyPersonalRecords });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activePrograms });
      void queryClient.invalidateQueries({ queryKey: queryKeys.combinedCalendar });
      void queryClient.invalidateQueries({ queryKey: ["sessionsByDate"] });
      void queryClient.invalidateQueries({ queryKey: ["sessionHistoryMetrics"] });
      void queryClient.invalidateQueries({ queryKey: ["prsFeed"] });
    },
  });
}

export function useSegmentExerciseLogs(
  workoutSegmentId: string | null | undefined,
  programDayId: string,
  opts: { userId?: string },
): UseQueryResult<SegmentLogRow[]> {
  return useQuery({
    queryKey: queryKeys.segmentExerciseLogs(workoutSegmentId ?? "", programDayId),
    queryFn: () =>
      getSegmentExerciseLogs({
        userId: opts.userId,
        workoutSegmentId: workoutSegmentId as string,
        programDayId,
      }),
    enabled: Boolean(workoutSegmentId && programDayId),
    staleTime: 0,
  });
}

export function useCompleteProgram(): UseMutationResult<
  { ok: boolean; programId: string; lifecycleStatus: "in_progress" | "completed"; completedMode: "as_scheduled" | "with_skips" | null },
  Error,
  { programId: string; mode: "as_scheduled" | "with_skips" }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ programId, mode }) => completeProgram(programId, mode),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.programCompletionSummary(variables.programId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.programEndCheck(variables.programId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.activePrograms });
      void queryClient.invalidateQueries({ queryKey: queryKeys.combinedCalendar });
      void queryClient.invalidateQueries({ queryKey: ["sessionsByDate"] });
      void queryClient.invalidateQueries({ queryKey: ["programOverview"] });
    },
  });
}

export function useExerciseSwapOptions(
  programExerciseId: string | null,
): UseQueryResult<ExerciseSwapOptionsResponse> {
  return useQuery({
    queryKey: queryKeys.exerciseSwapOptions(programExerciseId ?? ""),
    queryFn: () => getExerciseSwapOptions(programExerciseId as string),
    enabled: Boolean(programExerciseId),
    staleTime: 0,
  });
}

export function useApplyExerciseSwap(): UseMutationResult<
  ApplyExerciseSwapResponse,
  Error,
  {
    programExerciseId: string;
    exerciseId: string;
    reason?: string | null;
    programDayId: string;
    userId?: string;
  }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ programExerciseId, exerciseId, reason }) =>
      applyExerciseSwap(programExerciseId, { exerciseId, reason }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.programDayFull(variables.programDayId, { userId: variables.userId }),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.exerciseSwapOptions(variables.programExerciseId),
      });
    },
  });
}

export function useSaveSegmentLogs(): UseMutationResult<void, Error, SaveSegmentLogPayload> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveSegmentExerciseLogs,
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.segmentExerciseLogs(
          variables.workoutSegmentId,
          variables.programDayId,
        ),
      });
    },
  });
}

export function usePhysiqueCheckIns(limit = 20): UseQueryResult<CheckInListResponse> {
  return useQuery({
    queryKey: [...queryKeys.physiqueCheckIns, limit],
    queryFn: () => getCheckIns(limit),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDeleteCheckIn(): UseMutationResult<{ ok: boolean }, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCheckIn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.physiqueCheckIns });
    },
  });
}
