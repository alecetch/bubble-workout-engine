import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, requireUuid, safeString } from "../utils/validate.js";

export const segmentLogRouter = express.Router();

class NotFoundError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "NotFoundError";
    this.status = 404;
    this.details = details;
  }
}

function mapError(err) {
  if (err instanceof RequestValidationError || err instanceof NotFoundError) {
    return { status: err.status ?? 400, code: err instanceof NotFoundError ? "not_found" : "validation_error", message: err.message, details: err.details };
  }
  if (err && typeof err === "object") {
    // Common Postgres codes.
    if (err.code === "22P02") return { status: 400, code: "invalid_input", message: "Invalid input format" };
    if (err.code === "23503") return { status: 400, code: "foreign_key_violation", message: "Invalid reference" };
    if (err.code === "23505") return { status: 409, code: "unique_violation", message: "Duplicate conflict" };
    if (err.code === "42P01") return { status: 500, code: "schema_missing", message: "Required table is missing; run migrations" };
  }
  return { status: 500, code: "internal_error", message: publicInternalError(err) };
}

export function compute1rmKg(weightKg, repsCompleted, region) {
  if (
    !Number.isFinite(weightKg) ||
    !Number.isFinite(repsCompleted) ||
    weightKg <= 0 ||
    repsCompleted < 1
  ) {
    return null;
  }
  const epley = weightKg * (1 + repsCompleted / 30);
  if (region === "lower" && repsCompleted < 37) {
    return Number(((weightKg * 36) / (37 - repsCompleted)).toFixed(2));
  }
  return Number(epley.toFixed(2));
}

export function createSegmentLogHandlers(db = pool) {
  function resolveUserId(req) {
    const userId = safeString(req.auth?.user_id);
    if (userId) return userId;
    throw new RequestValidationError("Missing authenticated user context");
  }

  async function getSegmentLog(req, res) {
    const { request_id } = req;
    const workout_segment_id = safeString(req.query.workout_segment_id);
    const program_day_id = safeString(req.query.program_day_id);

    try {
      requireUuid(workout_segment_id, "workout_segment_id");
      requireUuid(program_day_id, "program_day_id");

      const client = await db.connect();
      try {
        const user_id = resolveUserId(req);
        const result = await client.query(
          `
          SELECT id, program_exercise_id, weight_kg, reps_completed, order_index
          FROM segment_exercise_log
          WHERE user_id = $1
            AND workout_segment_id = $2
            AND program_day_id = $3
          ORDER BY order_index ASC
          `,
          [user_id, workout_segment_id, program_day_id],
        );

        return res.json({ rows: result.rows });
      } finally {
        client.release();
      }
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

  async function postSegmentLog(req, res) {
    const { request_id } = req;
    const program_id = safeString(req.body?.program_id);
    const program_day_id = safeString(req.body?.program_day_id);
    const workout_segment_id = safeString(req.body?.workout_segment_id);
    const rows = req.body?.rows;

    try {
      requireUuid(program_id, "program_id");
      requireUuid(program_day_id, "program_day_id");
      requireUuid(workout_segment_id, "workout_segment_id");
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new RequestValidationError("rows must be a non-empty array");
      }
      for (const row of rows) {
        requireUuid(safeString(row?.program_exercise_id), "program_exercise_id");
      }

      const client = await db.connect();
      try {
        const user_id = resolveUserId(req);
        await client.query("BEGIN");

        const programExerciseIds = [...new Set(rows.map((row) => row.program_exercise_id))];
        const regionResult = await client.query(
          `
          SELECT pe.id AS program_exercise_id, ec.strength_primary_region
          FROM program_exercise pe
          LEFT JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
          WHERE pe.id = ANY($1::uuid[])
          `,
          [programExerciseIds],
        );
        const regionByProgramExerciseId = new Map(
          regionResult.rows.map((r) => [r.program_exercise_id, r.strength_primary_region]),
        );

        for (const row of rows) {
          const region = regionByProgramExerciseId.get(row.program_exercise_id) ?? null;
          const weightKg = Number(row.weight_kg);
          const repsCompleted = Number(row.reps_completed);
          const estimated1rmKg = compute1rmKg(weightKg, repsCompleted, region);

          await client.query(
            `
            INSERT INTO segment_exercise_log
              (user_id, program_id, program_day_id, workout_segment_id,
               program_exercise_id, order_index, weight_kg, reps_completed, estimated_1rm_kg, is_draft)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false)
            ON CONFLICT ON CONSTRAINT uq_sel_user_segment_exercise
            DO UPDATE SET
              weight_kg      = EXCLUDED.weight_kg,
              reps_completed = EXCLUDED.reps_completed,
              estimated_1rm_kg = EXCLUDED.estimated_1rm_kg,
              order_index    = EXCLUDED.order_index,
              is_draft       = false
            `,
            [
              user_id,
              program_id,
              program_day_id,
              workout_segment_id,
              row.program_exercise_id,
              row.order_index,
              row.weight_kg,
              row.reps_completed,
              estimated1rmKg,
            ],
          );
        }

        await client.query("COMMIT");
        return res.json({ saved: rows.length });
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // no-op
        }
        throw err;
      } finally {
        client.release();
      }
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

  return { getSegmentLog, postSegmentLog };
}

const handlers = createSegmentLogHandlers();
segmentLogRouter.use(requireAuth);

segmentLogRouter.get("/segment-log", handlers.getSegmentLog);
segmentLogRouter.post("/segment-log", handlers.postSegmentLog);
