import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  getHistoryOverview,
  getHistoryPersonalRecords,
  getHistoryPrograms,
  getHistoryTimeline,
  getPrsFeed,
  getSessionHistoryMetrics,
  type HistoryOverviewResponse,
  type HistoryPersonalRecordItem,
  type HistoryProgramItem,
  type HistoryTimelineCursor,
  type HistoryTimelineResponse,
  type PrsFeedResponse,
  type SessionHistoryMetrics,
} from "../history";
import { HISTORY_STALE_MS, queryKeys } from "./shared";

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
