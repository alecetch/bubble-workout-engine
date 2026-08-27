import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  deleteCheckIn,
  getCheckIns,
  type CheckInListResponse,
} from "../physique";
import {
  deleteScan,
  getMilestones,
  getScans,
  getScanTrend,
  submitScan,
  type ScanResult,
} from "../physiqueScan";
import { queryKeys } from "./shared";

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

export function useDeleteScan(): UseMutationResult<{ ok: boolean }, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteScan,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.physiqueScans });
      void queryClient.invalidateQueries({ queryKey: queryKeys.physiqueScanTrend });
      void queryClient.invalidateQueries({ queryKey: queryKeys.physiqueMilestones });
    },
  });
}

export function useSubmitScan(): UseMutationResult<ScanResult, Error, string> {
  return useMutation({
    mutationFn: submitScan,
  });
}

export function usePhysiqueScans(limit = 20) {
  return useQuery({
    queryKey: [...queryKeys.physiqueScans, limit],
    queryFn: () => getScans(limit),
    // No staleTime - presigned photo URLs expire after 1 hour so we always
    // background-refetch on mount to serve fresh signed URLs.
  });
}

export function usePhysiqueScanTrend() {
  return useQuery({
    queryKey: queryKeys.physiqueScanTrend,
    queryFn: getScanTrend,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePhysiqueMilestones() {
  return useQuery({
    queryKey: queryKeys.physiqueMilestones,
    queryFn: getMilestones,
    staleTime: 5 * 60 * 1000,
  });
}
