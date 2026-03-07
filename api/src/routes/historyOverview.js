import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";
import { resolveBubbleUser } from "../middleware/resolveUser.js";

const SQL_HISTORY_OVERVIEW = `
WITH user_program_days AS (
  SELECT
    pd.id,
    pd.program_id,
    pd.scheduled_date,
    pd.session_duration_mins,
    pd.is_completed
  FROM program_day pd
  JOIN program p ON p.id = pd.program_id
  WHERE p.user_id = $1
),
completed_days AS (
  SELECT * FROM user_program_days WHERE is_completed = TRUE
),
sessions AS (
  SELECT
    COUNT(*) AS sessions_completed,
    COALESCE(SUM(session_duration_mins), 0)::float / 60 AS training_hours_completed,
    MAX(scheduled_date) AS last_completed_date
  FROM completed_days
),
program_progress AS (
  SELECT
    p.id,
    COUNT(pd.id) AS total_sessions,
    COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE) AS completed_sessions
  FROM program p
  LEFT JOIN program_day pd ON pd.program_id = p.id
  WHERE p.user_id = $1
    AND p.is_ready = TRUE
  GROUP BY p.id
),
programs_completed AS (
  SELECT
    COUNT(*) AS programs_completed
  FROM program_progress
  WHERE total_sessions > 0
    AND (completed_sessions::float / total_sessions) >= 0.9
),
consistency AS (
  SELECT
    COUNT(*) FILTER (WHERE upd.scheduled_date >= current_date - interval '29 days')::float AS scheduled_last_30,
    COUNT(*) FILTER (
      WHERE upd.scheduled_date >= current_date - interval '29 days'
        AND upd.is_completed = TRUE
    )::float AS completed_last_30,
    COUNT(*) FILTER (
      WHERE upd.scheduled_date >= current_date - interval '59 days'
        AND upd.scheduled_date < current_date - interval '29 days'
    )::float AS scheduled_prev_30,
    COUNT(*) FILTER (
      WHERE upd.scheduled_date >= current_date - interval '59 days'
        AND upd.scheduled_date < current_date - interval '29 days'
        AND upd.is_completed = TRUE
    )::float AS completed_prev_30
  FROM user_program_days upd
),
log_rows AS (
  SELECT
    cd.scheduled_date,
    l.weight_kg,
    l.reps_completed
  FROM completed_days cd
  JOIN segment_exercise_log l ON l.program_day_id = cd.id
  WHERE l.is_draft = FALSE
),
day_strength AS (
  SELECT
    scheduled_date,
    MAX(weight_kg) AS day_max_weight
  FROM log_rows
  WHERE weight_kg IS NOT NULL
  GROUP BY scheduled_date
),
day_volume AS (
  SELECT
    scheduled_date,
    SUM(weight_kg * reps_completed) AS day_tonnage
  FROM log_rows
  WHERE weight_kg IS NOT NULL
    AND reps_completed IS NOT NULL
  GROUP BY scheduled_date
),
strength_windows AS (
  SELECT
    AVG(
      CASE
        WHEN scheduled_date >= current_date - interval '27 days'
          THEN day_max_weight
      END
    ) AS avg_last_28,
    AVG(
      CASE
        WHEN scheduled_date >= current_date - interval '55 days'
          AND scheduled_date < current_date - interval '27 days'
          THEN day_max_weight
      END
    ) AS avg_prev_28
  FROM day_strength
),
volume_windows AS (
  SELECT
    AVG(
      CASE
        WHEN scheduled_date >= current_date - interval '27 days'
          THEN day_tonnage
      END
    ) AS avg_last_28,
    AVG(
      CASE
        WHEN scheduled_date >= current_date - interval '55 days'
          AND scheduled_date < current_date - interval '27 days'
          THEN day_tonnage
      END
    ) AS avg_prev_28
  FROM day_volume
)
SELECT
  s.sessions_completed,
  s.training_hours_completed,
  s.last_completed_date,
  pc.programs_completed,
  c.scheduled_last_30,
  c.completed_last_30,
  c.scheduled_prev_30,
  c.completed_prev_30,
  sw.avg_last_28 AS strength_avg_last_28,
  sw.avg_prev_28 AS strength_avg_prev_28,
  vw.avg_last_28 AS volume_avg_last_28,
  vw.avg_prev_28 AS volume_avg_prev_28
FROM sessions s
CROSS JOIN programs_completed pc
CROSS JOIN consistency c
CROSS JOIN strength_windows sw
CROSS JOIN volume_windows vw;
`;

const SQL_STREAK_DATES = `
SELECT pd.scheduled_date
FROM program_day pd
JOIN program p ON p.id = pd.program_id
WHERE p.user_id = $1
  AND pd.is_completed = TRUE
ORDER BY pd.scheduled_date DESC
LIMIT 500;
`;

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

function asNullableIsoDate(value) {
  const raw = asString(value, "");
  if (!raw) return null;
  return raw.slice(0, 10);
}

function toDateOnlyIso(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function diffDays(isoA, isoB) {
  const a = new Date(`${isoA}T00:00:00Z`);
  const b = new Date(`${isoB}T00:00:00Z`);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

export function calculateCurrentStreakDays(completedDateRows, todayIso) {
  const normalized = [];
  const seen = new Set();

  for (const row of completedDateRows ?? []) {
    const iso = asNullableIsoDate(row?.scheduled_date ?? row);
    if (!iso || seen.has(iso)) continue;
    seen.add(iso);
    normalized.push(iso);
  }

  if (normalized.length === 0) return 0;

  const lastCompleted = normalized[0];
  if (diffDays(todayIso, lastCompleted) > 1) return 0;

  let streak = 1;
  for (let i = 1; i < normalized.length; i += 1) {
    const delta = diffDays(normalized[i - 1], normalized[i]);
    if (delta === 1) {
      streak += 1;
      continue;
    }
    if (delta === 0) {
      continue;
    }
    break;
  }
  return streak;
}

function buildConsistency(scheduledLast, completedLast, scheduledPrev, completedPrev) {
  const value = scheduledLast > 0 ? completedLast / scheduledLast : 0;
  const prevValue = scheduledPrev > 0 ? completedPrev / scheduledPrev : null;
  return {
    value,
    delta: prevValue == null ? null : value - prevValue,
  };
}

function buildTrend(avgLast, avgPrev) {
  const hasLast = Number.isFinite(avgLast);
  const hasPrev = Number.isFinite(avgPrev);
  const delta = hasLast && hasPrev ? avgLast - avgPrev : null;
  const value = hasLast && hasPrev && avgPrev !== 0 ? (avgLast - avgPrev) / avgPrev : null;
  return {
    value,
    delta,
  };
}

function toAuthUserId(req) {
  return (
    req.auth?.user_id ??
    req.auth?.userId ??
    (typeof req.headers?.["x-user-id"] === "string" ? req.headers["x-user-id"] : undefined)
  );
}

export function createHistoryOverviewHandler(db = pool, nowProvider = () => new Date()) {
  return async function historyOverviewHandler(req, res) {
    const authUserId = toAuthUserId(req);
    if (!authUserId) {
      return res.status(401).json({
        ok: false,
        code: "unauthorized",
        error: "Missing authenticated user context",
      });
    }

    try {
      const overviewResult = await db.query(SQL_HISTORY_OVERVIEW, [authUserId]);
      const streakResult = await db.query(SQL_STREAK_DATES, [authUserId]);
      const row = overviewResult.rows?.[0] ?? {};

      const sessionsCompleted = toFiniteNumber(row.sessions_completed, 0);
      const trainingHoursCompleted = toFiniteNumber(row.training_hours_completed, 0);
      const lastCompletedDate = asNullableIsoDate(row.last_completed_date);
      const programsCompleted = toFiniteNumber(row.programs_completed, 0);

      const consistency = buildConsistency(
        toFiniteNumber(row.scheduled_last_30, 0),
        toFiniteNumber(row.completed_last_30, 0),
        toFiniteNumber(row.scheduled_prev_30, 0),
        toFiniteNumber(row.completed_prev_30, 0),
      );

      const strengthTrend28d = buildTrend(
        toFiniteNumber(row.strength_avg_last_28, Number.NaN),
        toFiniteNumber(row.strength_avg_prev_28, Number.NaN),
      );

      const volumeTrend28d = buildTrend(
        toFiniteNumber(row.volume_avg_last_28, Number.NaN),
        toFiniteNumber(row.volume_avg_prev_28, Number.NaN),
      );

      const todayIso = toDateOnlyIso(nowProvider()) ?? asNullableIsoDate(new Date().toISOString());
      const currentStreakDays = todayIso
        ? calculateCurrentStreakDays(streakResult.rows ?? [], todayIso)
        : 0;

      return res.status(200).json({
        sessionsCompleted,
        trainingHoursCompleted,
        lastCompletedDate,
        currentStreakDays,
        programsCompleted,
        consistency30d: consistency,
        strengthTrend28d,
        volumeTrend28d,
      });
    } catch (error) {
      console.error("history-overview error:", error);
      return res.status(500).json({
        ok: false,
        code: "internal_error",
        error: "Failed to load history overview",
      });
    }
  };
}

export const historyOverviewRouter = express.Router();

historyOverviewRouter.get(
  "/v1/history/overview",
  requireInternalToken,
  resolveBubbleUser,
  createHistoryOverviewHandler(pool),
);

