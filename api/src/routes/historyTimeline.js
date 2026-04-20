import express from "express";
import { pool } from "../db.js";
import { userAuth } from "../middleware/chains.js";
import { clampInt, requireUuid, safeString } from "../utils/validate.js";

const SQL_HISTORY_TIMELINE = `
SELECT
  pd.id AS program_day_id,
  pd.program_id,
  pd.scheduled_date,
  pd.day_label,
  pd.day_type,
  pd.session_duration_mins,
  pd.hero_media_id
FROM program_day pd
JOIN program p ON p.id = pd.program_id
WHERE p.user_id = $1
  AND pd.is_completed = TRUE
  AND (
    ($3::date IS NULL)
    OR (pd.scheduled_date, pd.id) < ($3::date, $4::uuid)
  )
ORDER BY pd.scheduled_date DESC, pd.id DESC
LIMIT $2;
`;

const SQL_HISTORY_HIGHLIGHTS = `
SELECT
  l.program_day_id,
  MAX(l.weight_kg) AS max_weight_kg,
  (ARRAY_AGG(COALESCE(ec.name, pe.exercise_name) ORDER BY l.weight_kg DESC NULLS LAST))[1] AS exercise_name,
  (ARRAY_AGG(pe.exercise_id ORDER BY l.weight_kg DESC NULLS LAST))[1] AS exercise_id
FROM segment_exercise_log l
JOIN program_exercise pe ON pe.id = l.program_exercise_id
LEFT JOIN exercise_catalogue ec ON ec.exercise_id = pe.exercise_id
WHERE l.is_draft = FALSE
  AND l.weight_kg IS NOT NULL
  AND l.program_day_id = ANY($1::uuid[])
GROUP BY l.program_day_id;
`;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function asString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
}

function asNullableString(value) {
  if (value == null) return null;
  return asString(value);
}

function toFiniteNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function mapHighlight(row) {
  if (row == null || row.max_weight_kg == null) return null;
  return {
    value: toFiniteNumber(row.max_weight_kg, 0),
    exerciseName: asString(row.exercise_name),
    exerciseId: asString(row.exercise_id),
  };
}

export function clampTimelineLimit(rawLimit) {
  if (rawLimit === undefined) return 40;
  if (safeString(rawLimit) === "") return 1;
  return clampInt(rawLimit, { defaultValue: 40, min: 1, max: 100 });
}

export function parseTimelineCursor(query) {
  const rawDate = safeString(query?.cursorDate);
  const rawId = safeString(query?.cursorId);

  if (!rawDate && !rawId) {
    return { cursorDate: null, cursorId: null };
  }

  try {
    requireUuid(rawId, "cursorId");
  } catch {
    return { error: "Invalid cursorDate/cursorId" };
  }

  if (!ISO_DATE_RE.test(rawDate)) {
    return { error: "Invalid cursorDate/cursorId" };
  }

  return { cursorDate: rawDate, cursorId: rawId };
}

export function mapTimelineItem(row, highlightByProgramDayId) {
  const programDayId = asString(row.program_day_id);
  const highlightRow = highlightByProgramDayId.get(programDayId) ?? null;

  return {
    programDayId,
    programId: asString(row.program_id),
    scheduledDate: asString(row.scheduled_date),
    dayLabel: asString(row.day_label),
    dayType: asString(row.day_type),
    durationMins: toFiniteNumber(row.session_duration_mins, 0),
    heroMediaId: asNullableString(row.hero_media_id),
    highlight: mapHighlight(highlightRow),
  };
}

function buildNextCursor(items, limit) {
  if (items.length !== limit) return null;
  const last = items[items.length - 1];
  if (!last?.scheduledDate || !last?.programDayId) return null;
  return {
    cursorDate: last.scheduledDate,
    cursorId: last.programDayId,
  };
}

function toAuthUserId(req) {
  return (
    req.auth?.user_id ??
    req.auth?.userId ??
    (typeof req.headers?.["x-user-id"] === "string" ? req.headers["x-user-id"] : undefined)
  );
}

export function createHistoryTimelineHandler(db = pool) {
  return async function historyTimelineHandler(req, res) {
    const authUserId = toAuthUserId(req);
    if (!authUserId) {
      return res.status(401).json({
        ok: false,
        code: "unauthorized",
        error: "Missing authenticated user context",
      });
    }

    const limit = clampTimelineLimit(req.query?.limit);
    const parsedCursor = parseTimelineCursor(req.query);
    if ("error" in parsedCursor) {
      return res.status(400).json({
        ok: false,
        code: "validation_error",
        error: parsedCursor.error,
      });
    }

    const { cursorDate, cursorId } = parsedCursor;

    try {
      const timelineResult = await db.query(SQL_HISTORY_TIMELINE, [authUserId, limit, cursorDate, cursorId]);
      const timelineRows = timelineResult.rows ?? [];
      const programDayIds = timelineRows.map((row) => row.program_day_id).filter(Boolean);

      let highlightByProgramDayId = new Map();
      if (programDayIds.length > 0) {
        const highlightResult = await db.query(SQL_HISTORY_HIGHLIGHTS, [programDayIds]);
        highlightByProgramDayId = new Map(
          (highlightResult.rows ?? []).map((row) => [
            asString(row.program_day_id),
            row,
          ]),
        );
      }

      const items = timelineRows.map((row) => mapTimelineItem(row, highlightByProgramDayId));
      return res.status(200).json({
        items,
        nextCursor: buildNextCursor(items, limit),
      });
    } catch (error) {
      req.log.error({ event: "history.timeline.error", err: error?.message }, "history-timeline query failed");
      return res.status(500).json({
        ok: false,
        code: "internal_error",
        error: "Failed to load timeline",
      });
    }
  };
}

export const historyTimelineRouter = express.Router();

historyTimelineRouter.get(
  "/v1/history/timeline",
  ...userAuth,
  createHistoryTimelineHandler(pool),
);

