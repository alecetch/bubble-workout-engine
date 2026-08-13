import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { authGetJson, authPatchJson } from "../client";
import {
  createClientProfile,
  getClientProfile,
  updateClientProfile,
  type ClientProfileServer,
  type CreateClientProfileInput,
  type UpdateClientProfileInput,
} from "../clientProfiles";
import { getEquipmentItemsForPreset, type EquipmentItemsForPresetResponse } from "../equipmentPresets";
import { getMe, linkClientProfileToMe, type MeResponse } from "../me";
import {
  fetchActivePrograms,
  fetchCombinedCalendar,
  fetchSessionsByDate,
  setPrimaryProgram,
  type ActiveProgramsResponse,
  type CombinedCalendarResponse,
  type SessionsByDateResponse,
} from "../activePrograms";
import {
  getProgramDayFull,
  getProgramOverview,
  markProgramDayComplete,
  type ProgramDayFullResponse,
  type ProgramOverviewResponse,
} from "../programViewer";
import { fetchExerciseGuidance, type ExerciseGuidance } from "../exerciseGuidance";
import {
  getProgramEquipment,
  regenerateProgramDays,
  type ProgramEquipmentState,
  type RegenerateDaysResult,
} from "../equipmentRegen";
import {
  completeProgram,
  getProgramCompletionSummary,
  getProgramEndCheck,
  type ProgramCompletionSummary,
  type ProgramEndCheck,
} from "../programCompletion";
import {
  getSegmentExerciseLogs,
  saveSegmentExerciseLogs,
  type SaveSegmentLogPayload,
  type SaveSegmentLogResult,
  type SegmentLogRow,
} from "../segmentLog";
import {
  applyExerciseSwap,
  getExerciseSwapOptions,
  type ApplyExerciseSwapResponse,
  type ExerciseSwapOptionsResponse,
} from "../programExercise";
import { getReferenceData, type ReferenceDataResponse } from "../referenceData";
import type { EquipmentPreset } from "../../state/onboarding/types";
import { queryKeys } from "./shared";

export type SplitRecommendationResponse = {
  programType: string;
  daysPerWeek: number;
  recommendation: string[];
  existingPreference: string[] | null;
  existingModifiedByUser: boolean;
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

export function useSplitRecommendation(
  params?: { daysPerWeek?: number; programType?: string },
): UseQueryResult<SplitRecommendationResponse> {
  const qs = new URLSearchParams();
  if (params?.daysPerWeek) qs.set("daysPerWeek", String(params.daysPerWeek));
  if (params?.programType) qs.set("programType", params.programType);
  const search = qs.toString();
  const url = search ? `/api/split-recommendation?${search}` : "/api/split-recommendation";
  return useQuery({
    queryKey: [...queryKeys.splitRecommendation, params?.daysPerWeek, params?.programType],
    queryFn: () => authGetJson<SplitRecommendationResponse>(url),
    staleTime: 0,
  });
}

export function patchProgramSplit(
  programId: string,
  dayFocuses: string[],
): Promise<{ ok: boolean; updatedCount: number }> {
  return authPatchJson<{ ok: boolean; updatedCount: number }, { day_focuses: string[] }>(
    `/api/programs/${programId}/split`,
    { day_focuses: dayFocuses },
  );
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

export function useProgramEquipment(
  programId: string | null,
): UseQueryResult<ProgramEquipmentState> {
  return useQuery({
    queryKey: queryKeys.programEquipment(programId),
    queryFn: () => getProgramEquipment(programId as string),
    enabled: Boolean(programId),
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

export function useSaveSegmentLogs(): UseMutationResult<SaveSegmentLogResult, Error, SaveSegmentLogPayload> {
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

export function useRegenerateDays(
  programId: string,
): UseMutationResult<
  RegenerateDaysResult,
  Error,
  Parameters<typeof regenerateProgramDays>[1]
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => regenerateProgramDays(programId, payload),
    onSuccess: (result) => {
      for (const dayId of result.dayIds) {
        void queryClient.invalidateQueries({
          queryKey: ["programDayFull", dayId],
        });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.programEquipment(programId) });
      void queryClient.invalidateQueries({ queryKey: ["programOverview"] });
      void queryClient.invalidateQueries({ queryKey: ["dayPreview"] });
    },
  });
}
