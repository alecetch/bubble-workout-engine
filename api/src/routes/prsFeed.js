import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, safeString } from "../utils/validate.js";

export const prsFeedRouter = express.Router();
prsFeedRouter.use(requireAuth);

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

export function mapPrRow(row) {
  const date = row.scheduled_date?.slice?.(0, 10) ?? row.scheduled_date;
  return {
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    repsCompleted: row.reps_completed == null ? null : Number(row.reps_completed),
    estimatedE1rmKg: row.estimated_1rm_kg == null ? null : Number(row.estimated_1rm_kg),
    date,
    region: row.region ?? null,
    shareLabel: `${row.exercise_name} PR`,
    milestoneType: "weight_pr",
  };
}

export function buildGroupedByDate(rows) {
  const groups = [];
  let current = null;

  for (const row of rows) {
    if (!current || current.date !== row.date) {
      current = { date: row.date, rows: [] };
      groups.push(current);
    }
    current.rows.push(row);
  }

  return groups;
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
      const user_id = resolveUserId(req);

      const rows28 = await fetchPrRows(client, user_id, 28);
      if (rows28.length > 0) {
        return res.json({
          mode: "prs_28d",
          rows: rows28,
          groupedByDate: buildGroupedByDate(rows28),
          totalPrsInWindow: rows28.length,
          heaviest: null,
        });
      }

      const rows90 = await fetchPrRows(client, user_id, 90);
      if (rows90.length > 0) {
        return res.json({
          mode: "prs_90d",
          rows: rows90,
          groupedByDate: buildGroupedByDate(rows90),
          totalPrsInWindow: rows90.length,
          heaviest: null,
        });
      }

      const heaviestResult = await client.query(
        `
        SELECT DISTINCT ON (ec.strength_primary_region)
          pe.exercise_id,
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
          exerciseId: row.exercise_id,
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
        groupedByDate: [],
        totalPrsInWindow: 0,
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
