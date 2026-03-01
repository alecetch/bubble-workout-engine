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
  type ProgramDayFullResponse,
  type ProgramOverviewOptions,
  type ProgramOverviewResponse,
  type ViewerIdentityOptions,
} from "./programViewer";
import { getReferenceData, type ReferenceDataResponse } from "./referenceData";
import {
  fetchExerciseHistory,
  getHistoryOverview,
  getHistoryPersonalRecords,
  getHistoryPrograms,
  getHistoryTimeline,
  searchExercises,
  type ExerciseHistoryResponse,
  type ExerciseSearchItem,
  type HistoryOverviewResponse,
  type HistoryPersonalRecordItem,
  type HistoryProgramItem,
  type HistoryTimelineCursor,
  type HistoryTimelineResponse,
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

export function useHistoryOverview(): UseQueryResult<HistoryOverviewResponse> {
  return useQuery({
    queryKey: queryKeys.historyOverview,
    queryFn: getHistoryOverview,
  });
}

export function useHistoryPrograms(limit = 10): UseQueryResult<HistoryProgramItem[]> {
  return useQuery({
    queryKey: queryKeys.historyPrograms,
    queryFn: () => getHistoryPrograms(limit),
  });
}

export function useHistoryTimeline(
  limit = 40,
): UseInfiniteQueryResult<InfiniteData<HistoryTimelineResponse, HistoryTimelineCursor | null>, Error> {
  return useInfiniteQuery({
    queryKey: queryKeys.historyTimeline,
    initialPageParam: null as HistoryTimelineCursor | null,
    queryFn: ({ pageParam }) =>
      getHistoryTimeline({
        limit,
        cursorDate: pageParam?.cursorDate ?? null,
        cursorId: pageParam?.cursorId ?? null,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,
  });
}

export function useHistoryPersonalRecords(limit = 20): UseQueryResult<HistoryPersonalRecordItem[]> {
  return useQuery({
    queryKey: queryKeys.historyPersonalRecords,
    queryFn: () => getHistoryPersonalRecords(limit),
  });
}

export function useExerciseSearch(q: string): UseQueryResult<ExerciseSearchItem[]> {
  const term = q.trim();
  return useQuery({
    queryKey: queryKeys.exerciseSearch(term),
    queryFn: () => searchExercises(term),
    enabled: term.length >= 2,
  });
}

export function useExerciseHistory(exerciseId: string | null): UseQueryResult<ExerciseHistoryResponse> {
  return useQuery({
    queryKey: queryKeys.exerciseHistory(exerciseId ?? ""),
    queryFn: () => fetchExerciseHistory(exerciseId as string),
    enabled: Boolean(exerciseId),
  });
}
