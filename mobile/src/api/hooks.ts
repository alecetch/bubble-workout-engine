import {
  useMutation,
  useQuery,
  useQueryClient,
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
import { getEquipmentItemsForPreset, type EquipmentItemOption } from "./equipmentPresets";
import { getMe, linkClientProfileToMe, type MeResponse } from "./me";
import { getReferenceData, type ReferenceDataResponse } from "./referenceData";
import type { EquipmentPreset } from "../state/onboarding/types";

const queryKeys = {
  me: ["me"] as const,
  referenceData: ["referenceData"] as const,
  clientProfile: (profileId: string) => ["clientProfile", profileId] as const,
  equipmentItemsForPreset: (preset: EquipmentPreset | null) => ["equipmentItemsForPreset", preset] as const,
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

export function useEquipmentItemsForPreset(
  preset: EquipmentPreset | null,
): UseQueryResult<EquipmentItemOption[]> {
  return useQuery({
    queryKey: queryKeys.equipmentItemsForPreset(preset),
    queryFn: () => getEquipmentItemsForPreset(preset as EquipmentPreset),
    enabled: Boolean(preset),
  });
}
