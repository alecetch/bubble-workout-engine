import { authGetJson } from "./client";
import { deviceTimeZone } from "../utils/localDate";

export type YearRecap = {
  ok: true; year: number; count: number; target: number; pro_rated: boolean; best_club: number | null;
  best_month: { month: number; count: number } | null; busiest_weekday: string | null; longest_on_pace_weeks: number;
  sessions_count: number; personal_records_count: number; first_training_date: string | null;
  milestones: Array<{ slug: string; reached_on: string }>;
  training_dates: string[]; today_local: string; window_start: string; window_end: string;
};
export function getYearRecap(year: number): Promise<YearRecap> {
  const params = new URLSearchParams({ year: String(year), timezone: deviceTimeZone() });
  return authGetJson(`/api/users/me/year-recap?${params}`);
}
