import { authGetJson } from "./client";
export type {
  ExerciseHistoryPoint,
  ExerciseHistoryResponse,
  ExerciseHistoryWindow,
  ExerciseSearchItem,
  ExerciseSummaryLift,
  ExerciseSummaryResponse,
  HeaviestLift,
  HistoryOverviewResponse,
  HistoryPersonalRecordItem,
  HistoryProgramItem,
  HistoryTimelineCursor,
  HistoryTimelineItem,
  HistoryTimelineResponse,
  LoggedExerciseItem,
  PrsFeedResponse,
  PrsFeedRow,
  SessionHistoryMetrics,
  SessionHistoryStrengthRegion,
  WeeklyVolumeByRegion8w,
  WeeklyVolumePoint,
} from "./historyNormalizers";
import {
  normalizeExerciseHistory,
  normalizeExerciseSearch,
  normalizeExerciseSummary,
  normalizeLoggedExercises,
  normalizeOverview,
  normalizePersonalRecords,
  normalizePrograms,
  normalizePrsFeed,
  normalizeSessionHistoryMetrics,
  normalizeTimeline,
} from "./historyNormalizers";
import type {
  ExerciseHistoryResponse,
  ExerciseHistoryWindow,
  ExerciseSearchItem,
  ExerciseSummaryResponse,
  HistoryOverviewResponse,
  HistoryPersonalRecordItem,
  HistoryProgramItem,
  HistoryTimelineResponse,
  LoggedExerciseItem,
  PrsFeedResponse,
  SessionHistoryMetrics,
} from "./historyNormalizers";

export {
  normalizeSessionHistoryMetrics,
  normalizeWeeklyVolumeByRegion,
  normalizeWeeklyVolumePoint,
} from "./historyNormalizers";

export async function getHistoryOverview(
  userId?: string,
): Promise<HistoryOverviewResponse> {
  const params = new URLSearchParams();
  if (userId) params.set("user_id", userId);
  const qs = params.toString();
  const raw = await authGetJson<unknown>(`/api/v1/history/overview${qs ? `?${qs}` : ""}`);
  return normalizeOverview(raw);
}

export async function getHistoryPrograms(
  limit = 10,
  userId?: string,
): Promise<HistoryProgramItem[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (userId) params.set("user_id", userId);
  const raw = await authGetJson<unknown>(`/api/v1/history/programs?${params.toString()}`);
  return normalizePrograms(raw);
}

export type GetHistoryTimelineOptions = {
  limit?: number;
  cursorDate?: string | null;
  cursorId?: string | null;
  userId?: string;
};

export async function getHistoryTimeline(
  options: GetHistoryTimelineOptions = {},
): Promise<HistoryTimelineResponse> {
  const limit = options.limit ?? 40;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (options.cursorDate && options.cursorId) {
    params.set("cursorDate", options.cursorDate);
    params.set("cursorId", options.cursorId);
  }
  if (options.userId) params.set("user_id", options.userId);

  const raw = await authGetJson<unknown>(`/api/v1/history/timeline?${params.toString()}`);
  return normalizeTimeline(raw);
}

export async function getHistoryPersonalRecords(
  limit = 20,
  userId?: string,
): Promise<HistoryPersonalRecordItem[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (userId) params.set("user_id", userId);
  const raw = await authGetJson<unknown>(`/api/v1/history/personal-records?${params.toString()}`);
  return normalizePersonalRecords(raw);
}

export async function searchExercises(
  q: string,
  userId?: string,
): Promise<ExerciseSearchItem[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const params = new URLSearchParams();
  params.set("q", term);
  if (userId) params.set("user_id", userId);
  const raw = await authGetJson<unknown>(`/api/logged-exercises/search?${params.toString()}`);
  return normalizeExerciseSearch(raw);
}

export async function fetchExerciseHistory(
  exerciseId: string,
  window: ExerciseHistoryWindow = "12w",
  userId?: string,
): Promise<ExerciseHistoryResponse> {
  const params = new URLSearchParams();
  params.set("window", window);
  params.set("include_decisions", "true");
  if (userId) params.set("user_id", userId);
  const raw = await authGetJson<unknown>(
    `/api/v1/history/exercise/${encodeURIComponent(exerciseId)}?${params.toString()}`,
  );
  return normalizeExerciseHistory(raw);
}

export async function getSessionHistoryMetrics(
  userId?: string,
): Promise<SessionHistoryMetrics> {
  const params = new URLSearchParams();
  if (userId) params.set("user_id", userId);
  const qs = params.toString();
  const raw = await authGetJson<unknown>(`/api/session-history-metrics${qs ? `?${qs}` : ""}`);
  return normalizeSessionHistoryMetrics(raw);
}

export async function getPrsFeed(
  userId?: string,
): Promise<PrsFeedResponse> {
  const params = new URLSearchParams();
  if (userId) params.set("user_id", userId);
  const qs = params.toString();
  const raw = await authGetJson<unknown>(`/api/prs-feed${qs ? `?${qs}` : ""}`);
  return normalizePrsFeed(raw);
}

export async function searchLoggedExercises(
  q: string,
  userId?: string,
): Promise<LoggedExerciseItem[]> {
  const term = q.trim();
  if (term.length < 2) return [];

  const params = new URLSearchParams();
  params.set("q", term);
  if (userId) params.set("user_id", userId);
  const raw = await authGetJson<unknown>(`/api/logged-exercises/search?${params.toString()}`);
  return normalizeLoggedExercises(raw);
}

export async function getExerciseSummary(
  exerciseId: string,
  userId?: string,
): Promise<ExerciseSummaryResponse> {
  const params = new URLSearchParams();
  params.set("exercise_id", exerciseId);
  if (userId) params.set("user_id", userId);
  const raw = await authGetJson<unknown>(`/api/exercise-summary?${params.toString()}`);
  return normalizeExerciseSummary(raw);
}
