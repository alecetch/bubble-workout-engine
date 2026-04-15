import { authGetJson, authPatchJson } from "./client";

export interface ActiveProgramSummary {
  program_id: string;
  program_title: string;
  program_type: string;
  is_primary: boolean;
  status: string;
  weeks_count: number;
  days_per_week: number;
  start_date: string;
  hero_media_id: string | null;
  today_session_count: number;
  next_session_date: string | null;
}

export interface TodaySession {
  program_id: string;
  program_day_id: string;
  program_title: string;
  program_type: string;
  day_label: string;
  scheduled_date: string;
}

export interface ActiveProgramsResponse {
  ok: boolean;
  primary_program_id: string | null;
  programs: ActiveProgramSummary[];
  today_sessions: TodaySession[];
}

export interface CalendarSession {
  program_id: string;
  program_day_id: string;
  program_type: string;
  program_title: string;
  is_primary_program: boolean;
  day_label: string;
  is_completed: boolean;
}

export interface CalendarDay {
  scheduled_date: string;
  sessions: CalendarSession[];
}

export interface CombinedCalendarResponse {
  ok: boolean;
  days: CalendarDay[];
}

export interface SessionsByDateItem {
  program_id: string;
  program_day_id: string;
  program_title: string;
  program_type: string;
  is_primary_program: boolean;
  day_label: string;
  session_duration_mins: number | null;
  is_completed: boolean;
}

export interface SessionsByDateResponse {
  ok: boolean;
  scheduled_date: string;
  sessions: SessionsByDateItem[];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeActivePrograms(raw: unknown): ActiveProgramsResponse {
  const root = asObject(raw);
  return {
    ok: asBoolean(root.ok, true),
    primary_program_id: asNullableString(root.primary_program_id),
    programs: asArray(root.programs).map((item) => {
      const row = asObject(item);
      return {
        program_id: asString(row.program_id),
        program_title: asString(row.program_title),
        program_type: asString(row.program_type),
        is_primary: asBoolean(row.is_primary),
        status: asString(row.status),
        weeks_count: asNumber(row.weeks_count),
        days_per_week: asNumber(row.days_per_week),
        start_date: asString(row.start_date),
        hero_media_id: asNullableString(row.hero_media_id),
        today_session_count: asNumber(row.today_session_count),
        next_session_date: asNullableString(row.next_session_date),
      };
    }),
    today_sessions: asArray(root.today_sessions).map((item) => {
      const row = asObject(item);
      return {
        program_id: asString(row.program_id),
        program_day_id: asString(row.program_day_id),
        program_title: asString(row.program_title),
        program_type: asString(row.program_type),
        day_label: asString(row.day_label),
        scheduled_date: asString(row.scheduled_date),
      };
    }),
  };
}

function normalizeCombinedCalendar(raw: unknown): CombinedCalendarResponse {
  const root = asObject(raw);
  return {
    ok: asBoolean(root.ok, true),
    days: asArray(root.days).map((item) => {
      const row = asObject(item);
      return {
        scheduled_date: asString(row.scheduled_date),
        sessions: asArray(row.sessions).map((session) => {
          const value = asObject(session);
          return {
            program_id: asString(value.program_id),
            program_day_id: asString(value.program_day_id),
            program_type: asString(value.program_type),
            program_title: asString(value.program_title),
            is_primary_program: asBoolean(value.is_primary_program),
            day_label: asString(value.day_label),
            is_completed: asBoolean(value.is_completed),
          };
        }),
      };
    }),
  };
}

function normalizeSessionsByDate(raw: unknown): SessionsByDateResponse {
  const root = asObject(raw);
  return {
    ok: asBoolean(root.ok, true),
    scheduled_date: asString(root.scheduled_date),
    sessions: asArray(root.sessions).map((item) => {
      const row = asObject(item);
      return {
        program_id: asString(row.program_id),
        program_day_id: asString(row.program_day_id),
        program_title: asString(row.program_title),
        program_type: asString(row.program_type),
        is_primary_program: asBoolean(row.is_primary_program),
        day_label: asString(row.day_label),
        session_duration_mins: row.session_duration_mins == null ? null : asNumber(row.session_duration_mins),
        is_completed: asBoolean(row.is_completed),
      };
    }),
  };
}

export async function fetchActivePrograms(): Promise<ActiveProgramsResponse> {
  const raw = await authGetJson<unknown>("/api/programs/active");
  return normalizeActivePrograms(raw);
}

export async function fetchCombinedCalendar(from?: string, to?: string): Promise<CombinedCalendarResponse> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString() ? `?${params.toString()}` : "";
  const raw = await authGetJson<unknown>(`/api/calendar/combined${qs}`);
  return normalizeCombinedCalendar(raw);
}

export async function fetchSessionsByDate(scheduledDate: string): Promise<SessionsByDateResponse> {
  const raw = await authGetJson<unknown>(`/api/sessions/by-date/${scheduledDate}`);
  return normalizeSessionsByDate(raw);
}

export async function setPrimaryProgram(
  programId: string,
): Promise<{ ok: boolean; primary_program_id: string }> {
  return authPatchJson<{ ok: boolean; primary_program_id: string }, Record<string, never>>(
    `/api/program/${programId}/primary`,
    {},
  );
}
