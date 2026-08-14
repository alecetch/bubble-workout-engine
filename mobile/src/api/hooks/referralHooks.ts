import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchReferralInfo,
  fetchReferralStats,
  type ReferralInfo,
  type ReferralStats,
} from "../referral";
import { queryKeys } from "./shared";

export function useReferralInfo(): UseQueryResult<ReferralInfo> {
  return useQuery({
    queryKey: queryKeys.referralInfo,
    queryFn: fetchReferralInfo,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useReferralStats(): UseQueryResult<ReferralStats> {
  return useQuery({
    queryKey: queryKeys.referralStats,
    queryFn: fetchReferralStats,
    staleTime: 5 * 60 * 1000,
  });
}
