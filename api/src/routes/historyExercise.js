import express from "express";
import { pool } from "../db.js";
import { userAuth } from "../middleware/chains.js";

const WINDOW_DAYS_BY_KEY = {
  "4w": 28,
  "8w": 56,
  "12w": 84,
};

const SQL_EXERCISE_SUMMARY = `
SELECT
  MAX(pd.scheduled_date) AS last_performed,
  MAX(l.weight_kg) AS best_weight_kg,
  MAX(l.estimated_1rm_kg) AS best_estimated_e1rm_kg,
  COUNT(DISTINCT pd.id) AS sessions_count
FROM segment_exercise_log l
JOIN program p ON p.id = l.program_id
JOIN program_day pd ON pd.id = l.program_day_id
JOIN program_exercise pe ON pe.id = l.program_exercise_id
WHERE p.user_id = $1
  AND pd.is_completed = TRUE
  AND l.is_draft = FALSE
  AND pe.exercise_id = $2;
`;

const SQL_EXERCISE_NAME = `
SELECT COALESCE(
  (SELECT ec.name
   FROM exercise_catalogue ec
   WHERE ec.exercise_id = $2
   LIMIT 1),
  (SELECT pe.exercise_name
   FROM program_exercise pe
   JOIN program p ON p.id = pe.program_id
   WHERE pe.exercise_id = $2
     AND p.user_id = $1
     AND pe.exercise_name IS NOT NULL
   LIMIT 1),
  $2
) AS exercise_name;
`;

function resolveWindowKey(rawValue) {
  const text = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
  if (text === "4w" || text === "8w" || text === "12w" || text === "all") return text;
  return "12w";
}

function resolveIncludeDecisions(rawValue) {
  if (typeof rawValue !== "string") return true;
  return rawValue.trim().toLowerCase() !== "false";
}

function buildSeriesQuery({ includeDecisions, windowKey }) {
  const params = ["$1", "$2"];
  let windowClause = "\nWHERE daily.date <= CURRENT_DATE";
  if (windowKey !== "all") {
    params.push(`$${params.length + 1}`);
    windowClause += `\n  AND daily.date >= CURRENT_DATE - (${params[2]} - 1)`;
  }

  const decisionColumns = includeDecisions
    ? `,
  decision.decision_outcome,
  decision.primary_lever AS decision_primary_lever`
    : `,
  NULL::text AS decision_outcome,
  NULL::text AS decision_primary_lever`;

  const decisionJoin = includeDecisions
    ? `
LEFT JOIN LATERAL (
  SELECT
    epd.decision_outcome,
    epd.primary_lever
  FROM exercise_progression_decision epd
  WHERE epd.user_id = $1
    AND epd.exercise_id = daily.exercise_id
    AND epd.created_at::date <= daily.date
  ORDER BY
    CASE WHEN epd.program_day_id = daily.program_day_id THEN 0 ELSE 1 END ASC,
    epd.created_at DESC,
    epd.id DESC
  LIMIT 1
) decision ON TRUE`
    : "";

  return `
WITH daily AS (
  SELECT
    pd.id AS program_day_id,
    CASE
      WHEN MAX((l.created_at AT TIME ZONE 'UTC')::date) IS NOT NULL
        AND pd.scheduled_date > MAX((l.created_at AT TIME ZONE 'UTC')::date)
        THEN MAX((l.created_at AT TIME ZONE 'UTC')::date)
      ELSE pd.scheduled_date
    END AS date,
    pe.exercise_id,
    MAX(l.weight_kg) AS top_weight_kg,
    MAX(l.reps_completed) FILTER (WHERE l.weight_kg IS NOT NULL) AS top_reps,
    SUM(l.weight_kg * l.reps_completed) AS tonnage,
    MAX(l.estimated_1rm_kg) AS estimated_e1rm_kg
  FROM segment_exercise_log l
  JOIN program p ON p.id = l.program_id
  JOIN program_day pd ON pd.id = l.program_day_id
  JOIN program_exercise pe ON pe.id = l.program_exercise_id
  WHERE p.user_id = $1
    AND pd.is_completed = TRUE
    AND l.is_draft = FALSE
    AND pe.exercise_id = $2
  GROUP BY pd.id, pd.scheduled_date, pe.exercise_id
)
SELECT
  daily.date,
  daily.top_weight_kg,
  daily.top_reps,
  daily.tonnage,
  daily.estimated_e1rm_kg${decisionColumns}
FROM daily${decisionJoin}${windowClause}
ORDER BY daily.date DESC
LIMIT 180;
`;
}

function asString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

function toFiniteNumberOrNull(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toDateOnly(value) {
  return asString(value).slice(0, 10);
}

function toAuthUserId(req) {
  return (
    req.auth?.user_id ??
    req.auth?.userId ??
    (typeof req.headers?.["x-user-id"] === "string" ? req.headers["x-user-id"] : undefined)
  );
}

function mapSeriesRow(row) {
  return {
    date: toDateOnly(row.date),
    topWeightKg: toFiniteNumberOrNull(row.top_weight_kg),
    tonnage: toFiniteNumberOrNull(row.tonnage),
    topReps: toFiniteNumberOrNull(row.top_reps),
    estimatedE1rmKg: toFiniteNumberOrNull(row.estimated_e1rm_kg),
    decisionOutcome: asString(row.decision_outcome || "", "") || null,
    decisionPrimaryLever: asString(row.decision_primary_lever || "", "") || null,
  };
}

function mapSummaryRow(row) {
  return {
    lastPerformed: row?.last_performed == null ? null : toDateOnly(row.last_performed),
    bestWeightKg: toFiniteNumberOrNull(row?.best_weight_kg),
    bestEstimatedE1rmKg: toFiniteNumberOrNull(row?.best_estimated_e1rm_kg),
    sessionsCount: Number.isFinite(Number(row?.sessions_count)) ? Number(row.sessions_count) : 0,
  };
}

export function createHistoryExerciseHandler(db = pool) {
  return async function historyExerciseHandler(req, res) {
    const authUserId = toAuthUserId(req);
    if (!authUserId) {
      return res.status(401).json({
        ok: false,
        code: "unauthorized",
        error: "Missing authenticated user context",
      });
    }

    const exerciseId = typeof req.params?.exerciseId === "string" ? req.params.exerciseId.trim() : "";
    const windowKey = resolveWindowKey(req.query?.window);
    const includeDecisions = resolveIncludeDecisions(req.query?.include_decisions);
    if (!exerciseId) {
      return res.status(400).json({
        ok: false,
        code: "validation_error",
        error: "exerciseId is required",
      });
    }

    try {
      const seriesQuery = buildSeriesQuery({ includeDecisions, windowKey });
      const seriesParams =
        windowKey === "all" ? [authUserId, exerciseId] : [authUserId, exerciseId, WINDOW_DAYS_BY_KEY[windowKey]];
      const [seriesResult, summaryResult, nameResult] = await Promise.all([
        db.query(seriesQuery, seriesParams),
        db.query(SQL_EXERCISE_SUMMARY, [authUserId, exerciseId]),
        db.query(SQL_EXERCISE_NAME, [authUserId, exerciseId]),
      ]);

      // SQL returns DESC (most-recent first, LIMIT 180). Reverse to restore ASC
      // for the caller so the sparkline and date list read oldest → newest.
      const series = (seriesResult.rows ?? []).slice().reverse().map(mapSeriesRow);
      const summary = mapSummaryRow((summaryResult.rows ?? [])[0]);
      const exerciseName = asString((nameResult.rows ?? [])[0]?.exercise_name, exerciseId);

      return res.status(200).json({
        exerciseId,
        exerciseName,
        series,
        summary,
      });
    } catch (error) {
      req.log.error({ event: "history.exercise.error", err: error?.message }, "history-exercise query failed");
      return res.status(500).json({
        ok: false,
        code: "internal_error",
        error: "Failed to load exercise history",
      });
    }
  };
}

export const historyExerciseRouter = express.Router();

historyExerciseRouter.get(
  "/v1/history/exercise/:exerciseId",
  ...userAuth,
  createHistoryExerciseHandler(pool),
);
