import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, requireNonEmpty, safeString } from "../utils/validate.js";

export const loggedExercisesRouter = express.Router();
loggedExercisesRouter.use(requireAuth);

class NotFoundError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "NotFoundError";
    this.status = 404;
    this.details = details;
  }
}

function resolveUserId(req) {
  const userId = safeString(req.auth?.user_id);
  if (userId) return userId;
  throw new RequestValidationError("Missing authenticated user context");
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

function mapBestRow(row) {
  if (!row) return null;
  return {
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    repsCompleted: row.reps_completed == null ? null : Number(row.reps_completed),
    estimatedE1rmKg: row.estimated_1rm_kg == null ? null : Number(row.estimated_1rm_kg),
    date: row.scheduled_date,
  };
}

loggedExercisesRouter.get("/logged-exercises/search", async (req, res) => {
  const { request_id } = req;
  const q = safeString(req.query.q);

  try {
    if (q.length < 2) {
      throw new RequestValidationError("q must be at least 2 characters");
    }

    const client = await pool.connect();
    try {
      const user_id = resolveUserId(req);

      const result = await client.query(
        `
        SELECT DISTINCT ON (pe.exercise_id)
          pe.exercise_id,
          COALESCE(ec.name, pe.exercise_name) AS exercise_name
        FROM segment_exercise_log sel
        JOIN program_exercise pe ON pe.id = sel.program_exercise_id
        LEFT JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
        JOIN program p ON p.id = sel.program_id
        WHERE p.user_id = $1
          AND sel.is_draft = FALSE
          AND COALESCE(ec.name, pe.exercise_name) ILIKE $2
        ORDER BY pe.exercise_id, COALESCE(ec.name, pe.exercise_name) ASC
        LIMIT 20
        `,
        [user_id, `%${q}%`],
      );

      return res.json({
        exercises: result.rows.map((row) => ({
          exerciseId: row.exercise_id,
          exerciseName: row.exercise_name,
        })),
      });
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
});

loggedExercisesRouter.get("/exercise-summary", async (req, res) => {
  const { request_id } = req;

  try {
    const exercise_id = requireNonEmpty(req.query.exercise_id, "exercise_id");
    const client = await pool.connect();
    try {
      const user_id = resolveUserId(req);

      const bestEverQuery = client.query(
        `
        SELECT sel.weight_kg, sel.reps_completed, sel.estimated_1rm_kg, pd.scheduled_date
        FROM segment_exercise_log sel
        JOIN program_exercise pe ON pe.id = sel.program_exercise_id
        JOIN program_day pd ON pd.id = sel.program_day_id
        JOIN program p ON p.id = sel.program_id
        WHERE p.user_id = $1
          AND pe.exercise_id = $2
          AND sel.is_draft = FALSE
          AND sel.weight_kg IS NOT NULL
        ORDER BY sel.weight_kg DESC, sel.reps_completed DESC NULLS LAST, pd.scheduled_date DESC
        LIMIT 1
        `,
        [user_id, exercise_id],
      );

      const best28dQuery = client.query(
        `
        SELECT sel.weight_kg, sel.reps_completed, sel.estimated_1rm_kg, pd.scheduled_date
        FROM segment_exercise_log sel
        JOIN program_exercise pe ON pe.id = sel.program_exercise_id
        JOIN program_day pd ON pd.id = sel.program_day_id
        JOIN program p ON p.id = sel.program_id
        WHERE p.user_id = $1
          AND pe.exercise_id = $2
          AND sel.is_draft = FALSE
          AND sel.weight_kg IS NOT NULL
          AND pd.scheduled_date >= CURRENT_DATE - 27
        ORDER BY sel.weight_kg DESC, sel.reps_completed DESC NULLS LAST, pd.scheduled_date DESC
        LIMIT 1
        `,
        [user_id, exercise_id],
      );

      const exerciseNameQuery = client.query(
        `
        SELECT COALESCE(ec.name, '') AS exercise_name
        FROM exercise_catalogue ec
        WHERE ec.exercise_id = $1
        LIMIT 1
        `,
        [exercise_id],
      );

      const [bestEverResult, best28dResult, exerciseNameResult] = await Promise.all([
        bestEverQuery,
        best28dQuery,
        exerciseNameQuery,
      ]);

      return res.json({
        exerciseId: exercise_id,
        exerciseName: exerciseNameResult.rows[0]?.exercise_name ?? "",
        bestEver: mapBestRow(bestEverResult.rows[0]),
        best28d: mapBestRow(best28dResult.rows[0]),
      });
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
});
