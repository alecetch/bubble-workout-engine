import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchExerciseHistory,
  getExerciseSummary,
  searchExercises,
  searchLoggedExercises,
  type ExerciseHistoryResponse,
  type ExerciseHistoryWindow,
  type ExerciseSearchItem,
  type ExerciseSummaryResponse,
  type LoggedExerciseItem,
} from "../history";
import { HISTORY_STALE_MS, queryKeys } from "./shared";

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
