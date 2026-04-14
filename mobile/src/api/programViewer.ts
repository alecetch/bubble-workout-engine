import { authGetJson, authPatchJson } from "./client";

export type ViewerIdentityOptions = {
  userId?: string;
};

export type ProgramOverviewOptions = ViewerIdentityOptions & {
  selectedProgramDayId?: string;
};

export type ProgramOverviewResponse = {
  program: {
    id: string;
    title?: string;
    summary?: string;
    heroMedia?: string | null;
  };
  weeks: Array<{
    id?: string;
    weekNumber: number;
    focus?: string;
    notes?: string;
  }>;
  calendarDays: Array<{
    id?: string;
    calendarDate: string;
    scheduledDate?: string;
    scheduledWeekday?: string | null;
    programDayId?: string | null;
    status?: string | null;
    weekNumber?: number | null;
    isTrainingDay: boolean;
  }>;
  selectedDayPreview?: {
    programDayId: string;
    label?: string;
    type?: string;
    sessionDuration?: number;
    equipmentSlugs?: string[];
  };
};

export type ProgramDayFullResponse = {
  day: {
    id: string;
    label?: string;
    type?: string;
    sessionDuration?: number;
    heroMedia?: string | null;
  };
  segments: Array<{
    id: string;
    segmentType?: string | null;
    segmentTypeLabel?: string | null;
    segmentName: string;
    orderInDay: number;
    rounds?: number | null;
    segmentDurationSeconds?: number | null;
    segmentDurationMmss?: string | null;
    notes?: string | null;
    postSegmentRestSec?: number;
    exercises: Array<{
      id?: string;
      exerciseId?: string;
      name: string;
      sets?: number | null;
      reps?: string | null;
      repsUnit?: string | null;
      intensity?: string | null;
      tempo?: string | null;
      restSeconds?: number | null;
      notes?: string | null;
      equipment?: string[] | null;
      isLoadable?: boolean | null;
      guidelineLoad?: {
        value: number;
        unit: string;
        confidence: "low" | "medium" | "high";
        confidenceScore?: number;
        source?: string;
        reasoning?: string[];
        set1Rule?: string;
      } | null;
    }>;
  }>;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return asString(value);
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return asNumber(value);
}

function asNullableBoolean(value: unknown): boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  return undefined;
}

function toIsoDate(value: unknown): string | undefined {
  const raw = asString(value);
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  if (raw) {
    const parsed = new Date(raw);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return undefined;
}

function toIsoDateFromMs(value: unknown): string | undefined {
  const ms = asNumber(value);
  if (!Number.isFinite(ms)) return undefined;
  const parsed = new Date(ms as number);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function buildIdentityQuery(opts: ViewerIdentityOptions): URLSearchParams {
  const params = new URLSearchParams();
  if (opts.userId) {
    params.set("user_id", opts.userId);
  }
  return params;
}

function normalizeProgramOverview(raw: unknown): ProgramOverviewResponse {
  const root = asObject(raw);
  const rawProgram = asObject(root.program);
  const rawWeeks = asArray(root.weeks);
  const rawCalendarDays = asArray(root.calendar_days ?? root.calendarDays);
  // Backend sends "selected_day" (not "selected_day_preview")
  const rawSelectedDayPreview = asObject(root.selected_day ?? root.selected_day_preview ?? root.selectedDayPreview);

  const programId =
    asString(rawProgram.id) ??
    asString(root.program_id) ??
    asString(root.programId) ??
    "unknown-program";

  const weeks = rawWeeks.map((item, index) => {
    const week = asObject(item);
    return {
      id: asString(week.id),
      weekNumber: asNumber(week.week_number ?? week.weekNumber) ?? index + 1,
      focus: asString(week.focus),
      notes: asString(week.notes),
    };
  });

  const calendarDays = rawCalendarDays.map((item, index) => {
    const day = asObject(item);
    const scheduledDate =
      toIsoDate(day.scheduled_date ?? day.scheduledDate ?? day.calendar_date ?? day.calendarDate) ??
      toIsoDateFromMs(day.scheduled_date_ms ?? day.scheduledDateMs ?? day.calendar_date_ms ?? day.calendarDateMs) ??
      toIsoDate(day.date);

    return {
      id: asString(day.id),
      calendarDate: scheduledDate ?? "",
      scheduledDate,
      scheduledWeekday: asNullableString(day.scheduled_weekday ?? day.scheduledWeekday),
      programDayId: asNullableString(day.program_day_id ?? day.programDayId),
      status: asNullableString(day.status),
      weekNumber: asNullableNumber(day.week_number ?? day.weekNumber),
      // Default true: legacy rows without the field are training days.
      isTrainingDay: asNullableBoolean(day.is_training_day ?? day.isTrainingDay) ?? true,
    };
  });

  const selectedProgramDayId = asString(
    rawSelectedDayPreview.program_day_id ?? rawSelectedDayPreview.programDayId,
  );

  return {
    program: {
      id: programId,
      title: asString(rawProgram.title),
      summary: asString(rawProgram.summary),
      heroMedia: asNullableString(rawProgram.hero_media ?? rawProgram.heroMedia),
    },
    weeks,
    calendarDays,
    selectedDayPreview: selectedProgramDayId
      ? {
          programDayId: selectedProgramDayId,
          // Backend sends day_label / day_type / session_duration_mins
          label: asString(rawSelectedDayPreview.day_label ?? rawSelectedDayPreview.label),
          type: asString(rawSelectedDayPreview.day_type ?? rawSelectedDayPreview.type),
          sessionDuration: asNumber(
            rawSelectedDayPreview.session_duration_mins ??
            rawSelectedDayPreview.session_duration ??
            rawSelectedDayPreview.sessionDuration,
          ),
          equipmentSlugs: asArray(
            rawSelectedDayPreview.equipment_slugs ?? rawSelectedDayPreview.equipmentSlugs,
          )
            .map(asString)
            .filter((value): value is string => Boolean(value)),
        }
      : undefined,
  };
}

function normalizeProgramDayFull(raw: unknown): ProgramDayFullResponse {
  const root = asObject(raw);
  const rawDay = asObject(root.day);
  const rawSegments = asArray(root.segments);

  // Backend sends the raw DB row: program_day_id (not id), day_label, day_type, session_duration_mins
  const dayId =
    asString(rawDay.program_day_id ?? rawDay.id) ??
    asString(root.program_day_id) ??
    asString(root.programDayId) ??
    "unknown-day";

  return {
    day: {
      id: dayId,
      label: asString(rawDay.day_label ?? rawDay.label),
      type: asString(rawDay.day_type ?? rawDay.type),
      sessionDuration: asNumber(
        rawDay.session_duration_mins ?? rawDay.session_duration ?? rawDay.sessionDuration,
      ),
      heroMedia: asNullableString(rawDay.hero_media ?? rawDay.heroMedia),
    },
    segments: rawSegments.map((item, segmentIndex) => {
      const rawSegment = asObject(item);
      // Backend nests exercises under "items" (not "exercises")
      const rawExercises = asArray(rawSegment.items ?? rawSegment.exercises);

      return {
        id: asString(rawSegment.workout_segment_id ?? rawSegment.id) ?? `segment-${segmentIndex + 1}`,
        segmentType: asNullableString(rawSegment.segment_type ?? rawSegment.segmentType),
        segmentTypeLabel: asNullableString(
          rawSegment.segment_type_label ?? rawSegment.segmentTypeLabel,
        ),
        segmentName:
          asString(rawSegment.segment_title ?? rawSegment.segment_name ?? rawSegment.segmentName) ??
          `Segment ${segmentIndex + 1}`,
        orderInDay:
          asNumber(rawSegment.order_in_day ?? rawSegment.orderInDay ?? rawSegment.block_order) ?? segmentIndex + 1,
        rounds: asNullableNumber(rawSegment.rounds),
        segmentDurationSeconds: asNullableNumber(
          rawSegment.segment_duration_seconds ?? rawSegment.segmentDurationSeconds,
        ),
        segmentDurationMmss: asNullableString(
          rawSegment.segment_duration_mmss ?? rawSegment.segmentDurationMmss,
        ),
        notes: asNullableString(rawSegment.segment_notes ?? rawSegment.notes),
        postSegmentRestSec: asNumber(rawSegment.post_segment_rest_sec ?? rawSegment.postSegmentRestSec) ?? 0,
        exercises: rawExercises.map((exercise, exerciseIndex) => {
          const rawExercise = asObject(exercise);

          return {
            id: asString(rawExercise.program_exercise_id ?? rawExercise.id),
            exerciseId: asString(rawExercise.exercise_id ?? rawExercise.exerciseId),
            name:
              asString(rawExercise.name) ??
              asString(rawExercise.exercise_name ?? rawExercise.exerciseName) ??
              `Exercise ${exerciseIndex + 1}`,
            sets: asNullableNumber(rawExercise.sets_prescribed ?? rawExercise.sets),
            reps: asNullableString(rawExercise.reps_prescribed ?? rawExercise.reps),
            repsUnit: asNullableString(rawExercise.reps_unit ?? rawExercise.repsUnit) ?? "reps",
            intensity: asNullableString(rawExercise.intensity_prescription ?? rawExercise.intensity),
            tempo: asNullableString(rawExercise.tempo),
            restSeconds: asNullableNumber(rawExercise.rest_seconds ?? rawExercise.restSeconds),
            notes: asNullableString(rawExercise.notes),
            equipment: rawExercise.equipment == null
              ? rawExercise.equipment === null
                ? null
                : undefined
              : asArray(rawExercise.equipment)
                  .map(asString)
                  .filter((value): value is string => Boolean(value)),
            isLoadable: asNullableBoolean(rawExercise.is_loadable ?? rawExercise.isLoadable),
            guidelineLoad: rawExercise.guideline_load == null
              ? rawExercise.guideline_load === null
                ? null
                : undefined
              : (() => {
                  const guideline = asObject(rawExercise.guideline_load);
                  const confidence = asString(guideline.confidence);
                  if (!confidence) return undefined;
                  return {
                    value: asNumber(guideline.value) ?? 0,
                    unit: asString(guideline.unit) ?? "kg",
                    confidence: confidence as "low" | "medium" | "high",
                    confidenceScore: asNumber(
                      guideline.confidence_score ?? guideline.confidenceScore,
                    ),
                    source: asString(guideline.source),
                    reasoning: asArray(guideline.reasoning)
                      .map(asString)
                      .filter((value): value is string => Boolean(value)),
                    set1Rule: asString(guideline.set_1_rule ?? guideline.set1Rule),
                  };
                })(),
          };
        }),
      };
    }),
  };
}

export async function getProgramOverview(
  programId: string,
  opts: ProgramOverviewOptions,
): Promise<ProgramOverviewResponse> {
  const params = buildIdentityQuery(opts);
  if (opts.selectedProgramDayId) {
    params.set("selected_program_day_id", opts.selectedProgramDayId);
  }

  const queryString = params.toString();
  const path = `/api/program/${encodeURIComponent(programId)}/overview${queryString ? `?${queryString}` : ""}`;
  const response = await authGetJson<unknown>(path);
  return normalizeProgramOverview(response);
}

export async function markProgramDayComplete(
  programDayId: string,
  isCompleted: boolean,
  opts: ViewerIdentityOptions,
): Promise<void> {
  await authPatchJson<unknown, Record<string, unknown>>(`/api/day/${encodeURIComponent(programDayId)}/complete`, {
      is_completed: isCompleted,
      ...(opts.userId ? { user_id: opts.userId } : {}),
  });
}

export async function getProgramDayFull(
  programDayId: string,
  opts: ViewerIdentityOptions,
): Promise<ProgramDayFullResponse> {
  const params = buildIdentityQuery(opts);
  const queryString = params.toString();
  const path = `/api/day/${encodeURIComponent(programDayId)}/full${queryString ? `?${queryString}` : ""}`;
  const response = await authGetJson<unknown>(path);
  return normalizeProgramDayFull(response);
}
