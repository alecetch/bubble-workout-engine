import express from "express";
import { pool } from "../db.js";
import { userAuth } from "../middleware/chains.js";
import { safeString } from "../utils/validate.js";

export const activeProgramsRouter = express.Router();

function asString(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function toFinite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidDate(value) {
  return ISO_DATE_RE.test(value) && !Number.isNaN(Date.parse(value));
}

export function createActiveProgramsHandlers(db = pool) {
  async function getActivePrograms(req, res) {
    const userId = req.auth?.user_id;
    const today = new Date().toISOString().slice(0, 10);

    try {
      const programsR = await db.query(
        `
        SELECT
          p.id AS program_id,
          p.program_title,
          p.program_type,
          p.is_primary,
          p.status,
          p.weeks_count,
          p.days_per_week,
          p.start_date::text AS start_date,
          p.hero_media_id,
          (
            SELECT COUNT(*)
            FROM program_calendar_day pcd
            WHERE pcd.program_id = p.id
              AND pcd.scheduled_date = $2::date
              AND pcd.is_training_day = TRUE
          )::int AS today_session_count,
          (
            SELECT MIN(pcd2.scheduled_date)::text
            FROM program_calendar_day pcd2
            WHERE pcd2.program_id = p.id
              AND pcd2.scheduled_date >= $2::date
              AND pcd2.is_training_day = TRUE
          ) AS next_session_date
        FROM program p
        WHERE p.user_id = $1
          AND p.status = 'active'
          AND p.is_ready = TRUE
        ORDER BY p.is_primary DESC, p.created_at ASC
        `,
        [userId, today],
      );

      const todayR = await db.query(
        `
        SELECT
          p.id AS program_id,
          pd.id AS program_day_id,
          p.program_title,
          p.program_type,
          pd.day_label,
          pcd.scheduled_date::text AS scheduled_date
        FROM program_calendar_day pcd
        JOIN program p
          ON p.id = pcd.program_id
        JOIN program_day pd
          ON pd.id = pcd.program_day_id
        WHERE pcd.user_id = $1
          AND pcd.scheduled_date = $2::date
          AND pcd.is_training_day = TRUE
          AND p.status = 'active'
          AND p.is_ready = TRUE
        ORDER BY p.is_primary DESC, p.program_type, p.program_title
        `,
        [userId, today],
      );

      const primaryRow = programsR.rows.find((row) => row.is_primary);

      return res.json({
        ok: true,
        primary_program_id: primaryRow ? asString(primaryRow.program_id) : null,
        programs: programsR.rows.map((row) => ({
          program_id: asString(row.program_id),
          program_title: asString(row.program_title),
          program_type: asString(row.program_type),
          is_primary: Boolean(row.is_primary),
          status: asString(row.status),
          weeks_count: toFinite(row.weeks_count),
          days_per_week: toFinite(row.days_per_week),
          start_date: asString(row.start_date),
          hero_media_id: row.hero_media_id == null ? null : asString(row.hero_media_id),
          today_session_count: toFinite(row.today_session_count),
          next_session_date: row.next_session_date == null ? null : asString(row.next_session_date),
        })),
        today_sessions: todayR.rows.map((row) => ({
          program_id: asString(row.program_id),
          program_day_id: asString(row.program_day_id),
          program_title: asString(row.program_title),
          program_type: asString(row.program_type),
          day_label: asString(row.day_label),
          scheduled_date: asString(row.scheduled_date),
        })),
      });
    } catch (err) {
      req.log?.error?.({ event: "activePrograms.error", err: err?.message }, "active programs failed");
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  }

  async function getCombinedCalendar(req, res) {
    const userId = req.auth?.user_id;
    const today = new Date().toISOString().slice(0, 10);
    const defaultTo = new Date(Date.now() + 28 * 86400_000).toISOString().slice(0, 10);
    const fromRaw = safeString(req.query?.from) || today;
    const toRaw = safeString(req.query?.to) || defaultTo;

    if (!isValidDate(fromRaw) || !isValidDate(toRaw)) {
      return res.status(400).json({ ok: false, error: "Invalid date range. Use YYYY-MM-DD." });
    }
    if (fromRaw > toRaw) {
      return res.status(400).json({ ok: false, error: "'from' must not be after 'to'." });
    }

    try {
      const rowsR = await db.query(
        `
        SELECT
          pcd.scheduled_date::text AS scheduled_date,
          p.id AS program_id,
          pd.id AS program_day_id,
          p.program_type,
          p.program_title,
          p.is_primary AS is_primary_program,
          pd.day_label,
          pd.is_completed
        FROM program_calendar_day pcd
        JOIN program p
          ON p.id = pcd.program_id
        JOIN program_day pd
          ON pd.id = pcd.program_day_id
        WHERE pcd.user_id = $1
          AND pcd.scheduled_date BETWEEN $2::date AND $3::date
          AND pcd.is_training_day = TRUE
          AND p.status = 'active'
          AND p.is_ready = TRUE
        ORDER BY pcd.scheduled_date ASC,
                 p.is_primary DESC,
                 p.program_type ASC,
                 p.program_title ASC
        `,
        [userId, fromRaw, toRaw],
      );

      const dateMap = new Map();
      for (const row of rowsR.rows) {
        const date = asString(row.scheduled_date);
        if (!dateMap.has(date)) dateMap.set(date, []);
        dateMap.get(date).push({
          program_id: asString(row.program_id),
          program_day_id: asString(row.program_day_id),
          program_type: asString(row.program_type),
          program_title: asString(row.program_title),
          is_primary_program: Boolean(row.is_primary_program),
          day_label: asString(row.day_label),
          is_completed: Boolean(row.is_completed),
        });
      }

      return res.json({
        ok: true,
        days: [...dateMap.entries()].map(([scheduled_date, sessions]) => ({
          scheduled_date,
          sessions,
        })),
      });
    } catch (err) {
      req.log?.error?.({ event: "calendar.combined.error", err: err?.message }, "combined calendar failed");
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  }

  async function getSessionsByDate(req, res) {
    const userId = req.auth?.user_id;
    const scheduledDate = safeString(req.params?.scheduled_date);
    if (!isValidDate(scheduledDate)) {
      return res.status(400).json({ ok: false, error: "Invalid date. Use YYYY-MM-DD." });
    }

    try {
      const rowsR = await db.query(
        `
        SELECT
          p.id AS program_id,
          pd.id AS program_day_id,
          p.program_title,
          p.program_type,
          p.is_primary AS is_primary_program,
          pd.day_label,
          pd.session_duration_mins,
          pd.is_completed
        FROM program_calendar_day pcd
        JOIN program p
          ON p.id = pcd.program_id
        JOIN program_day pd
          ON pd.id = pcd.program_day_id
        WHERE pcd.user_id = $1
          AND pcd.scheduled_date = $2::date
          AND pcd.is_training_day = TRUE
          AND p.status = 'active'
          AND p.is_ready = TRUE
        ORDER BY p.is_primary DESC, p.program_type, p.program_title
        `,
        [userId, scheduledDate],
      );

      return res.json({
        ok: true,
        scheduled_date: scheduledDate,
        sessions: rowsR.rows.map((row) => ({
          program_id: asString(row.program_id),
          program_day_id: asString(row.program_day_id),
          program_title: asString(row.program_title),
          program_type: asString(row.program_type),
          is_primary_program: Boolean(row.is_primary_program),
          day_label: asString(row.day_label),
          session_duration_mins:
            row.session_duration_mins == null ? null : toFinite(row.session_duration_mins),
          is_completed: Boolean(row.is_completed),
        })),
      });
    } catch (err) {
      req.log?.error?.({ event: "sessions.byDate.error", err: err?.message }, "sessions by date failed");
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  }

  async function setPrimaryProgram(req, res) {
    const userId = req.auth?.user_id;
    const programId = safeString(req.params?.program_id);
    if (!UUID_RE.test(programId)) {
      return res.status(400).json({ ok: false, error: "Invalid program_id." });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      const verifyR = await client.query(
        `SELECT id
         FROM program
         WHERE id = $1
           AND user_id = $2
           AND status = 'active'
           AND is_ready = TRUE`,
        [programId, userId],
      );
      if (verifyR.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ ok: false, error: "Program not found or not active." });
      }

      await client.query(
        `UPDATE program
         SET is_primary = FALSE
         WHERE user_id = $1
           AND is_primary = TRUE
           AND status = 'active'`,
        [userId],
      );
      await client.query(
        `UPDATE program
         SET is_primary = TRUE
         WHERE id = $1`,
        [programId],
      );

      await client.query("COMMIT");
      return res.json({ ok: true, primary_program_id: programId });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback failure
      }
      req.log?.error?.({ event: "program.setPrimary.error", err: err?.message }, "set primary failed");
      return res.status(500).json({ ok: false, error: "internal_error" });
    } finally {
      client.release();
    }
  }

  return { getActivePrograms, getCombinedCalendar, getSessionsByDate, setPrimaryProgram };
}

const handlers = createActiveProgramsHandlers(pool);
activeProgramsRouter.get("/programs/active", ...userAuth, handlers.getActivePrograms);
activeProgramsRouter.get("/calendar/combined", ...userAuth, handlers.getCombinedCalendar);
activeProgramsRouter.get("/sessions/by-date/:scheduled_date", ...userAuth, handlers.getSessionsByDate);
activeProgramsRouter.patch("/program/:program_id/primary", ...userAuth, handlers.setPrimaryProgram);
