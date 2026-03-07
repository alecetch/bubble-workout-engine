import express from "express";
import { pool } from "../db.js";

export const segmentLogRouter = express.Router();

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

segmentLogRouter.get("/segment-log", async (req, res) => {
  const { request_id } = req;
  const workout_segment_id = s(req.query.workout_segment_id);
  const program_day_id = s(req.query.program_day_id);

  try {
    if (!isUuid(workout_segment_id)) throw new ValidationError("Invalid workout_segment_id");
    if (!isUuid(program_day_id)) throw new ValidationError("Invalid program_day_id");

    const client = await pool.connect();
    try {
      const user_id = await resolveUserId(client, req.query);
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
});

segmentLogRouter.post("/segment-log", async (req, res) => {
  const { request_id } = req;
  const program_id = s(req.body?.program_id);
  const program_day_id = s(req.body?.program_day_id);
  const workout_segment_id = s(req.body?.workout_segment_id);
  const rows = req.body?.rows;

  try {
    if (!isUuid(program_id)) throw new ValidationError("Invalid program_id");
    if (!isUuid(program_day_id)) throw new ValidationError("Invalid program_day_id");
    if (!isUuid(workout_segment_id)) throw new ValidationError("Invalid workout_segment_id");
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ValidationError("rows must be a non-empty array");
    }
    for (const row of rows) {
      if (!isUuid(row?.program_exercise_id)) {
        throw new ValidationError("Invalid program_exercise_id");
      }
    }

    const client = await pool.connect();
    try {
      const user_id = await resolveUserId(client, req.body);
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

        let estimated1rmKg = null;
        if (
          Number.isFinite(weightKg) &&
          Number.isFinite(repsCompleted) &&
          weightKg > 0 &&
          repsCompleted >= 1
        ) {
          const epley = weightKg * (1 + repsCompleted / 30);
          if (region === "lower" && repsCompleted < 37) {
            estimated1rmKg = (weightKg * 36) / (37 - repsCompleted);
          } else {
            // Fallback for upper/unknown regions and any invalid Brzycki denominator.
            estimated1rmKg = epley;
          }
          estimated1rmKg = Number(estimated1rmKg.toFixed(2));
        }

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
});
