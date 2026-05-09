import { randomUUID } from "node:crypto";
import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, requireUuid, safeString } from "../utils/validate.js";

export const programDayActionsRouter = express.Router();

const substitutionJobs = new Map();

function mapError(err) {
  if (err instanceof RequestValidationError) {
    return { status: err.status ?? 400, code: "validation_error", message: err.message, details: err.details };
  }
  if (err && typeof err === "object") {
    if (err.code === "22P02") return { status: 400, code: "invalid_input", message: "Invalid input format" };
    if (err.code === "23503") return { status: 400, code: "foreign_key_violation", message: "Invalid reference" };
    if (err.code === "23505") return { status: 409, code: "date_conflict", message: "Target date already has a scheduled training session" };
    if (err.code === "42P01" || err.code === "42703") {
      return { status: 500, code: "schema_missing", message: "Required schema is missing; run migrations" };
    }
  }
  return { status: 500, code: "internal_error", message: publicInternalError(err) };
}

function resolveUserId(req) {
  const userId = safeString(req.auth?.user_id) || safeString(req.auth?.userId);
  if (!userId) throw new RequestValidationError("Missing authenticated user context");
  return userId;
}

function validateFutureDate(value) {
  const targetDate = safeString(value);
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new RequestValidationError("targetDate must be a YYYY-MM-DD date string");
  }
  const parsed = new Date(`${targetDate}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || targetDate !== parsed.toISOString().slice(0, 10)) {
    throw new RequestValidationError("targetDate must be a valid date");
  }
  const today = new Date().toISOString().slice(0, 10);
  if (targetDate <= today) {
    throw new RequestValidationError("targetDate must be a future date");
  }
  return targetDate;
}

async function verifyProgramDay(db, { programId, programDayId, userId }) {
  const result = await db.query(
    `
    SELECT
      pd.id,
      pd.program_id,
      pd.program_week_id,
      pd.program_day_key,
      pd.week_number,
      pd.scheduled_offset_days,
      pd.scheduled_weekday,
      pd.global_day_index,
      pd.is_completed,
      pd.is_skipped,
      p.user_id
    FROM program_day pd
    JOIN program p ON p.id = pd.program_id
    WHERE pd.id = $1
      AND pd.program_id = $2
    LIMIT 1
    `,
    [programDayId, programId],
  );

  if (result.rowCount === 0) {
    return { status: 404, row: null };
  }
  if (String(result.rows[0].user_id) !== String(userId)) {
    return { status: 403, row: result.rows[0] };
  }
  return { status: 200, row: result.rows[0] };
}

async function verifyProgram(db, { programId, userId }) {
  const result = await db.query(
    `SELECT id FROM program WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [programId, userId],
  );
  return result.rowCount > 0;
}

function createProgramDayActionHandlers(db = pool, jobs = substitutionJobs) {
  async function skipProgramDay(req, res) {
    const { request_id } = req;
    try {
      const userId = resolveUserId(req);
      const programId = requireUuid(req.params.programId, "programId");
      const programDayId = requireUuid(req.params.programDayId, "programDayId");
      const reason = safeString(req.body?.reason) || null;

      const verified = await verifyProgramDay(db, { programId, programDayId, userId });
      if (verified.status === 404) {
        return res.status(404).json({ ok: false, request_id, code: "not_found", error: "Program day not found" });
      }
      if (verified.status === 403) {
        return res.status(403).json({ ok: false, request_id, code: "forbidden", error: "Program does not belong to this user" });
      }
      if (verified.row.is_completed) {
        return res.status(409).json({
          ok: false,
          request_id,
          code: "already_completed",
          error: "Cannot skip an already-completed session",
        });
      }

      await db.query(
        `
        UPDATE program_day
        SET is_skipped = TRUE,
            skipped_at = COALESCE(skipped_at, now()),
            skipped_reason = $1,
            updated_at = now()
        WHERE id = $2
        `,
        [reason, programDayId],
      );

      return res.status(204).send();
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

  async function rescheduleProgramDay(req, res) {
    const { request_id } = req;
    let client = null;
    try {
      const userId = resolveUserId(req);
      const programId = requireUuid(req.params.programId, "programId");
      const programDayId = requireUuid(req.params.programDayId, "programDayId");
      const targetDate = validateFutureDate(req.body?.targetDate);

      const verified = await verifyProgramDay(db, { programId, programDayId, userId });
      if (verified.status === 404) {
        return res.status(404).json({ ok: false, request_id, code: "not_found", error: "Program day not found" });
      }
      if (verified.status === 403) {
        return res.status(403).json({ ok: false, request_id, code: "forbidden", error: "Program does not belong to this user" });
      }
      if (verified.row.is_completed) {
        return res.status(409).json({
          ok: false,
          request_id,
          code: "already_completed",
          error: "Cannot reschedule an already-completed session",
        });
      }

      const conflictResult = await db.query(
        `
        SELECT id
        FROM program_calendar_day
        WHERE program_id = $1
          AND scheduled_date = $2::date
          AND is_training_day = TRUE
        LIMIT 1
        `,
        [programId, targetDate],
      );
      if (conflictResult.rowCount > 0) {
        return res.status(409).json({
          ok: false,
          request_id,
          code: "date_conflict",
          error: "Target date already has a scheduled training session",
        });
      }

      client = typeof db.connect === "function" ? await db.connect() : db;
      if (client !== db) await client.query("BEGIN");

      const insertResult = await client.query(
        `
        INSERT INTO program_calendar_day (
          program_id,
          program_week_id,
          program_day_id,
          user_id,
          week_number,
          scheduled_offset_days,
          scheduled_weekday,
          scheduled_date,
          global_day_index,
          is_training_day,
          program_day_key,
          rescheduled_from_day_id,
          rescheduled_at
        )
        SELECT
          pd.program_id,
          pd.program_week_id,
          pd.id,
          p.user_id,
          pd.week_number,
          GREATEST(0, ($3::date - p.start_date::date))::int,
          to_char($3::date, 'Dy'),
          $3::date,
          pd.global_day_index,
          TRUE,
          'rescheduled:' || pd.id::text || ':' || $3::text,
          pd.id,
          now()
        FROM program_day pd
        JOIN program p ON p.id = pd.program_id
        WHERE pd.id = $1
          AND pd.program_id = $2
        RETURNING *
        `,
        [programDayId, programId, targetDate],
      );

      await client.query(
        `
        UPDATE program_day
        SET is_skipped = TRUE,
            skipped_at = COALESCE(skipped_at, now()),
            skipped_reason = 'rescheduled',
            updated_at = now()
        WHERE id = $1
        `,
        [programDayId],
      );

      if (client !== db) await client.query("COMMIT");
      return res.status(201).json({ ok: true, calendarDay: insertResult.rows[0] });
    } catch (err) {
      if (client && client !== db) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // ignore rollback failures
        }
      }
      const mapped = mapError(err);
      return res.status(mapped.status).json({
        ok: false,
        request_id,
        code: mapped.code,
        error: mapped.message,
        details: mapped.details,
      });
    } finally {
      if (client && client !== db) client.release();
    }
  }

  async function startEquipmentSubstitution(req, res) {
    const { request_id } = req;
    try {
      const userId = resolveUserId(req);
      const programId = requireUuid(req.params.programId, "programId");
      const availableEquipmentCodes = Array.isArray(req.body?.availableEquipmentCodes)
        ? Array.from(new Set(req.body.availableEquipmentCodes.map((item) => safeString(item)).filter(Boolean)))
        : [];

      if (availableEquipmentCodes.length === 0) {
        throw new RequestValidationError("availableEquipmentCodes must be a non-empty array");
      }
      const ownsProgram = await verifyProgram(db, { programId, userId });
      if (!ownsProgram) {
        return res.status(403).json({
          ok: false,
          request_id,
          code: "forbidden",
          error: "Program not found or does not belong to this user",
        });
      }

      const jobId = randomUUID();
      jobs.set(jobId, {
        programId,
        userId,
        status: "running",
        warnings: [],
        error: null,
        swappedCount: 0,
        unsubstitutedExerciseIds: [],
      });

      setImmediate(async () => {
        try {
          const exercisesResult = await db.query(
            `
            SELECT
              pe.id,
              pe.program_id,
              pe.program_day_id,
              pe.exercise_id,
              pe.original_exercise_id,
              pe.equipment_items_slugs_csv
            FROM program_exercise pe
            JOIN program_day pd ON pd.id = pe.program_day_id
            WHERE pd.program_id = $1
              AND pd.is_completed = FALSE
              AND pd.is_skipped IS NOT TRUE
            `,
            [programId],
          );

          const warnings = [];
          let swappedCount = 0;
          for (const row of exercisesResult.rows ?? []) {
            const required = safeString(row.equipment_items_slugs_csv)
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
            const compatible = required.length === 0 || required.every((item) => availableEquipmentCodes.includes(item));
            if (!compatible) {
              const candidateResult = await db.query(
                `
                SELECT
                  replacement.exercise_id,
                  replacement.name,
                  replacement.is_loadable,
                  replacement.equipment_items_slugs,
                  replacement.coaching_cues_json,
                  replacement.load_guidance,
                  replacement.logging_guidance
                FROM exercise_catalogue current
                JOIN exercise_catalogue replacement
                  ON replacement.is_archived = FALSE
                 AND replacement.exercise_id != current.exercise_id
                 AND replacement.equipment_items_slugs <@ $2::text[]
                 AND (
                   (replacement.swap_group_id_2 = current.swap_group_id_2 AND current.swap_group_id_2 IS NOT NULL AND current.swap_group_id_2 != '')
                   OR (replacement.swap_group_id_1 = current.swap_group_id_1 AND current.swap_group_id_1 IS NOT NULL AND current.swap_group_id_1 != '')
                   OR replacement.movement_pattern_primary = current.movement_pattern_primary
                 )
                WHERE current.exercise_id = $1
                  AND NOT EXISTS (
                    SELECT 1
                    FROM program_exercise duplicate
                    WHERE duplicate.program_day_id = $3
                      AND duplicate.exercise_id = replacement.exercise_id
                  )
                ORDER BY
                  CASE
                    WHEN replacement.swap_group_id_2 = current.swap_group_id_2 AND current.swap_group_id_2 IS NOT NULL AND current.swap_group_id_2 != '' THEN 1
                    WHEN replacement.swap_group_id_1 = current.swap_group_id_1 AND current.swap_group_id_1 IS NOT NULL AND current.swap_group_id_1 != '' THEN 2
                    ELSE 3
                  END,
                  replacement.min_fitness_rank DESC,
                  replacement.complexity_rank ASC,
                  replacement.name ASC
                LIMIT 1
                `,
                [row.exercise_id, availableEquipmentCodes, row.program_day_id],
              );
              const replacement = candidateResult.rows?.[0];
              if (!replacement) {
                warnings.push({
                  programExerciseId: row.id,
                  exerciseId: row.exercise_id,
                });
                continue;
              }

              await db.query(
                `
                UPDATE program_exercise
                SET
                  exercise_id = $1,
                  exercise_name = $2,
                  is_loadable = $3,
                  equipment_items_slugs_csv = array_to_string($4::text[], ','),
                  coaching_cues_json = $5::jsonb,
                  load_hint = COALESCE($6, ''),
                  log_prompt = COALESCE($7, ''),
                  original_exercise_id = CASE
                    WHEN original_exercise_id IS NULL THEN $8
                    ELSE original_exercise_id
                  END,
                  substitution_reason = 'equipment_recalibration',
                  progression_outcome = NULL,
                  progression_primary_lever = NULL,
                  progression_confidence = NULL,
                  progression_source = NULL,
                  progression_reasoning_json = '[]'::jsonb,
                  recommended_load_kg = NULL,
                  recommended_reps_target = NULL,
                  recommended_sets = NULL,
                  recommended_rest_seconds = NULL
                WHERE id = $9
                `,
                [
                  replacement.exercise_id,
                  replacement.name,
                  Boolean(replacement.is_loadable),
                  Array.isArray(replacement.equipment_items_slugs) ? replacement.equipment_items_slugs : [],
                  JSON.stringify(replacement.coaching_cues_json ?? []),
                  replacement.load_guidance ?? "",
                  replacement.logging_guidance ?? "",
                  row.original_exercise_id ?? row.exercise_id,
                  row.id,
                ],
              );
              swappedCount += 1;
            }
          }

          jobs.set(jobId, {
            programId,
            userId,
            status: warnings.length > 0 ? "partial" : "complete",
            warnings,
            error: null,
            swappedCount,
            unsubstitutedExerciseIds: warnings.map((warning) => warning.exerciseId),
          });
        } catch (bgErr) {
          jobs.set(jobId, {
            programId,
            userId,
            status: "failed",
            warnings: [],
            error: bgErr?.message ?? "Unknown error",
            swappedCount: 0,
            unsubstitutedExerciseIds: [],
          });
        }
      });

      return res.status(202).json({ ok: true, jobId });
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

  async function pollEquipmentSubstitution(req, res) {
    const { request_id } = req;
    try {
      const userId = resolveUserId(req);
      const programId = requireUuid(req.params.programId, "programId");
      const jobId = safeString(req.params.jobId);
      const job = jobs.get(jobId);
      if (!job || job.programId !== programId) {
        return res.status(404).json({ ok: false, request_id, code: "not_found", error: "Job not found" });
      }
      if (String(job.userId) !== String(userId)) {
        return res.status(403).json({ ok: false, request_id, code: "forbidden", error: "Job does not belong to this user" });
      }
      return res.json({
        ok: true,
        status: job.status,
        warnings: job.warnings ?? [],
        error: job.error ?? null,
        swappedCount: job.swappedCount ?? 0,
        unsubstitutedExerciseIds: job.unsubstitutedExerciseIds ?? [],
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

  return {
    skipProgramDay,
    rescheduleProgramDay,
    startEquipmentSubstitution,
    pollEquipmentSubstitution,
  };
}

const handlers = createProgramDayActionHandlers();
programDayActionsRouter.use(requireAuth);
programDayActionsRouter.post("/programs/:programId/days/:programDayId/skip", handlers.skipProgramDay);
programDayActionsRouter.post("/programs/:programId/days/:programDayId/reschedule", handlers.rescheduleProgramDay);
programDayActionsRouter.post("/programs/:programId/equipment-substitution", handlers.startEquipmentSubstitution);
programDayActionsRouter.get("/programs/:programId/equipment-substitution/:jobId", handlers.pollEquipmentSubstitution);

export { createProgramDayActionHandlers, validateFutureDate };
