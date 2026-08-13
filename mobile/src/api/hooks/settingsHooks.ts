import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { getEntitlement, type EntitlementResponse } from "../entitlement";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "../notifications";
import { queryKeys } from "./shared";

export function useNotificationPreferences(): UseQueryResult<NotificationPreferences> {
  return useQuery({
    queryKey: queryKeys.notificationPreferences,
    queryFn: getNotificationPreferences,
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

export function useEntitlement(): UseQueryResult<EntitlementResponse> {
  return useQuery({
    queryKey: queryKeys.entitlement,
    queryFn: getEntitlement,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
