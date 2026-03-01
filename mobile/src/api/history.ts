import { engineFetch } from "./client";

export type HistoryOverviewResponse = {
  sessionsCompleted: number;
  trainingHoursCompleted: number;
  currentStreakDays: number;
  programsCompleted: number;
  strengthTrend28d: {
    value: number | null;
    delta: number | null;
  };
  volumeTrend28d: {
    value: number | null;
    delta: number | null;
  };
  consistency30d: {
    value: number;
    delta: number | null;
  };
};

export type HistoryProgramItem = {
  programId: string;
  programTitle: string;
  startDate: string;
  completionRatio: number;
  heroMediaId: string | null;
};

export type HistoryTimelineCursor = {
  cursorDate: string;
  cursorId: string;
};

export type HistoryTimelineItem = {
  programDayId: string;
  scheduledDate: string;
  dayLabel: string;
  durationMins: number;
  heroMediaId: string | null;
  highlight:
    | {
        value: number;
        exerciseName: string;
      }
    | null;
};

export type HistoryTimelineResponse = {
  items: HistoryTimelineItem[];
  nextCursor: HistoryTimelineCursor | null;
};

export type HistoryPersonalRecordItem = {
  exerciseId: string;
  exerciseName: string;
  metric: "weight_kg";
  value: number;
  date: string;
  programDayId: string;
};

export type ExerciseSearchItem = {
  exerciseId: string;
  name: string;
};

export type ExerciseHistoryPoint = {
  date: string;
  topWeightKg: number | null;
  tonnage: number | null;
  topReps: number | null;
};

export type ExerciseHistoryResponse = {
  exerciseId: string;
  exerciseName: string;
  series: ExerciseHistoryPoint[];
  summary: {
    lastPerformed: string | null;
    bestWeightKg: number | null;
    sessionsCount: number;
  };
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  return asString(value);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toDateOnly(value: unknown): string {
  return asString(value).slice(0, 10);
}

function normalizeOverview(raw: unknown): HistoryOverviewResponse {
  const root = asObject(raw);
  const strengthTrend28d = asObject(root.strengthTrend28d);
  const volumeTrend28d = asObject(root.volumeTrend28d);
  const consistency30d = asObject(root.consistency30d);

  return {
    sessionsCompleted: asNumber(root.sessionsCompleted, 0),
    trainingHoursCompleted: asNumber(root.trainingHoursCompleted, 0),
    currentStreakDays: asNumber(root.currentStreakDays, 0),
    programsCompleted: asNumber(root.programsCompleted, 0),
    strengthTrend28d: {
      value: asNullableNumber(strengthTrend28d.value),
      delta: asNullableNumber(strengthTrend28d.delta),
    },
    volumeTrend28d: {
      value: asNullableNumber(volumeTrend28d.value),
      delta: asNullableNumber(volumeTrend28d.delta),
    },
    consistency30d: {
      value: asNumber(consistency30d.value, 0),
      delta: asNullableNumber(consistency30d.delta),
    },
  };
}

function normalizePrograms(raw: unknown): HistoryProgramItem[] {
  return asArray(raw).map((item) => {
    const program = asObject(item);
    return {
      programId: asString(program.programId),
      programTitle: asString(program.programTitle, "Training Program"),
      startDate: toDateOnly(program.startDate),
      completionRatio: asNumber(program.completionRatio, 0),
      heroMediaId: asNullableString(program.heroMediaId),
    };
  });
}

function normalizeTimeline(raw: unknown): HistoryTimelineResponse {
  const root = asObject(raw);
  const nextCursorRaw = root.nextCursor == null ? null : asObject(root.nextCursor);

  const items = asArray(root.items).map((item) => {
    const row = asObject(item);
    const highlightRaw = row.highlight == null ? null : asObject(row.highlight);
    return {
      programDayId: asString(row.programDayId),
      scheduledDate: toDateOnly(row.scheduledDate),
      dayLabel: asString(row.dayLabel),
      durationMins: asNumber(row.durationMins, 0),
      heroMediaId: asNullableString(row.heroMediaId),
      highlight:
        highlightRaw == null
          ? null
          : {
              value: asNumber(highlightRaw.value, 0),
              exerciseName: asString(highlightRaw.exerciseName),
            },
    };
  });

  const nextCursor =
    nextCursorRaw == null
      ? null
      : {
          cursorDate: asString(nextCursorRaw.cursorDate),
          cursorId: asString(nextCursorRaw.cursorId),
        };

  return { items, nextCursor };
}

function normalizePersonalRecords(raw: unknown): HistoryPersonalRecordItem[] {
  return asArray(raw).map((item) => {
    const row = asObject(item);
    return {
      exerciseId: asString(row.exerciseId),
      exerciseName: asString(row.exerciseName),
      metric: "weight_kg",
      value: asNumber(row.value, 0),
      date: toDateOnly(row.date),
      programDayId: asString(row.programDayId),
    };
  });
}

function normalizeExerciseSearch(raw: unknown): ExerciseSearchItem[] {
  return asArray(raw)
    .map((item) => {
      const row = asObject(item);
      return {
        exerciseId: asString(row.exerciseId ?? row.exercise_id),
        name: asString(row.name),
      };
    })
    .filter((item) => Boolean(item.exerciseId && item.name))
    .slice(0, 20);
}

function normalizeExerciseHistory(raw: unknown): ExerciseHistoryResponse {
  const root = asObject(raw);
  const summaryRaw = asObject(root.summary);
  const seriesRaw = asArray(root.series);
  const exerciseId = asString(root.exerciseId ?? root.exercise_id);
  const exerciseName = asString(root.exerciseName ?? root.exercise_name, exerciseId);

  return {
    exerciseId,
    exerciseName,
    series: seriesRaw.map((item) => {
      const row = asObject(item);
      return {
        date: toDateOnly(row.date),
        topWeightKg: asNullableNumber(row.topWeightKg ?? row.top_weight_kg),
        tonnage: asNullableNumber(row.tonnage),
        topReps: asNullableNumber(row.topReps ?? row.top_reps),
      };
    }),
    summary: {
      lastPerformed: summaryRaw.lastPerformed == null ? null : toDateOnly(summaryRaw.lastPerformed),
      bestWeightKg: asNullableNumber(summaryRaw.bestWeightKg ?? summaryRaw.best_weight_kg),
      sessionsCount: asNumber(summaryRaw.sessionsCount ?? summaryRaw.sessions_count, 0),
    },
  };
}

export async function getHistoryOverview(): Promise<HistoryOverviewResponse> {
  const raw = await engineFetch<unknown>("/v1/history/overview");
  return normalizeOverview(raw);
}

export async function getHistoryPrograms(limit = 10): Promise<HistoryProgramItem[]> {
  const raw = await engineFetch<unknown>(`/v1/history/programs?limit=${encodeURIComponent(String(limit))}`);
  return normalizePrograms(raw);
}

export type GetHistoryTimelineOptions = {
  limit?: number;
  cursorDate?: string | null;
  cursorId?: string | null;
};

export async function getHistoryTimeline(options: GetHistoryTimelineOptions = {}): Promise<HistoryTimelineResponse> {
  const limit = options.limit ?? 40;
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (options.cursorDate && options.cursorId) {
    params.set("cursorDate", options.cursorDate);
    params.set("cursorId", options.cursorId);
  }

  const raw = await engineFetch<unknown>(`/v1/history/timeline?${params.toString()}`);
  return normalizeTimeline(raw);
}

export async function getHistoryPersonalRecords(limit = 20): Promise<HistoryPersonalRecordItem[]> {
  const raw = await engineFetch<unknown>(`/v1/history/personal-records?limit=${encodeURIComponent(String(limit))}`);
  return normalizePersonalRecords(raw);
}

export async function searchExercises(q: string): Promise<ExerciseSearchItem[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const raw = await engineFetch<unknown>(`/v1/exercises/search?q=${encodeURIComponent(term)}`);
  return normalizeExerciseSearch(raw);
}

export async function fetchExerciseHistory(exerciseId: string): Promise<ExerciseHistoryResponse> {
  const raw = await engineFetch<unknown>(`/v1/history/exercise/${encodeURIComponent(exerciseId)}`);
  return normalizeExerciseHistory(raw);
}
