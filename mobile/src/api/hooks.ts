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
  getProgramDayFull,
  getProgramOverview,
  markProgramDayComplete,
  type ProgramDayFullResponse,
  type ProgramOverviewOptions,
  type ProgramOverviewResponse,
  type ViewerIdentityOptions,
} from "./programViewer";
import {
  getSegmentExerciseLogs,
  saveSegmentExerciseLogs,
  type SegmentLogRow,
  type SaveSegmentLogPayload,
} from "./segmentLog";
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
import type { EquipmentPreset } from "../state/onboarding/types";

export const queryKeys = {
  me: ["me"] as const,
  referenceData: ["referenceData"] as const,
  clientProfile: (profileId: string) => ["clientProfile", profileId] as const,
  equipmentItems: (presetCode: string | null) => ["equipmentItems", presetCode] as const,
  // selectedProgramDayId intentionally excluded — overview is static per program/user.
  // Selection state belongs to the UI layer only, not the cache key.
  programOverview: (programId: string, opts: { userId?: string | null; bubbleUserId?: string | null }) =>
    ["programOverview", programId, opts.userId ?? null, opts.bubbleUserId ?? null] as const,
  // Per-day preview: independent cache entry per selected day.
  dayPreview: (programId: string, programDayId: string, opts: { userId?: string | null; bubbleUserId?: string | null }) =>
    ["dayPreview", programId, programDayId, opts.userId ?? null, opts.bubbleUserId ?? null] as const,
  programDayFull: (programDayId: string, opts: ViewerIdentityOptions) =>
    ["programDayFull", programDayId, opts.userId ?? null, opts.bubbleUserId ?? null] as const,
  historyOverview: ["historyOverview"] as const,
  historyPrograms: ["historyPrograms"] as const,
  historyTimeline: ["historyTimeline"] as const,
  historyPersonalRecords: ["historyPersonalRecords"] as const,
  exerciseSearch: (q: string) => ["exerciseSearch", q] as const,
  exerciseHistory: (exerciseId: string) => ["exerciseHistory", exerciseId] as const,
  segmentExerciseLogs: (workoutSegmentId: string, programDayId: string) =>
    ["segmentExerciseLogs", workoutSegmentId, programDayId] as const,
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
  opts: { userId?: string; bubbleUserId?: string },
): UseQueryResult<ProgramOverviewResponse> {
  return useQuery({
    queryKey: queryKeys.programOverview(programId, opts),
    queryFn: () => getProgramOverview(programId, opts),
    enabled: Boolean(programId && (opts.bubbleUserId || opts.userId)),
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
  opts: { userId?: string; bubbleUserId?: string },
): UseQueryResult<ProgramOverviewResponse["selectedDayPreview"]> {
  return useQuery({
    queryKey: queryKeys.dayPreview(programId, programDayId ?? "", opts),
    queryFn: () => getProgramOverview(programId, { ...opts, selectedProgramDayId: programDayId }),
    select: (data) => data.selectedDayPreview,
    enabled: Boolean(programId && programDayId && (opts.bubbleUserId || opts.userId)),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProgramDayFull(
  programDayId: string,
  opts: { userId?: string; bubbleUserId?: string },
): UseQueryResult<ProgramDayFullResponse> {
  return useQuery({
    queryKey: queryKeys.programDayFull(programDayId, opts),
    queryFn: () => getProgramDayFull(programDayId, opts),
    enabled: Boolean(programDayId && (opts.bubbleUserId || opts.userId)),
  });
}

const HISTORY_STALE_MS = 5 * 60 * 1000; // 5 minutes — history changes only after workout completion

export function useHistoryOverview(bubbleUserId?: string): UseQueryResult<HistoryOverviewResponse> {
  return useQuery({
    queryKey: [...queryKeys.historyOverview, bubbleUserId ?? null],
    queryFn: () => getHistoryOverview(bubbleUserId),
    enabled: Boolean(bubbleUserId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useHistoryPrograms(limit = 10, bubbleUserId?: string): UseQueryResult<HistoryProgramItem[]> {
  return useQuery({
    queryKey: [...queryKeys.historyPrograms, bubbleUserId ?? null],
    queryFn: () => getHistoryPrograms(limit, bubbleUserId),
    enabled: Boolean(bubbleUserId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useHistoryTimeline(
  limit = 40,
  bubbleUserId?: string,
): UseInfiniteQueryResult<InfiniteData<HistoryTimelineResponse, HistoryTimelineCursor | null>, Error> {
  return useInfiniteQuery({
    queryKey: [...queryKeys.historyTimeline, bubbleUserId ?? null],
    initialPageParam: null as HistoryTimelineCursor | null,
    queryFn: ({ pageParam }) =>
      getHistoryTimeline({
        limit,
        cursorDate: pageParam?.cursorDate ?? null,
        cursorId: pageParam?.cursorId ?? null,
        bubbleUserId,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
    enabled: Boolean(bubbleUserId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useHistoryPersonalRecords(limit = 20, bubbleUserId?: string): UseQueryResult<HistoryPersonalRecordItem[]> {
  return useQuery({
    queryKey: [...queryKeys.historyPersonalRecords, bubbleUserId ?? null],
    queryFn: () => getHistoryPersonalRecords(limit, bubbleUserId),
    enabled: Boolean(bubbleUserId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useSessionHistoryMetrics(bubbleUserId?: string): UseQueryResult<SessionHistoryMetrics> {
  return useQuery({
    queryKey: ["sessionHistoryMetrics", bubbleUserId ?? null],
    queryFn: () => getSessionHistoryMetrics(bubbleUserId),
    enabled: Boolean(bubbleUserId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function usePrsFeed(bubbleUserId?: string): UseQueryResult<PrsFeedResponse> {
  return useQuery({
    queryKey: ["prsFeed", bubbleUserId ?? null],
    queryFn: () => getPrsFeed(bubbleUserId),
    enabled: Boolean(bubbleUserId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useLoggedExercisesSearch(q: string, bubbleUserId?: string): UseQueryResult<LoggedExerciseItem[]> {
  const term = q.trim();
  return useQuery({
    queryKey: ["loggedExercisesSearch", term, bubbleUserId ?? null],
    queryFn: () => searchLoggedExercises(term, bubbleUserId),
    enabled: term.length >= 2,
    staleTime: 30 * 1000,
  });
}

export function useExerciseSummary(
  exerciseId: string | null,
  bubbleUserId?: string,
): UseQueryResult<ExerciseSummaryResponse> {
  return useQuery({
    queryKey: ["exerciseSummary", exerciseId ?? "", bubbleUserId ?? null],
    queryFn: () => getExerciseSummary(exerciseId as string, bubbleUserId),
    enabled: Boolean(exerciseId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useExerciseSearch(q: string, bubbleUserId?: string): UseQueryResult<ExerciseSearchItem[]> {
  const term = q.trim();
  return useQuery({
    queryKey: [...queryKeys.exerciseSearch(term), bubbleUserId ?? null],
    queryFn: () => searchExercises(term, bubbleUserId),
    enabled: term.length >= 2,
    staleTime: 30 * 1000,
  });
}

export function useExerciseHistory(exerciseId: string | null, bubbleUserId?: string): UseQueryResult<ExerciseHistoryResponse> {
  return useQuery({
    queryKey: [...queryKeys.exerciseHistory(exerciseId ?? ""), bubbleUserId ?? null],
    queryFn: () => fetchExerciseHistory(exerciseId as string, bubbleUserId),
    enabled: Boolean(exerciseId),
    staleTime: HISTORY_STALE_MS,
  });
}

export function useMarkDayComplete(): UseMutationResult<
  void,
  Error,
  { programDayId: string; isCompleted: boolean; bubbleUserId?: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ programDayId, isCompleted, bubbleUserId }) =>
      markProgramDayComplete(programDayId, isCompleted, { bubbleUserId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.historyOverview });
      void queryClient.invalidateQueries({ queryKey: queryKeys.historyTimeline });
      void queryClient.invalidateQueries({ queryKey: queryKeys.historyPrograms });
      void queryClient.invalidateQueries({ queryKey: queryKeys.historyPersonalRecords });
      void queryClient.invalidateQueries({ queryKey: ["sessionHistoryMetrics"] });
      void queryClient.invalidateQueries({ queryKey: ["prsFeed"] });
    },
  });
}

export function useSegmentExerciseLogs(
  workoutSegmentId: string | null | undefined,
  programDayId: string,
  opts: { bubbleUserId?: string },
): UseQueryResult<SegmentLogRow[]> {
  return useQuery({
    queryKey: queryKeys.segmentExerciseLogs(workoutSegmentId ?? "", programDayId),
    queryFn: () =>
      getSegmentExerciseLogs({
        bubbleUserId: opts.bubbleUserId,
        workoutSegmentId: workoutSegmentId as string,
        programDayId,
      }),
    enabled: Boolean(workoutSegmentId && programDayId),
    staleTime: 0,
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
