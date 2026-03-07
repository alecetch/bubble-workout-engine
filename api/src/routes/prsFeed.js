import express from "express";
import { pool } from "../db.js";

export const prsFeedRouter = express.Router();

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

function mapPrRow(row) {
  return {
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    repsCompleted: row.reps_completed == null ? null : Number(row.reps_completed),
    estimatedE1rmKg: row.estimated_1rm_kg == null ? null : Number(row.estimated_1rm_kg),
    date: row.scheduled_date,
    region: row.region ?? null,
  };
}

async function fetchPrRows(client, userId, windowDays) {
  const result = await client.query(
    `
    WITH all_logs AS (
      SELECT
        sel.id,
        sel.weight_kg,
        sel.reps_completed,
        sel.estimated_1rm_kg,
        sel.created_at,
        pe.exercise_id,
        COALESCE(ec.name, pe.exercise_name) AS exercise_name,
        ec.strength_primary_region AS region,
        pd.scheduled_date
      FROM segment_exercise_log sel
      JOIN program_exercise pe ON pe.id = sel.program_exercise_id
      LEFT JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
      JOIN program_day pd ON pd.id = sel.program_day_id
      JOIN program p ON p.id = sel.program_id
      WHERE p.user_id = $1
        AND sel.is_draft = FALSE
        AND sel.weight_kg IS NOT NULL
    ),
    with_prev AS (
      SELECT *,
        MAX(weight_kg) OVER (
          PARTITION BY exercise_id
          ORDER BY scheduled_date ASC, created_at ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS prev_best_kg
      FROM all_logs
    ),
    prs AS (
      SELECT * FROM with_prev
      WHERE weight_kg > COALESCE(prev_best_kg, 0)
        AND scheduled_date >= CURRENT_DATE - ($2 - 1)
    )
    SELECT DISTINCT ON (exercise_id)
      exercise_id, exercise_name, weight_kg, reps_completed,
      estimated_1rm_kg, scheduled_date, region
    FROM prs
    ORDER BY exercise_id, scheduled_date DESC
    `,
    [userId, windowDays],
  );

  return result.rows.map(mapPrRow);
}

prsFeedRouter.get("/prs-feed", async (req, res) => {
  const { request_id } = req;

  try {
    const client = await pool.connect();
    try {
      const user_id = await resolveUserId(client, req.query);

      const rows28 = await fetchPrRows(client, user_id, 28);
      if (rows28.length > 0) {
        return res.json({
          mode: "prs_28d",
          rows: rows28,
          heaviest: null,
        });
      }

      const rows90 = await fetchPrRows(client, user_id, 90);
      if (rows90.length > 0) {
        return res.json({
          mode: "prs_90d",
          rows: rows90,
          heaviest: null,
        });
      }

      const heaviestResult = await client.query(
        `
        SELECT DISTINCT ON (ec.strength_primary_region)
          COALESCE(ec.name, pe.exercise_name) AS exercise_name,
          sel.weight_kg, sel.reps_completed, sel.estimated_1rm_kg, pd.scheduled_date,
          ec.strength_primary_region AS region
        FROM segment_exercise_log sel
        JOIN program_exercise pe ON pe.id = sel.program_exercise_id
        LEFT JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
        JOIN program_day pd ON pd.id = sel.program_day_id
        JOIN program p ON p.id = sel.program_id
        WHERE p.user_id = $1
          AND ec.strength_primary_region IN ('upper','lower')
          AND sel.is_draft = FALSE
          AND sel.weight_kg IS NOT NULL
          AND pd.scheduled_date >= CURRENT_DATE - 27
        ORDER BY ec.strength_primary_region, sel.weight_kg DESC
        `,
        [user_id],
      );

      const heaviest = { upper: null, lower: null };
      for (const row of heaviestResult.rows) {
        const region = row.region;
        if (region !== "upper" && region !== "lower") continue;
        heaviest[region] = {
          exerciseName: row.exercise_name,
          weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
          repsCompleted: row.reps_completed == null ? null : Number(row.reps_completed),
          estimatedE1rmKg: row.estimated_1rm_kg == null ? null : Number(row.estimated_1rm_kg),
          date: row.scheduled_date,
        };
      }

      return res.json({
        mode: "heaviest_28d",
        rows: [],
        heaviest,
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
