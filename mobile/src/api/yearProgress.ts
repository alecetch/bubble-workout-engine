import { authGetJson } from "./client";
import { deviceTimeZone } from "../utils/localDate";

export type YearProgressResponse = {
  ok: boolean;
  year: number;
  today_local: string;
  count: number;
  target: number;
  pro_rated: boolean;
  window_start: string;
  window_end: string;
  expected_to_date: number;
  pace_delta: number;
  pace_status: "ahead" | "on_pace" | "behind";
  projected_year_end: number;
  clubs: Array<{ tier: number; threshold: number; reached_on: string | null }>;
  next_milestone: number | null;
  training_dates: string[];
  years: Array<{ year: number; count: number; target: number; best_club: number | null }>;
};

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown, fallback = 0): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const string = (value: unknown): string => typeof value === "string" ? value : "";
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function normalizeYearProgress(raw: unknown): YearProgressResponse {
  const root = object(raw);
  return {
    ok: root.ok === true, year: number(root.year), today_local: string(root.today_local),
    count: number(root.count), target: number(root.target), pro_rated: root.pro_rated === true,
    window_start: string(root.window_start), window_end: string(root.window_end),
    expected_to_date: number(root.expected_to_date), pace_delta: number(root.pace_delta),
    pace_status: root.pace_status === "ahead" || root.pace_status === "behind" ? root.pace_status : "on_pace",
    projected_year_end: number(root.projected_year_end),
    clubs: array(root.clubs).map(value => { const row = object(value); return {
      tier: number(row.tier), threshold: number(row.threshold), reached_on: string(row.reached_on) || null,
    }; }),
    next_milestone: typeof root.next_milestone === "number" ? number(root.next_milestone) : null,
    training_dates: array(root.training_dates).filter((value): value is string => typeof value === "string"),
    years: array(root.years).map(value => { const row = object(value); return {
      year: number(row.year), count: number(row.count), target: number(row.target),
      best_club: typeof row.best_club === "number" ? number(row.best_club) : null,
    }; }),
  };
}

export async function getYearProgress(year?: number): Promise<YearProgressResponse> {
  const params = new URLSearchParams({ timezone: deviceTimeZone() });
  if (year !== undefined) params.set("year", String(year));
  return normalizeYearProgress(await authGetJson<unknown>(`/api/users/me/year-progress?${params}`));
}
