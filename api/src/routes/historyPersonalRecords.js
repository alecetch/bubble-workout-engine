import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";

const SQL_PERSONAL_RECORDS = `
WITH best AS (
  SELECT
    pe.exercise_id,
    MAX(l.weight_kg) AS best_weight
  FROM segment_exercise_log l
  JOIN program p ON p.id = l.program_id
  JOIN program_day pd ON pd.id = l.program_day_id
  JOIN program_exercise pe ON pe.id = l.program_exercise_id
  WHERE p.user_id = $1
    AND pd.is_completed = TRUE
    AND l.is_draft = FALSE
    AND l.weight_kg IS NOT NULL
  GROUP BY pe.exercise_id
)
SELECT DISTINCT ON (pe.exercise_id)
  pe.exercise_id,
  COALESCE(ec.name, pe.exercise_name) AS exercise_name,
  l.weight_kg AS value,
  pd.scheduled_date AS date,
  l.program_day_id
FROM best b
JOIN segment_exercise_log l ON l.weight_kg = b.best_weight
JOIN program p ON p.id = l.program_id
JOIN program_day pd ON pd.id = l.program_day_id
JOIN program_exercise pe ON pe.id = l.program_exercise_id AND pe.exercise_id = b.exercise_id
LEFT JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
WHERE p.user_id = $1
  AND pd.is_completed = TRUE
  AND l.is_draft = FALSE
ORDER BY pe.exercise_id, pd.scheduled_date DESC
LIMIT $2;
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

function toAuthUserId(req) {
  return (
    req.auth?.user_id ??
    req.auth?.userId ??
    (typeof req.headers?.["x-user-id"] === "string" ? req.headers["x-user-id"] : undefined)
  );
}

export function clampPersonalRecordsLimit(rawLimit) {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) return 20;
  const rounded = Math.floor(parsed);
  if (rounded < 1) return 1;
  if (rounded > 50) return 50;
  return rounded;
}

export function mapPersonalRecordRow(row) {
  return {
    exerciseId: asString(row.exercise_id),
    exerciseName: asString(row.exercise_name),
    metric: "weight_kg",
    value: toFiniteNumber(row.value, 0),
    date: asString(row.date).slice(0, 10),
    programDayId: asString(row.program_day_id),
  };
}

export function createHistoryPersonalRecordsHandler(db = pool) {
  return async function historyPersonalRecordsHandler(req, res) {
    const authUserId = toAuthUserId(req);
    if (!authUserId) {
      return res.status(401).json({
        ok: false,
        code: "unauthorized",
        error: "Missing authenticated user context",
      });
    }

    const limit = clampPersonalRecordsLimit(req.query?.limit);

    try {
      const result = await db.query(SQL_PERSONAL_RECORDS, [authUserId, limit]);
      return res.status(200).json((result.rows ?? []).map(mapPersonalRecordRow));
    } catch (error) {
      console.error("history-personal-records error:", error);
      return res.status(500).json({
        ok: false,
        code: "internal_error",
        error: "Failed to load personal records",
      });
    }
  };
}

export const historyPersonalRecordsRouter = express.Router();

historyPersonalRecordsRouter.get(
  "/v1/history/personal-records",
  requireInternalToken,
  createHistoryPersonalRecordsHandler(pool),
);

