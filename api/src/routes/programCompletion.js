import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, requireUuid, safeString } from "../utils/validate.js";

export const programCompletionRouter = express.Router();

class NotFoundError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "NotFoundError";
    this.status = 404;
    this.details = details;
  }
}

const SQL_COMPLETION_SUMMARY = `
SELECT
  p.id AS program_id,
  p.program_title,
  p.program_type,
  p.weeks_count,
  p.days_per_week,
  p.start_date,
  p.status AS lifecycle_status,
  p.completed_mode,
  p.completed_at,
  cp.fitness_rank,
  cp.fitness_level_slug,
  cp.main_goals_slugs AS goals,
  cp.minutes_per_session,
  cp.preferred_days,
  cp.equipment_items_slugs,
  cp.equipment_preset_slug,
  COUNT(pd.id) AS total_days,
  COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE) AS completed_days,
  COUNT(pd.id) FILTER (
    WHERE pd.is_completed = FALSE
      AND pd.global_day_index < (
        SELECT MAX(pd2.global_day_index)
        FROM program_day pd2
        WHERE pd2.program_id = p.id
      )
  ) AS missed_workouts_count,
  COALESCE((
    SELECT pd3.is_completed
    FROM program_day pd3
    WHERE pd3.program_id = p.id
    ORDER BY pd3.global_day_index DESC
    LIMIT 1
  ), FALSE) AS is_last_scheduled_day_complete,
  CASE WHEN COUNT(pd.id) = 0 THEN 0
       ELSE (COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE))::float / COUNT(pd.id)
  END AS completion_ratio,
  COUNT(DISTINCT eps.exercise_id) FILTER (
    WHERE eps.last_outcome IN ('increase_load', 'increase_reps')
  ) AS exercises_progressed,
  COUNT(DISTINCT eps.exercise_id) AS exercises_tracked,
  AVG(
    CASE WHEN eps.last_outcome IN ('increase_load', 'increase_reps') THEN 1.0
         WHEN eps.last_outcome = 'hold' THEN 0.5
         WHEN eps.last_outcome = 'deload_local' THEN 0.0
    END
  ) AS avg_progression_score,
  AVG(
    CASE eps.confidence
      WHEN 'high' THEN 1.0
      WHEN 'medium' THEN 0.5
      WHEN 'low' THEN 0.25
      ELSE NULL
    END
  ) AS avg_confidence_score
FROM program p
JOIN program_day pd
  ON pd.program_id = p.id
LEFT JOIN client_profile cp
  ON cp.user_id = p.user_id
LEFT JOIN exercise_progression_state eps
  ON eps.user_id = p.user_id
  AND eps.program_type = p.program_type
WHERE p.id = $1
  AND p.user_id = $2
GROUP BY p.id, cp.fitness_rank, cp.fitness_level_slug, cp.main_goals_slugs,
         cp.minutes_per_session, cp.preferred_days, cp.equipment_items_slugs,
         cp.equipment_preset_slug
`;

const SQL_PROGRAM_PRS = `
SELECT DISTINCT ON (pe.exercise_id)
  pe.exercise_id,
  COALESCE(ec.name, pe.exercise_name) AS exercise_name,
  MAX(sel.weight_kg) AS best_weight_kg
FROM segment_exercise_log sel
JOIN program_exercise pe ON pe.id = sel.program_exercise_id
JOIN program_day pd ON pd.id = sel.program_day_id
LEFT JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
WHERE sel.program_id = $1
  AND pd.is_completed = TRUE
  AND sel.is_draft = FALSE
  AND sel.weight_kg IS NOT NULL
GROUP BY pe.exercise_id, ec.name, pe.exercise_name
ORDER BY pe.exercise_id, best_weight_kg DESC
LIMIT 10
`;

const SQL_END_CHECK = `
SELECT
  p.id AS program_id,
  p.program_title,
  p.status AS lifecycle_status,
  p.completed_mode,
  COUNT(pd.id) AS total_days,
  COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE) AS completed_days,
  COUNT(pd.id) FILTER (
    WHERE pd.is_completed = FALSE
      AND pd.global_day_index < (
        SELECT MAX(pd2.global_day_index)
        FROM program_day pd2
        WHERE pd2.program_id = p.id
      )
  ) AS missed_workouts_count,
  COALESCE((
    SELECT pd3.is_completed
    FROM program_day pd3
    WHERE pd3.program_id = p.id
    ORDER BY pd3.global_day_index DESC
    LIMIT 1
  ), FALSE) AS is_last_scheduled_day_complete
FROM program p
JOIN program_day pd
  ON pd.program_id = p.id
WHERE p.id = $1
  AND p.user_id = $2
GROUP BY p.id
`;

function mapError(err) {
  if (err instanceof RequestValidationError || err instanceof NotFoundError) {
    return {
      status: err.status ?? 400,
      code: err instanceof NotFoundError ? "not_found" : "validation_error",
      message: err.message,
      details: err.details,
    };
  }
  if (err && typeof err === "object") {
    if (err.code === "22P02") return { status: 400, code: "invalid_input", message: "Invalid input format" };
    if (err.code === "23503") return { status: 400, code: "foreign_key_violation", message: "Invalid reference" };
    if (err.code === "23505") return { status: 409, code: "unique_violation", message: "Duplicate conflict" };
    if (err.code === "42P01") return { status: 500, code: "schema_missing", message: "Required table is missing; run migrations" };
    if (err.code === "42703") return { status: 500, code: "schema_missing", message: "Required column is missing; run migrations" };
  }
  return { status: 500, code: "internal_error", message: publicInternalError(err) };
}

function toFiniteNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

function asNullableString(value) {
  if (value == null) return null;
  const text = asString(value).trim();
  return text || null;
}

function asBoolean(value) {
  return value === true;
}

function confidenceLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const numeric = Number(score);
  if (numeric >= 0.75) return "high";
  if (numeric >= 0.45) return "medium";
  return "low";
}

function suggestNextRank(fitnessRank, avgProgressionScore, exercisesProgressed, exercisesTracked) {
  const currentRank = Number.isFinite(Number(fitnessRank)) ? Number(fitnessRank) : 1;
  if (currentRank >= 3) return currentRank;
  if (!Number.isFinite(Number(exercisesTracked)) || Number(exercisesTracked) === 0) return currentRank;
  const score = Number.isFinite(Number(avgProgressionScore)) ? Number(avgProgressionScore) : 0;
  const ratio = Number(exercisesProgressed ?? 0) / Number(exercisesTracked);
  if (ratio >= 0.6 && score >= 0.6) return currentRank + 1;
  return currentRank;
}

function buildReEnrollmentOptions(currentRank, suggestedRank) {
  const options = [
    {
      option: "same_settings",
      label: "Start a new program (same settings)",
      fitness_rank: currentRank,
    },
  ];
  if (suggestedRank > currentRank) {
    options.push({
      option: "progress_level",
      label: "Progress to next level",
      fitness_rank: suggestedRank,
    });
  }
  options.push({
    option: "change_goals",
    label: "Change goals",
    fitness_rank: currentRank,
  });
  return options;
}

function normalizeLifecycleStatus(status) {
  const normalized = asString(status).trim().toLowerCase();
  return normalized === "completed" ? "completed" : "in_progress";
}

function normalizeCompletedMode(mode) {
  const normalized = asString(mode).trim().toLowerCase();
  if (normalized === "as_scheduled" || normalized === "with_skips") return normalized;
  return null;
}

function toEndCheckPayload(row) {
  const lifecycleStatus = normalizeLifecycleStatus(row.lifecycle_status);
  const completedMode = normalizeCompletedMode(row.completed_mode);
  const totalDays = toFiniteNumber(row.total_days, 0);
  const completedDays = toFiniteNumber(row.completed_days, 0);
  const missedWorkoutsCount = toFiniteNumber(row.missed_workouts_count, 0);
  const isLastScheduledDayComplete = asBoolean(row.is_last_scheduled_day_complete);

  return {
    program_id: asString(row.program_id),
    program_title: asString(row.program_title),
    lifecycle_status: lifecycleStatus,
    completed_mode: completedMode,
    total_days: totalDays,
    completed_days: completedDays,
    missed_workouts_count: missedWorkoutsCount,
    is_last_scheduled_day_complete: isLastScheduledDayComplete,
    can_complete_with_skips:
      lifecycleStatus !== "completed" &&
      isLastScheduledDayComplete &&
      missedWorkoutsCount > 0,
  };
}

export function createProgramCompletionHandlers(db = pool) {
  function resolveUserId(req) {
    const userId = safeString(req.auth?.user_id) || safeString(req.auth?.userId);
    if (userId) return userId;
    throw new RequestValidationError("Missing authenticated user context");
  }

  async function loadEndCheck(programId, userId) {
    const result = await db.query(SQL_END_CHECK, [programId, userId]);
    if (result.rowCount === 0) {
      throw new NotFoundError("Program not found");
    }
    return toEndCheckPayload(result.rows[0]);
  }

  async function completionSummary(req, res) {
    const { request_id } = req;
    const program_id = safeString(req.params.program_id);

    try {
      requireUuid(program_id, "program_id");
      const userId = resolveUserId(req);

      const summaryResult = await db.query(SQL_COMPLETION_SUMMARY, [program_id, userId]);
      if (summaryResult.rowCount === 0) {
        throw new NotFoundError("Program not found");
      }
      const row = summaryResult.rows[0];

      const prResult = await db.query(SQL_PROGRAM_PRS, [program_id]);

      const currentRank = Number.isFinite(Number(row.fitness_rank)) ? Number(row.fitness_rank) : 1;
      const exercisesTracked = row.program_type ? toFiniteNumber(row.exercises_tracked, 0) : 0;
      const exercisesProgressed = row.program_type ? toFiniteNumber(row.exercises_progressed, 0) : 0;
      const avgProgressionScore = row.program_type ? toFiniteNumber(row.avg_progression_score, 0) : 0;
      const avgConfidenceScore = row.program_type ? row.avg_confidence_score : null;
      const suggestedNextRank = suggestNextRank(
        currentRank,
        avgProgressionScore,
        exercisesProgressed,
        exercisesTracked,
      );

      return res.json({
        ok: true,
        program_id: asString(row.program_id),
        program_title: asString(row.program_title),
        program_type: row.program_type ?? null,
        weeks_completed: toFiniteNumber(row.weeks_count, 0),
        days_completed: toFiniteNumber(row.completed_days, 0),
        days_total: toFiniteNumber(row.total_days, 0),
        missed_workouts_count: toFiniteNumber(row.missed_workouts_count, 0),
        is_last_scheduled_day_complete: asBoolean(row.is_last_scheduled_day_complete),
        lifecycle_status: normalizeLifecycleStatus(row.lifecycle_status),
        completed_mode: normalizeCompletedMode(row.completed_mode),
        completed_at: row.completed_at ?? null,
        completion_ratio: toFiniteNumber(row.completion_ratio, 0),
        exercises_progressed: exercisesProgressed,
        exercises_tracked: exercisesTracked,
        avg_progression_score: avgProgressionScore,
        avg_confidence: confidenceLabel(avgConfidenceScore),
        personal_records: (prResult.rows ?? []).map((pr) => ({
          exercise_id: asString(pr.exercise_id),
          exercise_name: asString(pr.exercise_name),
          best_weight_kg: toFiniteNumber(pr.best_weight_kg, 0),
        })),
        current_profile: {
          fitness_rank: currentRank,
          fitness_level_slug: row.fitness_level_slug ?? null,
          goals: Array.isArray(row.goals) ? row.goals : [],
          minutes_per_session: row.minutes_per_session == null ? null : toFiniteNumber(row.minutes_per_session, null),
          preferred_days: Array.isArray(row.preferred_days) ? row.preferred_days : [],
          equipment_items_slugs: Array.isArray(row.equipment_items_slugs) ? row.equipment_items_slugs : [],
          equipment_preset_slug: row.equipment_preset_slug ?? null,
        },
        suggested_next_rank: suggestedNextRank,
        re_enrollment_options: buildReEnrollmentOptions(currentRank, suggestedNextRank),
      });
    } catch (err) {
      const mapped = mapError(err);
      return res.status(mapped.status).json({
        ok: false,
        request_id,
        code: mapped.code,
        error: mapped.message,
        details: mapped.details,
      });
    }
  }

  async function endCheck(req, res) {
    const { request_id } = req;
    const program_id = safeString(req.params.program_id);

    try {
      requireUuid(program_id, "program_id");
      const userId = resolveUserId(req);
      const payload = await loadEndCheck(program_id, userId);
      return res.json({ ok: true, ...payload });
    } catch (err) {
      const mapped = mapError(err);
      return res.status(mapped.status).json({
        ok: false,
        request_id,
        code: mapped.code,
        error: mapped.message,
        details: mapped.details,
      });
    }
  }

  async function completeProgram(req, res) {
    const { request_id } = req;
    const program_id = safeString(req.params.program_id);

    try {
      requireUuid(program_id, "program_id");
      const userId = resolveUserId(req);
      const mode = safeString(req.body?.mode);
      if (mode !== "as_scheduled" && mode !== "with_skips") {
        throw new RequestValidationError("mode must be 'as_scheduled' or 'with_skips'");
      }

      const endCheckPayload = await loadEndCheck(program_id, userId);
      if (endCheckPayload.lifecycle_status === "completed") {
        return res.json({
          ok: true,
          program_id,
          lifecycle_status: "completed",
          completed_mode: endCheckPayload.completed_mode,
        });
      }

      if (mode === "as_scheduled" && endCheckPayload.completed_days < endCheckPayload.total_days) {
        throw new RequestValidationError("Program is not fully complete yet");
      }

      if (mode === "with_skips" && !endCheckPayload.can_complete_with_skips) {
        throw new RequestValidationError("Program cannot be completed with skips yet");
      }

      await db.query(
        `
        UPDATE program
        SET
          status = 'completed',
          completed_mode = $3,
          completed_at = now(),
          is_primary = FALSE,
          updated_at = now()
        WHERE id = $1
          AND user_id = $2
        `,
        [program_id, userId, mode],
      );

      return res.json({
        ok: true,
        program_id,
        lifecycle_status: "completed",
        completed_mode: mode,
      });
    } catch (err) {
      const mapped = mapError(err);
      return res.status(mapped.status).json({
        ok: false,
        request_id,
        code: mapped.code,
        error: mapped.message,
        details: mapped.details,
      });
    }
  }

  return { completionSummary, endCheck, completeProgram };
}

const handlers = createProgramCompletionHandlers();
programCompletionRouter.use(requireAuth);
programCompletionRouter.get("/program/:program_id/completion-summary", handlers.completionSummary);
programCompletionRouter.get("/program/:program_id/end-check", handlers.endCheck);
programCompletionRouter.post("/program/:program_id/complete", handlers.completeProgram);

export { confidenceLabel, suggestNextRank, buildReEnrollmentOptions, toEndCheckPayload, normalizeLifecycleStatus };
