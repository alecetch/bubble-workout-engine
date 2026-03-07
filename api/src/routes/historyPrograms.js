import express from "express";
import { pool } from "../db.js";
import { requireInternalToken } from "../middleware/auth.js";
import { resolveBubbleUser } from "../middleware/resolveUser.js";

const SQL_HISTORY_PROGRAMS = `
SELECT
  p.id AS program_id,
  p.program_title,
  p.program_summary,
  p.start_date,
  p.status,
  p.hero_media_id,
  COUNT(pd.id) AS total_sessions,
  COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE) AS completed_sessions,
  CASE WHEN COUNT(pd.id)=0 THEN 0
       ELSE (COUNT(pd.id) FILTER (WHERE pd.is_completed = TRUE))::float / COUNT(pd.id)
  END AS completion_ratio
FROM program p
LEFT JOIN program_day pd ON pd.program_id = p.id
WHERE p.user_id = $1
  AND p.is_ready = TRUE
GROUP BY p.id
ORDER BY p.start_date DESC, p.created_at DESC
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

export function clampLimit(rawLimit) {
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) return 10;
  const rounded = Math.floor(parsed);
  if (rounded < 1) return 1;
  if (rounded > 50) return 50;
  return rounded;
}

export function mapHistoryProgramRow(row) {
  return {
    programId: asString(row.program_id),
    programTitle: asString(row.program_title),
    programSummary: asString(row.program_summary),
    startDate: asString(row.start_date),
    status: asString(row.status),
    totalSessions: toFiniteNumber(row.total_sessions, 0),
    completedSessions: toFiniteNumber(row.completed_sessions, 0),
    completionRatio: toFiniteNumber(row.completion_ratio, 0),
    heroMediaId: row.hero_media_id == null ? null : asString(row.hero_media_id),
  };
}

export function createHistoryProgramsHandler(db = pool) {
  return async function historyProgramsHandler(req, res) {
    const authUserId =
      req.auth?.user_id ??
      req.auth?.userId ??
      (typeof req.headers?.["x-user-id"] === "string" ? req.headers["x-user-id"] : undefined);
    if (!authUserId) {
      return res.status(401).json({
        ok: false,
        code: "unauthorized",
        error: "Missing authenticated user context",
      });
    }

    const limit = clampLimit(req.query?.limit);

    try {
      const result = await db.query(SQL_HISTORY_PROGRAMS, [authUserId, limit]);
      return res.status(200).json(result.rows.map(mapHistoryProgramRow));
    } catch (error) {
      console.error("history-programs error:", error);
      return res.status(500).json({
        ok: false,
        code: "internal_error",
        error: "Failed to load program history",
      });
    }
  };
}

export const historyProgramsRouter = express.Router();

historyProgramsRouter.get(
  "/v1/history/programs",
  requireInternalToken,
  resolveBubbleUser,
  createHistoryProgramsHandler(pool),
);
