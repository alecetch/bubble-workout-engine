import express from "express";
import { pool } from "../db.js";
import { resolveLocalDate, userTrainingContext, rememberTimezone } from "../services/trainingDayLedger.js";
import { firstValidTimezone } from "../utils/timezone.js";
import { getYearProgress } from "../services/yearProgress.js";
import { detectAndRecordMilestones } from "../services/yearMilestones.js";
import { publicInternalError } from "../utils/publicError.js";

const activities = new Set(["run", "cycle", "swim", "class", "hyrox", "sport", "strength_elsewhere", "other"]);
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const fail = (res, code, status = 400) => res.status(status).json({ ok: false, code });
const error = (res, err) => res.status(err.status ?? 500).json({ ok: false, code: err.code ?? "internal_error",
  error: err.status ? err.message : publicInternalError(err) });

export function createTrainingSessionHandlers(db = pool, { now = () => new Date() } = {}) {
  return {
    post: async (req, res) => {
      const userId = req.auth?.user_id;
      if (!userId) return fail(res, "unauthorized", 401);
      const { activity_type, duration_min, local_date, timezone } = req.body ?? {};
      if (!activities.has(activity_type)) return fail(res, "invalid_activity_type");
      if (!Number.isInteger(duration_min) || duration_min < 20 || duration_min > 300) return fail(res, "invalid_duration");
      let client;
      try {
        client = await db.connect();
        await client.query("BEGIN");
        await client.query("SELECT id FROM app_user WHERE id = $1 FOR UPDATE", [userId]);
        const context = await userTrainingContext(client, userId);
        if (!context) { await client.query("ROLLBACK"); return fail(res, "not_found", 404); }
        const clock = now();
        const { localDate, timeZone } = resolveLocalDate({ requestedLocalDate: local_date, requestedTimeZone: timezone,
          fallbackTimeZone: firstValidTimezone(context.timezone, context.reminder_timezone), now: clock });
        const session = (await client.query(`INSERT INTO training_session (user_id,local_date,source,activity_type,duration_min)
          VALUES ($1,$2,'manual',$3,$4)
          ON CONFLICT (user_id,local_date) WHERE source = 'manual'
          DO UPDATE SET activity_type = EXCLUDED.activity_type, duration_min = EXCLUDED.duration_min
          RETURNING id, local_date::text, activity_type, duration_min`, [userId, localDate, activity_type, duration_min])).rows[0];
        await rememberTimezone(client, userId, timeZone);
        const newMilestones = await detectAndRecordMilestones(client, { userId, localDate });
        const progress = await getYearProgress(client, userId, { year: Number(localDate.slice(0, 4)), timeZone, now: clock });
        await client.query("COMMIT");
        return res.status(201).json({ ok: true, session, year_progress: { year: progress.year, count: progress.count, target: progress.target }, new_milestones: newMilestones });
      } catch (err) { if (client) await client.query("ROLLBACK"); return error(res, err); }
      finally { client?.release(); }
    },
    get: async (req, res) => {
      if (!req.auth?.user_id) return fail(res, "unauthorized", 401);
      const { source, year } = req.query;
      if (source !== undefined && source !== "manual") return fail(res, "invalid_source");
      if (year !== undefined && (typeof year !== "string" || !/^\d{4}$/.test(year) || Number(year) < 2000 || Number(year) > now().getUTCFullYear() + 1)) return fail(res, "invalid_year");
      try {
        const result = await db.query(`SELECT id, local_date::text, activity_type, duration_min FROM training_session
          WHERE user_id = $1 AND source = 'manual'
            AND ($2::int IS NULL OR EXTRACT(YEAR FROM local_date) = $2)
          ORDER BY local_date DESC, id`, [req.auth.user_id, year === undefined ? null : Number(year)]);
        return res.json({ ok: true, sessions: result.rows });
      } catch (err) { return error(res, err); }
    },
    delete: async (req, res) => {
      const userId = req.auth?.user_id;
      if (!userId) return fail(res, "unauthorized", 401);
      if (!uuid.test(req.params.id)) return fail(res, "not_found", 404);
      let client;
      try {
        client = await db.connect();
        await client.query("BEGIN");
        await client.query("SELECT id FROM app_user WHERE id = $1 FOR UPDATE", [userId]);
        const result = await client.query("DELETE FROM training_session WHERE id = $1 AND user_id = $2 AND source = 'manual' RETURNING id", [req.params.id, userId]);
        await client.query("COMMIT");
        return result.rows.length ? res.status(204).end() : fail(res, "not_found", 404);
      } catch (err) { if (client) await client.query("ROLLBACK"); return error(res, err); }
      finally { client?.release(); }
    },
  };
}

export const trainingSessionsRouter = express.Router();
const handlers = createTrainingSessionHandlers();
trainingSessionsRouter.post("/users/me/training-sessions", handlers.post);
trainingSessionsRouter.get("/users/me/training-sessions", handlers.get);
trainingSessionsRouter.delete("/users/me/training-sessions/:id", handlers.delete);
