import express from "express";
import { pool } from "../db.js";

export const loggedExercisesRouter = express.Router();

class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ValidationError";
    this.status = 400;
    this.details = details;
  }
}

class NotFoundError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "NotFoundError";
    this.status = 404;
    this.details = details;
  }
}

function s(v) {
  return (v ?? "").toString().trim();
}

function isUuid(v) {
  // Accept standard UUID v1-v5 formats (case-insensitive).
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s(v));
}

async function resolveUserId(client, query) {
  const user_id = s(query.user_id);
  const bubble_user_id = s(query.bubble_user_id);

  if (user_id) {
    if (!isUuid(user_id)) {
      throw new ValidationError("Invalid user_id");
    }
    return user_id;
  }

  if (!bubble_user_id) {
    throw new ValidationError("Provide user_id or bubble_user_id");
  }

  const r = await client.query(
    `
    SELECT id
    FROM app_user
    WHERE bubble_user_id = $1
    LIMIT 1
    `,
    [bubble_user_id],
  );

  if (r.rowCount === 0) {
    throw new NotFoundError("User not found for bubble_user_id");
  }

  return r.rows[0].id;
}

function mapError(err) {
  if (err instanceof ValidationError || err instanceof NotFoundError) {
    return { status: err.status ?? 400, code: err instanceof NotFoundError ? "not_found" : "validation_error", message: err.message, details: err.details };
  }
  if (err && typeof err === "object") {
    // Common Postgres codes.
    if (err.code === "22P02") return { status: 400, code: "invalid_input", message: "Invalid input format" };
    if (err.code === "23503") return { status: 400, code: "foreign_key_violation", message: "Invalid reference" };
    if (err.code === "23505") return { status: 409, code: "unique_violation", message: "Duplicate conflict" };
    if (err.code === "42P01") return { status: 500, code: "schema_missing", message: "Required table is missing; run migrations" };
  }
  return { status: 500, code: "internal_error", message: err?.message || "Internal server error" };
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
  const q = s(req.query.q);

  try {
    if (q.length < 2) {
      throw new ValidationError("q must be at least 2 characters");
    }

    const client = await pool.connect();
    try {
      const user_id = await resolveUserId(client, req.query);

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
  const exercise_id = s(req.query.exercise_id);

  try {
    if (!exercise_id) {
      throw new ValidationError("exercise_id is required");
    }

    const client = await pool.connect();
    try {
      const user_id = await resolveUserId(client, req.query);

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
