import express from "express";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { publicInternalError } from "../utils/publicError.js";
import { RequestValidationError, safeString } from "../utils/validate.js";

export const sessionHistoryMetricsRouter = express.Router();
sessionHistoryMetricsRouter.use(requireAuth);

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

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

function mapWeeklyVolumeRows(rows) {
  const grouped = { upper: [], lower: [], full: [] };

  for (const row of rows ?? []) {
    const weekStart = asString(row.week_start).slice(0, 10);
    const volumeLoad = asNumber(row.volume_load, 0);
    const region = asString(row.region);
    if (!weekStart) continue;

    if (region === "upper" || region === "lower" || region === "full") {
      grouped[region].push({ weekStart, volumeLoad });
    }
  }

  return grouped;
}

export function buildStrengthRegionMetricFromRows(rows, region) {
  const bestByRegion = new Map();
  const prevBestByRegion = new Map();

  for (const row of rows ?? []) {
    const rowRegion = asString(row.region);
    if (!rowRegion) continue;

    const currentBest = asNumber(row.current_best, NaN);
    if (!Number.isFinite(currentBest)) continue;

    const prevBest = asNumber(row.prev_best, NaN);
    if (Number.isFinite(prevBest)) {
      const existingPrev = prevBestByRegion.get(rowRegion);
      if (!Number.isFinite(existingPrev) || prevBest > existingPrev) {
        prevBestByRegion.set(rowRegion, prevBest);
      }
    }

    if (!bestByRegion.has(rowRegion)) {
      bestByRegion.set(rowRegion, {
        exerciseId: asString(row.exercise_id),
        exerciseName: row.exercise_name,
        bestE1rmKg: currentBest,
      });
    }
  }

  const best = bestByRegion.get(region);
  if (!best) return null;

  const prevBest = prevBestByRegion.get(region);
  const trendPct = Number.isFinite(prevBest) && prevBest !== 0
    ? (best.bestE1rmKg - prevBest) / prevBest
    : null;

  return {
    exerciseId: best.exerciseId,
    exerciseName: best.exerciseName,
    bestE1rmKg: best.bestE1rmKg,
    trendPct,
  };
}

sessionHistoryMetricsRouter.get("/session-history-metrics", async (req, res) => {
  const { request_id } = req;

  try {
    const client = await pool.connect();
    try {
      const user_id = resolveUserId(req);

      const dayStreakQuery = client.query(
        `
        SELECT scheduled_date, is_completed
        FROM program_day pd
        JOIN program p ON p.id = pd.program_id
        WHERE p.user_id = $1 AND pd.scheduled_date <= CURRENT_DATE
        ORDER BY pd.scheduled_date DESC
        `,
        [user_id],
      );

      const consistency28dQuery = client.query(
        `
        SELECT
          COUNT(*) AS scheduled,
          COUNT(*) FILTER (WHERE is_completed = TRUE) AS completed
        FROM program_day pd
        JOIN program p ON p.id = pd.program_id
        WHERE p.user_id = $1
          AND pd.scheduled_date BETWEEN CURRENT_DATE - 27 AND CURRENT_DATE
        `,
        [user_id],
      );

      const volume28dQuery = client.query(
        `
        SELECT COALESCE(SUM(sel.weight_kg * sel.reps_completed), 0) AS volume
        FROM segment_exercise_log sel
        JOIN program_day pd ON pd.id = sel.program_day_id
        JOIN program p ON p.id = sel.program_id
        WHERE p.user_id = $1
          AND sel.is_draft = FALSE
          AND sel.weight_kg IS NOT NULL
          AND sel.reps_completed IS NOT NULL
          AND pd.scheduled_date >= CURRENT_DATE - 27
        `,
        [user_id],
      );

      const strengthByRegionQuery = client.query(
        `
        WITH current_period AS (
          SELECT
            ec.strength_primary_region AS region,
            ec.exercise_id,
            COALESCE(ec.name, pe.exercise_name) AS exercise_name,
            MAX(sel.estimated_1rm_kg) AS best_e1rm
          FROM segment_exercise_log sel
          JOIN program_exercise pe ON pe.id = sel.program_exercise_id
          JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
          JOIN program_day pd ON pd.id = sel.program_day_id
          JOIN program p ON p.id = sel.program_id
          WHERE p.user_id = $1
            AND sel.estimated_1rm_kg IS NOT NULL
            AND pd.scheduled_date >= CURRENT_DATE - 27
            AND ec.strength_primary_region IN ('upper','lower')
          GROUP BY ec.strength_primary_region, ec.exercise_id, COALESCE(ec.name, pe.exercise_name)
        ),
        prev_period AS (
          SELECT
            ec.strength_primary_region AS region,
            ec.exercise_id,
            COALESCE(ec.name, pe.exercise_name) AS exercise_name,
            MAX(sel.estimated_1rm_kg) AS best_e1rm
          FROM segment_exercise_log sel
          JOIN program_exercise pe ON pe.id = sel.program_exercise_id
          JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
          JOIN program_day pd ON pd.id = sel.program_day_id
          JOIN program p ON p.id = sel.program_id
          WHERE p.user_id = $1
            AND sel.estimated_1rm_kg IS NOT NULL
            AND pd.scheduled_date BETWEEN CURRENT_DATE - 55 AND CURRENT_DATE - 28
            AND ec.strength_primary_region IN ('upper','lower')
          GROUP BY ec.strength_primary_region, ec.exercise_id, COALESCE(ec.name, pe.exercise_name)
        )
        SELECT c.region, c.exercise_id, c.exercise_name, c.best_e1rm AS current_best,
               p.best_e1rm AS prev_best
        FROM current_period c
        LEFT JOIN prev_period p ON p.region = c.region AND p.exercise_id = c.exercise_id
        ORDER BY c.region, c.best_e1rm DESC
        `,
        [user_id],
      );

      const sessionsCountQuery = client.query(
        `
        SELECT COUNT(*) AS count
        FROM program_day pd
        JOIN program p ON p.id = pd.program_id
        WHERE p.user_id = $1 AND pd.is_completed = TRUE
        `,
        [user_id],
      );

      const programmesCompletedQuery = client
        .query(
          `
          SELECT COUNT(DISTINCT p.id) AS count
          FROM program p
          WHERE p.user_id = $1
            AND p.status = 'completed'
          `,
          [user_id],
        )
        .catch(async (err) => {
          if (err?.code === "42703") {
            return client.query(
              `
              SELECT COUNT(*) AS count
              FROM program
              WHERE user_id = $1
              `,
              [user_id],
            );
          }
          throw err;
        });

      const weeklyVolumeByRegionQuery = client.query(
        `
        WITH weeks AS (
          SELECT generate_series(
            date_trunc('week', CURRENT_DATE)::date - INTERVAL '7 weeks',
            date_trunc('week', CURRENT_DATE)::date,
            INTERVAL '1 week'
          )::date AS week_start
        ),
        weekly_logs AS (
          SELECT
            date_trunc('week', pd.scheduled_date)::date AS week_start,
            ec.strength_primary_region AS region,
            SUM(sel.weight_kg * sel.reps_completed) AS volume_load
          FROM segment_exercise_log sel
          JOIN program_day pd ON pd.id = sel.program_day_id
          JOIN program p ON p.id = sel.program_id
          JOIN program_exercise pe ON pe.id = sel.program_exercise_id
          LEFT JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
          WHERE p.user_id = $1
            AND pd.is_completed = TRUE
            AND sel.is_draft = FALSE
            AND sel.weight_kg IS NOT NULL
            AND sel.reps_completed IS NOT NULL
            AND pd.scheduled_date >= date_trunc('week', CURRENT_DATE)::date - INTERVAL '7 weeks'
          GROUP BY date_trunc('week', pd.scheduled_date)::date, ec.strength_primary_region
        )
        SELECT
          weeks.week_start,
          series.region,
          COALESCE(SUM(wl.volume_load), 0) AS volume_load
        FROM weeks
        JOIN (
          SELECT 'upper'::text AS region
          UNION ALL SELECT 'lower'::text
          UNION ALL SELECT 'full'::text
        ) series ON TRUE
        LEFT JOIN weekly_logs wl
          ON wl.week_start = weeks.week_start
          AND (
            (series.region IN ('upper', 'lower') AND wl.region = series.region)
            OR (series.region = 'full')
          )
        GROUP BY weeks.week_start, series.region
        ORDER BY weeks.week_start ASC, series.region ASC
        `,
        [user_id],
      );

      const [
        dayStreakResult,
        consistency28dResult,
        volume28dResult,
        strengthByRegionResult,
        sessionsCountResult,
        programmesCompletedResult,
        weeklyVolumeByRegionResult,
      ] = await Promise.all([
        dayStreakQuery,
        consistency28dQuery,
        volume28dQuery,
        strengthByRegionQuery,
        sessionsCountQuery,
        programmesCompletedQuery,
        weeklyVolumeByRegionQuery,
      ]);

      let dayStreak = 0;
      for (const row of dayStreakResult.rows) {
        if (row.is_completed === true) {
          dayStreak += 1;
        } else {
          break;
        }
      }

      const consistencyScheduled = asNumber(consistency28dResult.rows[0]?.scheduled, 0);
      const consistencyCompleted = asNumber(consistency28dResult.rows[0]?.completed, 0);
      const consistencyRate = consistencyScheduled > 0 ? consistencyCompleted / consistencyScheduled : 0;
      const volume28d = asNumber(volume28dResult.rows[0]?.volume, 0);

      return res.json({
        dayStreak,
        consistency28d: {
          completed: consistencyCompleted,
          scheduled: consistencyScheduled,
          rate: consistencyRate,
        },
        volume28d,
        strengthUpper28d: buildStrengthRegionMetricFromRows(strengthByRegionResult.rows, "upper"),
        strengthLower28d: buildStrengthRegionMetricFromRows(strengthByRegionResult.rows, "lower"),
        weeklyVolumeByRegion8w: mapWeeklyVolumeRows(weeklyVolumeByRegionResult.rows),
        sessionsCount: asNumber(sessionsCountResult.rows[0]?.count, 0),
        programmesCompleted: asNumber(programmesCompletedResult.rows[0]?.count, 0),
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
