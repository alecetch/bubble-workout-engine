import { authDeleteJson, authGetJson, authPostJson } from "./client";
import type { YearMilestone } from "./yearProgress";

export const OUTSIDE_ACTIVITIES = [
  { value: "run", label: "Run", icon: "walk-outline" },
  { value: "cycle", label: "Cycle", icon: "bicycle-outline" },
  { value: "swim", label: "Swim", icon: "water-outline" },
  { value: "class", label: "Class", icon: "people-outline" },
  { value: "hyrox", label: "HYROX", icon: "barbell-outline" },
  { value: "sport", label: "Sport", icon: "football-outline" },
  { value: "strength_elsewhere", label: "Strength elsewhere", icon: "fitness-outline" },
  { value: "other", label: "Other", icon: "body-outline" },
] as const;
export type OutsideActivity = typeof OUTSIDE_ACTIVITIES[number]["value"];
export type OutsideSession = { id: string; local_date: string; activity_type: OutsideActivity; duration_min: number };
export type OutsideSessionInput = { activity_type: OutsideActivity; duration_min: number; local_date: string; timezone: string };
export type OutsideSessionResult = { ok: boolean; session: OutsideSession;
  year_progress: { year: number; count: number; target: number }; new_milestones?: YearMilestone[] };

export function logOutsideSession(input: OutsideSessionInput): Promise<OutsideSessionResult> {
  return authPostJson("/api/users/me/training-sessions", input);
}
export async function getOutsideSessions(year?: number): Promise<OutsideSession[]> {
  const params = new URLSearchParams({ source: "manual" });
  if (year !== undefined) params.set("year", String(year));
  const response = await authGetJson<{ sessions: OutsideSession[] }>(`/api/users/me/training-sessions?${params}`);
  return response.sessions;
}
export async function deleteOutsideSession(id: string): Promise<void> {
  await authDeleteJson(`/api/users/me/training-sessions/${encodeURIComponent(id)}`);
}
